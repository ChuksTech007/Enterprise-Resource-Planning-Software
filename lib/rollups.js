import mongoose from 'mongoose';
import { Sale, Payment, Customer, Job } from './models.js';
import { money } from './util.js';
import { postSafely, unpost } from './accounting/ledger.js';
import { postingsForSale } from './accounting/postings.js';

/**
 * Recompute a sale's paid amount, balance and status from its payments.
 * Payments are the source of truth; the fields on the sale are a cache so
 * that debtor lists and receipts do not have to aggregate on every read.
 */
export async function recalcSale(saleId) {
  const sale = await Sale.findById(saleId);
  if (!sale) return null;

  const [agg] = await Payment.aggregate([
    { $match: { sale: sale._id, voided: false } },
    { $group: { _id: null, paid: { $sum: '$amount' } } },
  ]);

  const paid = money(agg?.paid || 0);
  sale.amountPaid = paid;
  sale.balance = money(sale.total - paid);

  if (sale.voided) {
    sale.status = 'refunded';
  } else if (sale.total <= 0) {
    sale.status = 'paid';
  } else if (paid <= 0) {
    sale.status = 'unpaid';
  } else if (sale.balance <= 0.009) {
    // Tolerate sub-kobo float dust so a fully paid invoice never sticks
    // at "partial" because of a rounding remainder.
    sale.status = 'paid';
  } else {
    sale.status = 'partial';
  }

  await sale.save();

  // Keep the ledger in step with the invoice. A voided sale has its entry
  // removed; a re-priced one is re-posted at the new value.
  if (sale.voided) {
    await unpost(`sale:${sale._id}`);
  } else {
    await unpost(`sale:${sale._id}`);
    await postSafely(postingsForSale(sale.toObject ? sale.toObject() : sale));
  }

  if (sale.customer) await recalcCustomer(sale.customer);
  return sale;
}

/** Recompute a customer's lifetime totals and what they currently owe. */
export async function recalcCustomer(customerId) {
  if (!customerId) return null;

  const [agg] = await Sale.aggregate([
    { $match: { customer: toId(customerId), voided: false } },
    {
      $group: {
        _id: null,
        billed: { $sum: '$total' },
        paid: { $sum: '$amountPaid' },
        // Credit balances (overpayments) must not cancel out other debts.
        outstanding: { $sum: { $max: ['$balance', 0] } },
      },
    },
  ]);

  const jobCount = await Job.countDocuments({ customer: customerId, status: { $ne: 'cancelled' } });
  const lastJob = await Job.findOne({ customer: customerId }).sort({ createdAt: -1 }).select('createdAt').lean();

  await Customer.findByIdAndUpdate(customerId, {
    totalBilled: money(agg?.billed || 0),
    totalPaid: money(agg?.paid || 0),
    outstanding: money(agg?.outstanding || 0),
    jobCount,
    lastJobAt: lastJob?.createdAt,
  });
}

function toId(v) {
  return typeof v === 'string' ? new mongoose.Types.ObjectId(v) : v;
}
