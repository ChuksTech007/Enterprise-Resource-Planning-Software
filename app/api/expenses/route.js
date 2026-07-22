import { route } from '@/lib/http';
import { Expense, EXPENSE_CATEGORIES, PAYMENT_METHODS } from '@/lib/models';
import { recordExpense } from '@/lib/expenses';
import { logAction } from '@/lib/audit';
import { money, num, resolveRange } from '@/lib/util';

export const dynamic = 'force-dynamic';

// Owner-only: expense totals are cost data, and the whole point of the role
// split is that a cashier never sees what the business spends.
export const GET = route(
  async ({ query }) => {
    const filter = {};
    if (query.category && query.category !== 'all') filter.category = query.category;

    const range = resolveRange(query);
    filter.date = { $gte: range.from, $lte: range.to };

    const expenses = await Expense.find(filter).sort({ date: -1 }).limit(num(query.limit, 300)).lean();

    const byCategory = await Expense.aggregate([
      { $match: filter },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]);

    return {
      expenses,
      byCategory: byCategory.map((c) => ({ category: c._id, total: money(c.total), count: c.count })),
      total: money(byCategory.reduce((s, c) => s + c.total, 0)),
      categories: EXPENSE_CATEGORIES,
      methods: PAYMENT_METHODS,
      label: range.label,
    };
  },
  { role: 'owner' }
);

/**
 * Recording is open to any signed-in user, unlike viewing.
 *
 * A cashier who buys diesel with money from the drawer has to be able to say
 * so, otherwise the till comes up short at closing and gets treated as a
 * shortfall. They can log what left the till; only the owner sees the totals.
 */
export const POST = route(async ({ body, user, req }) => {
  // Replay of an offline-queued expense that already landed.
  if (body.clientRef) {
    const existing = await Expense.findOne({ clientRef: body.clientRef }).lean();
    if (existing) return { expense: existing, duplicate: true };
  }

  // The bookkeeping lives with the operation, in lib/expenses.js, so it can
  // never be skipped by a different code path.
  const expense = await recordExpense({ ...body, user });

  await logAction(user, 'expense.create', {
    entity: 'Expense',
    entityId: expense._id,
    label: `${expense.category}: ${expense.amount} — ${expense.description}${
      expense.paidFromTill ? ' (from till)' : ''
    }`,
    details: { amount: expense.amount, category: expense.category, paidFromTill: expense.paidFromTill },
    req,
  });

  return { expense: expense.toObject() };
});
