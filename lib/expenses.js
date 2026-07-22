import { Expense, RegisterSession, EXPENSE_CATEGORIES, PAYMENT_METHODS } from './models.js';
import { money } from './util.js';
import { bad } from './errors.js';
import { postSafely } from './accounting/ledger.js';
import { postingsForExpense } from './accounting/postings.js';

/**
 * Record a running cost.
 *
 * This lives here rather than in the API route so that the ledger posting can
 * never be skipped by a code path that creates an expense some other way. The
 * rule generally: anything that moves money owns its own bookkeeping.
 */
export async function recordExpense({
  amount,
  category,
  description,
  paymentMethod = 'cash',
  date,
  paidFromTill = false,
  supplier,
  staff,
  staffName,
  notes,
  clientRef,
  user,
}) {
  const value = money(amount);
  if (!(value > 0)) throw bad('Enter an amount');
  if (!EXPENSE_CATEGORIES.includes(category)) throw bad('Choose a category');
  if (!description?.trim()) throw bad('Say what the money was spent on');

  let session = null;
  if (paidFromTill) {
    session = await RegisterSession.findOne({ user: user._id, status: 'open' });
    if (!session) throw bad('Your till is not open, so money cannot be recorded as coming out of it.');
  }

  const expense = await Expense.create({
    date: date ? new Date(date) : new Date(),
    category,
    description: description.trim(),
    amount: value,
    paymentMethod: PAYMENT_METHODS.includes(paymentMethod) ? paymentMethod : 'cash',
    supplier: supplier || undefined,
    paidFromTill,
    registerSession: session?._id,
    staff: staff || undefined,
    staffName,
    notes: notes?.trim(),
    clientRef,
    recordedBy: user._id,
    recordedByName: user.name,
  });

  await postSafely(postingsForExpense(expense.toObject()));

  return expense;
}
