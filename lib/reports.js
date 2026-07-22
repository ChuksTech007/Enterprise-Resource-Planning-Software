import { Sale, Payment, Job, StockMovement, Customer, RegisterSession, Expense } from './models.js';
import { money, APP_TZ } from './util.js';

/**
 * Build the full picture for a date range.
 *
 * Two different notions of "sales" live in a print shop and confusing them is
 * how owners end up mistrusting a system:
 *   - `billed`    — the value of invoices raised in the period (work sold)
 *   - `collected` — money actually received in the period (cash that moved)
 * They differ whenever someone pays a deposit now and the balance next week.
 * Both are reported, side by side, and always labelled.
 */
export async function buildReport({ from, to }) {
  const range = { $gte: from, $lte: to };

  const [
    salesAgg,
    methodAgg,
    dailyAgg,
    jobTypeAgg,
    jobStatusAgg,
    topCustomersAgg,
    stockUsedAgg,
    wastageAgg,
    staffPaymentsAgg,
    staffJobsAgg,
    outstandingAgg,
    registerAgg,
    refundAgg,
    expenseAgg,
  ] = await Promise.all([
    // Invoices raised in the period.
    Sale.aggregate([
      { $match: { createdAt: range, voided: false } },
      {
        $group: {
          _id: null,
          billed: { $sum: '$total' },
          discount: { $sum: '$discount' },
          materialCost: { $sum: '$materialCost' },
          count: { $sum: 1 },
        },
      },
    ]),

    // Money received in the period, split by how it came in.
    Payment.aggregate([
      { $match: { createdAt: range, voided: false } },
      { $group: { _id: '$method', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),

    // Day-by-day money in, for the trend line.
    Payment.aggregate([
      { $match: { createdAt: range, voided: false } },
      {
        $group: {
          // Grouped in the shop's timezone, so a day's bar covers the shop's
          // day rather than the database server's.
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: APP_TZ } },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    // Best-selling job types, by value of work sold.
    // Unwound over the item list, so an order containing flyers AND a banner
    // credits both — grouping on the job's headline type alone would hide
    // everything after the first product on every mixed order.
    Job.aggregate([
      { $match: { createdAt: range, status: { $ne: 'cancelled' } } },
      {
        $project: {
          items: {
            $cond: [
              { $gt: [{ $size: { $ifNull: ['$items', []] } }, 0] },
              '$items',
              // Fall back to the job's own fields if it has no item list.
              [{ jobType: '$jobType', quantity: '$quantity', total: { $subtract: ['$price', '$discount'] } }],
            ],
          },
        },
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.jobType',
          value: { $sum: '$items.total' },
          count: { $sum: 1 },
          units: { $sum: '$items.quantity' },
        },
      },
      { $sort: { value: -1 } },
    ]),

    Job.aggregate([
      { $match: { createdAt: range } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),

    // Top customers by money actually received from them.
    Payment.aggregate([
      { $match: { createdAt: range, voided: false, isRefund: false } },
      { $group: { _id: { id: '$customer', name: '$customerName' }, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 10 },
    ]),

    // Stock consumed on jobs.
    StockMovement.aggregate([
      { $match: { createdAt: range, type: 'used' } },
      {
        $group: {
          _id: { id: '$material', name: '$materialName', unit: '$unit' },
          quantity: { $sum: '$quantity' },
          value: { $sum: { $multiply: ['$quantity', '$unitCost'] } },
        },
      },
      { $sort: { value: -1 } },
      { $limit: 20 },
    ]),

    // Wastage and damage — money that leaked.
    StockMovement.aggregate([
      { $match: { createdAt: range, type: { $in: ['wastage', 'damage'] } } },
      {
        $group: {
          _id: { id: '$material', name: '$materialName', unit: '$unit', type: '$type' },
          quantity: { $sum: '$quantity' },
          value: { $sum: { $multiply: ['$quantity', '$unitCost'] } },
        },
      },
      { $sort: { value: -1 } },
    ]),

    // Per-staff: money taken.
    Payment.aggregate([
      { $match: { createdAt: range, voided: false } },
      {
        $group: {
          _id: { id: '$receivedBy', name: '$receivedByName' },
          collected: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { collected: -1 } },
    ]),

    // Per-staff: jobs handled.
    Job.aggregate([
      { $match: { createdAt: range, status: { $ne: 'cancelled' } } },
      {
        $group: {
          _id: { id: '$createdBy', name: '$createdByName' },
          jobs: { $sum: 1 },
          value: { $sum: { $subtract: ['$price', '$discount'] } },
        },
      },
      { $sort: { value: -1 } },
    ]),

    // What is owed right now — deliberately NOT limited to the range, because
    // "who owes me money" is always a question about today.
    Sale.aggregate([
      { $match: { voided: false, balance: { $gt: 0 } } },
      { $group: { _id: null, owed: { $sum: '$balance' }, count: { $sum: 1 } } },
    ]),

    // Till variances in the period.
    RegisterSession.aggregate([
      { $match: { closedAt: range, status: 'closed' } },
      {
        $group: {
          _id: null,
          shortfall: { $sum: { $cond: [{ $lt: ['$variance', 0] }, '$variance', 0] } },
          over: { $sum: { $cond: [{ $gt: ['$variance', 0] }, '$variance', 0] } },
          sessions: { $sum: 1 },
        },
      },
    ]),

    Payment.aggregate([
      { $match: { createdAt: range, voided: false, isRefund: true } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),

    // Running costs in the period — diesel, rent, salaries, transport.
    Expense.aggregate([
      { $match: { date: range } },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
  ]);

  const byMethod = { cash: 0, transfer: 0, pos: 0, online: 0 };
  for (const m of methodAgg) byMethod[m._id] = money(m.total);

  const collected = money(Object.values(byMethod).reduce((a, b) => a + b, 0));
  const billed = money(salesAgg[0]?.billed || 0);
  const materialCost = money(salesAgg[0]?.materialCost || 0);
  const wastageValue = money(wastageAgg.reduce((s, w) => s + w.value, 0));

  const jobStatus = Object.fromEntries(jobStatusAgg.map((j) => [j._id, j.count]));
  const jobsCompleted = (jobStatus.done || 0) + (jobStatus.delivered || 0);

  const expenses = money(expenseAgg.reduce((s, e) => s + e.total, 0));

  // Two different figures, and conflating them is how an owner ends up
  // thinking the business made more than it did:
  //   grossMargin — what the work earned after the stock it consumed
  //   netProfit   — what is actually left after running the place
  const grossMargin = money(billed - materialCost - wastageValue);
  const netProfit = money(grossMargin - expenses);

  return {
    range: { from, to },

    summary: {
      billed,
      collected,
      discount: money(salesAgg[0]?.discount || 0),
      invoiceCount: salesAgg[0]?.count || 0,
      // Counted from job statuses, not from jobTypeAgg — that one is unwound
      // over items, so its counts are products, not orders.
      jobsCreated: jobStatusAgg.reduce((s, j) => (j._id === 'cancelled' ? s : s + j.count), 0),
      jobsCompleted,
      outstanding: money(outstandingAgg[0]?.owed || 0),
      outstandingCount: outstandingAgg[0]?.count || 0,
      refunds: money(Math.abs(refundAgg[0]?.total || 0)),
      refundCount: refundAgg[0]?.count || 0,
      // Owner-only figures. scrubCosts() removes these for cashiers.
      materialCost,
      wastageValue,
      expenses,
      grossMargin,
      netProfit,
    },

    expensesByCategory: expenseAgg.map((e) => ({
      category: e._id || 'Other',
      total: money(e.total),
      count: e.count,
    })),

    byMethod,

    daily: dailyAgg.map((d) => ({ date: d._id, total: money(d.total), count: d.count })),

    // `count` here is how many times this type appeared as an item on an
    // order, not how many orders there were.
    jobTypes: jobTypeAgg.map((j) => ({
      jobType: j._id || 'Other',
      value: money(j.value),
      count: j.count,
      units: j.units,
    })),

    jobStatus,

    topCustomers: topCustomersAgg.map((c) => ({
      id: c._id.id ? String(c._id.id) : null,
      name: c._id.name || 'Walk-in customer',
      total: money(c.total),
      count: c.count,
    })),

    stockUsed: stockUsedAgg.map((s) => ({
      id: String(s._id.id),
      name: s._id.name,
      unit: s._id.unit,
      quantity: money(s.quantity),
      totalCost: money(s.value),
    })),

    wastage: wastageAgg.map((w) => ({
      id: String(w._id.id),
      name: w._id.name,
      unit: w._id.unit,
      type: w._id.type,
      quantity: money(w.quantity),
      totalCost: money(w.value),
    })),

    staff: mergeStaff(staffPaymentsAgg, staffJobsAgg),

    register: {
      sessions: registerAgg[0]?.sessions || 0,
      shortfall: money(Math.abs(registerAgg[0]?.shortfall || 0)),
      over: money(registerAgg[0]?.over || 0),
    },
  };
}

function mergeStaff(payments, jobs) {
  const map = new Map();

  for (const p of payments) {
    const key = p._id.id ? String(p._id.id) : p._id.name || 'unknown';
    map.set(key, {
      id: p._id.id ? String(p._id.id) : null,
      name: p._id.name || 'Unknown',
      collected: money(p.collected),
      payments: p.count,
      jobs: 0,
      jobValue: 0,
    });
  }

  for (const j of jobs) {
    const key = j._id.id ? String(j._id.id) : j._id.name || 'unknown';
    const existing = map.get(key) || {
      id: j._id.id ? String(j._id.id) : null,
      name: j._id.name || 'Unknown',
      collected: 0,
      payments: 0,
      jobs: 0,
      jobValue: 0,
    };
    existing.jobs = j.jobs;
    existing.jobValue = money(j.value);
    map.set(key, existing);
  }

  return [...map.values()].sort((a, b) => b.collected - a.collected);
}

/** Everyone who currently owes money, worst first. */
export async function debtorList() {
  const sales = await Sale.find({ voided: false, balance: { $gt: 0 } })
    .sort({ balance: -1 })
    .limit(300)
    .lean();

  const customers = await Customer.find({ outstanding: { $gt: 0 } })
    .sort({ outstanding: -1 })
    .limit(300)
    .lean();

  const now = Date.now();
  return {
    invoices: sales.map((s) => ({
      ...s,
      ageDays: Math.floor((now - new Date(s.createdAt).getTime()) / 86400000),
      overdue: s.dueDate ? new Date(s.dueDate).getTime() < now : false,
    })),
    customers,
    total: money(sales.reduce((sum, s) => sum + s.balance, 0)),
  };
}
