import { route, notFound, bad } from '@/lib/http';
import { Expense, EXPENSE_CATEGORIES } from '@/lib/models';
import { logAction } from '@/lib/audit';
import { money } from '@/lib/util';

export const dynamic = 'force-dynamic';

export const PATCH = route(
  async ({ params, body, user, req }) => {
    const expense = await Expense.findById(params.id);
    if (!expense) throw notFound('Expense not found');

    if (body.category !== undefined) {
      if (!EXPENSE_CATEGORIES.includes(body.category)) throw bad('Choose a valid category');
      expense.category = body.category;
    }
    if (body.description !== undefined) expense.description = body.description.trim();
    if (body.amount !== undefined) expense.amount = money(body.amount);
    if (body.date !== undefined) expense.date = new Date(body.date);
    if (body.notes !== undefined) expense.notes = body.notes;

    await expense.save();

    await logAction(user, 'expense.update', {
      entity: 'Expense',
      entityId: expense._id,
      label: `Edited expense "${expense.description}" (${expense.amount})`,
      req,
    });

    return { expense: expense.toObject() };
  },
  { role: 'owner' }
);

export const DELETE = route(
  async ({ params, user, req }) => {
    const expense = await Expense.findById(params.id);
    if (!expense) throw notFound('Expense not found');

    // Deleting a till expense would change a closed shift's expected cash
    // after the fact, so it is refused.
    if (expense.paidFromTill && expense.registerSession) {
      throw bad('This was paid out of a till. It cannot be deleted, because the shift was balanced against it.');
    }

    await expense.deleteOne();

    await logAction(user, 'expense.delete', {
      entity: 'Expense',
      entityId: params.id,
      label: `Deleted expense "${expense.description}" (${expense.amount})`,
      details: { amount: expense.amount, category: expense.category },
      req,
    });

    return { ok: true };
  },
  { role: 'owner' }
);
