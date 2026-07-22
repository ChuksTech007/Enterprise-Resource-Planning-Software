import { Sale, Payment, RegisterSession, PAYMENT_METHODS } from './models.js';
import { nextInvoiceNumber } from './numbering.js';
import { recalcSale } from './rollups.js';
import { jobMaterialCost } from './stock.js';
import { money } from './util.js';
import { describeItem } from './jobs.js';
import { bad, ApiError } from './errors.js';
import { postSafely } from './accounting/ledger.js';
import { postingsForPayment } from './accounting/postings.js';

/**
 * Every job that is a real order gets exactly one invoice. Called when a job
 * is created as an order, and again whenever its price changes, so the
 * invoice and the job can never disagree about what is owed.
 */
export async function ensureSaleForJob(job, user) {
  const total = money((job.price || 0) - (job.discount || 0));

  // One invoice line per product on the order, so the customer's receipt
  // itemises what they actually bought instead of one lumped total.
  const lines = (job.items?.length ? job.items : []).map((item) => ({
    description: describeItem(item),
    jobType: item.jobType,
    quantity: item.quantity || 1,
    unitPrice: item.unitPrice || 0,
    total: money(item.total || 0),
    unitCost: 0,
  }));

  if (!lines.length) {
    // A job saved before items existed, or one with no products listed.
    lines.push({
      description:
        [job.jobType, job.description, job.specs?.size, job.specs?.paper].filter(Boolean).join(' · ') || job.jobType,
      jobType: job.jobType,
      quantity: job.quantity || 1,
      unitPrice: job.unitPrice || 0,
      total: money(job.price || 0),
      unitCost: 0,
    });
  }

  let sale = job.sale ? await Sale.findById(job.sale) : null;

  if (!sale) {
    sale = await Sale.create({
      invoiceNumber: await nextInvoiceNumber(),
      type: 'job',
      job: job._id,
      jobNumber: job.jobNumber,
      customer: job.customer,
      customerName: job.customerName || 'Walk-in customer',
      items: lines,
      subtotal: money(job.price || 0),
      discount: money(job.discount || 0),
      total,
      balance: total,
      materialCost: jobMaterialCost(job),
      dueDate: job.deadline,
      createdBy: user?._id,
      createdByName: user?.name,
    });
    job.sale = sale._id;
    await job.save();
    return sale;
  }

  if (sale.voided) return sale;

  sale.items = lines;
  sale.subtotal = money(job.price || 0);
  sale.discount = money(job.discount || 0);
  sale.total = total;
  sale.materialCost = jobMaterialCost(job);
  sale.customer = job.customer;
  sale.customerName = job.customerName;
  sale.dueDate = job.deadline;
  await sale.save();

  // Re-derive balance/status from the payments already taken.
  return recalcSale(sale._id);
}

/**
 * Record one payment against an invoice.
 *
 * Deliberate rules:
 *  - You cannot pay more than is owed. In a print shop the common error is a
 *    trailing zero (50,000 for 5,000); refusing the overpayment catches it at
 *    the counter instead of in next month's reconciliation.
 *  - Cash is tied to the cashier's open register session, which is what makes
 *    the end-of-day count meaningful.
 *  - A reference (transfer/POS/Paystack) is unique across the whole system, so
 *    one online payment cannot be claimed against two different invoices.
 */
export async function recordPayment({
  sale,
  amount,
  method,
  reference,
  note,
  user,
  isDeposit = false,
  clientRef,
  tendered,
}) {
  if (!sale) throw bad('Invoice not found');
  if (sale.voided) throw bad('This invoice was cancelled');
  if (!PAYMENT_METHODS.includes(method)) throw bad('Choose how the customer paid');

  const amt = money(amount);
  if (!(amt > 0)) throw bad('Enter an amount greater than zero');

  const owed = money(sale.total - sale.amountPaid);
  if (owed <= 0) throw bad('This invoice is already fully paid');
  if (amt > owed + 0.01) {
    throw bad(`That is more than the ${money(owed)} still owed on this invoice. Check the amount.`);
  }

  // Non-cash payments carry a reference for reconciliation. Paystack and
  // bank transfers are useless to reconcile without one.
  const ref = String(reference || '').trim();
  if (method !== 'cash' && !ref) {
    throw bad('Enter the payment reference (transfer narration, POS receipt or Paystack reference)');
  }

  // Every payment is tagged to the cashier's open shift so the end-of-day
  // summary can show the full shift, not just its cash. Only cash *requires*
  // an open till, since only cash has to be physically counted back.
  const registerSession = await RegisterSession.findOne({ user: user._id, status: 'open' });
  if (method === 'cash' && !registerSession) {
    throw new ApiError(409, 'Open your till before taking cash — go to Cash-up and enter your opening float.');
  }

  const payment = await Payment.create({
    sale: sale._id,
    invoiceNumber: sale.invoiceNumber,
    job: sale.job,
    customer: sale.customer,
    customerName: sale.customerName,
    amount: amt,
    method,
    reference: ref || undefined,
    isDeposit: isDeposit || (amt < sale.total && sale.amountPaid === 0),
    // Only meaningful for cash, and only when more was handed over than owed.
    tendered: method === 'cash' && money(tendered) > amt ? money(tendered) : undefined,
    changeGiven: method === 'cash' && money(tendered) > amt ? money(money(tendered) - amt) : undefined,
    note: note?.trim(),
    clientRef,
    registerSession: registerSession?._id,
    receivedBy: user._id,
    receivedByName: user.name,
  });

  await postSafely(postingsForPayment(payment.toObject()));

  const updated = await recalcSale(sale._id);
  return { payment, sale: updated };
}

/** Reverse money to a customer. Owner-only at the route layer. */
export async function recordRefund({ sale, amount, method, reason, user }) {
  if (!sale) throw bad('Invoice not found');
  const amt = money(amount);
  if (!(amt > 0)) throw bad('Enter a refund amount');
  if (amt > sale.amountPaid + 0.01) {
    throw bad(`You can only refund up to ${money(sale.amountPaid)}, which is what has been paid.`);
  }
  if (!reason?.trim()) throw bad('Say why this is being refunded');

  let registerSession = null;
  if (method === 'cash') {
    registerSession = await RegisterSession.findOne({ user: user._id, status: 'open' });
  }

  const payment = await Payment.create({
    sale: sale._id,
    invoiceNumber: sale.invoiceNumber,
    job: sale.job,
    customer: sale.customer,
    customerName: sale.customerName,
    amount: -amt, // negative, so every total that sums payments nets correctly
    method,
    isRefund: true,
    note: reason.trim(),
    registerSession: registerSession?._id,
    receivedBy: user._id,
    receivedByName: user.name,
  });

  await postSafely(postingsForPayment(payment.toObject()));

  const updated = await recalcSale(sale._id);
  return { payment, sale: updated };
}
