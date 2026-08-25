import { Payment, Expense, SupplierPayment } from './models.js';
import { money } from './util.js';

/**
 * Money in, money out, and what is left.
 *
 * The question an owner actually asks, and the one the accounts answer least
 * plainly. Profit is not it: profit counts work sold whether or not anybody
 * has paid for it, and a shop can be profitable on paper with an empty
 * drawer. This counts money that MOVED.
 *
 * In   — every payment taken, less refunds handed back
 * Out  — running costs, and what has been paid to suppliers
 * Left — the difference: what the business actually kept
 *
 * Deliberately not the same as the till. The till is one drawer on one
 * counter and is reconciled against physical cash; this is every naira
 * through the business by every method, which is why transfers and POS
 * appear here and never in a cash count.
 */
export async function moneyPosition({ from, to } = {}) {
  /* No range means everything, which is what "how much have I made" means
   * when nobody has said a period. */
  const range = from || to ? { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } : null;
  const on = (field) => (range ? { [field]: range } : {});

  const [paymentAgg, expenseAgg, supplierAgg] = await Promise.all([
    /* Refunds are stored as negative amounts, so summing by method nets them
     * off exactly where they happened rather than needing a separate
     * subtraction that someone will forget. */
    Payment.aggregate([
      { $match: { voided: false, ...on('createdAt') } },
      { $group: { _id: { method: '$method', refund: '$isRefund' }, total: { $sum: '$amount' }, n: { $sum: 1 } } },
    ]),
    Expense.aggregate([
      { $match: on('date') },
      { $group: { _id: '$category', total: { $sum: '$amount' }, n: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
    SupplierPayment.aggregate([
      { $match: on('createdAt') },
      { $group: { _id: null, total: { $sum: '$amount' }, n: { $sum: 1 } } },
    ]),
  ]);

  const byMethod = { cash: 0, transfer: 0, pos: 0, online: 0 };
  let refunds = 0;
  let takings = 0;
  let paymentCount = 0;

  for (const row of paymentAgg) {
    const amount = money(row.total);
    byMethod[row._id.method] = money((byMethod[row._id.method] || 0) + amount);
    if (row._id.refund) refunds = money(refunds + Math.abs(amount));
    else {
      takings = money(takings + amount);
      paymentCount += row.n;
    }
  }

  const received = money(Object.values(byMethod).reduce((a, b) => a + b, 0));
  const expenses = money(expenseAgg.reduce((s, e) => s + e.total, 0));
  const toSuppliers = money(supplierAgg[0]?.total || 0);
  const paidOut = money(expenses + toSuppliers);

  return {
    from: from || null,
    to: to || null,
    allTime: !from && !to,

    in: {
      takings,
      refunds,
      /* What actually came in: takings less anything handed back. */
      net: received,
      count: paymentCount,
      byMethod,
    },

    out: {
      expenses,
      toSuppliers,
      total: paidOut,
      byCategory: expenseAgg.map((e) => ({
        category: e._id || 'Other',
        total: money(e.total),
        count: e.n,
      })),
      supplierCount: supplierAgg[0]?.n || 0,
    },

    /* The figure the whole screen exists for. */
    left: money(received - paidOut),
  };
}
