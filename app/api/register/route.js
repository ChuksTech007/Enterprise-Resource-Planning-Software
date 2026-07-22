import { route, bad, notFound } from '@/lib/http';
import { RegisterSession, Payment, Expense } from '@/lib/models';
import { logAction } from '@/lib/audit';
import { postSafely } from '@/lib/accounting/ledger';
import { postingsForRegisterClose } from '@/lib/accounting/postings';
import { money, num } from '@/lib/util';

export const dynamic = 'force-dynamic';

/** Live totals for one shift, straight from what was recorded against it. */
async function shiftTotals(sessionId) {
  const [rows, cashOutAgg] = await Promise.all([
    Payment.aggregate([
      { $match: { registerSession: sessionId, voided: false } },
      { $group: { _id: { method: '$method', refund: '$isRefund' }, total: { $sum: '$amount' }, n: { $sum: 1 } } },
    ]),
    // Petty cash spent out of the drawer during this shift.
    Expense.aggregate([
      { $match: { registerSession: sessionId, paidFromTill: true } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  const totals = { cash: 0, transfer: 0, pos: 0, online: 0, refunds: 0, cashOut: 0 };
  let count = 0;

  for (const r of rows) {
    count += r.n;
    if (r._id.refund) totals.refunds += Math.abs(r.total);
    // Refund amounts are negative, so adding them here nets the method down
    // correctly — a cash refund reduces the cash the cashier should hold.
    totals[r._id.method] = money((totals[r._id.method] || 0) + r.total);
  }

  totals.refunds = money(totals.refunds);
  totals.cashOut = money(cashOutAgg[0]?.total || 0);
  return { totals, count };
}

export const GET = route(async ({ user, query }) => {
  const open = await RegisterSession.findOne({ user: user._id, status: 'open' }).lean();

  let live = null;
  if (open) {
    const { totals, count } = await shiftTotals(open._id);
    live = {
      totals,
      salesCount: count,
      // float + cash taken − cash spent out of the drawer
      expectedCash: money(open.openingFloat + totals.cash - totals.cashOut),
    };
  }

  // Cashiers see only their own history; the owner sees every till.
  const historyFilter = user.role === 'owner' ? { status: 'closed' } : { user: user._id, status: 'closed' };
  const history = await RegisterSession.find(historyFilter)
    .sort({ closedAt: -1 })
    .limit(num(query.limit, 30))
    .lean();

  return { open, live, history, isOwner: user.role === 'owner' };
});

/** Open the till for this shift. */
export const POST = route(async ({ body, user, req }) => {
  const existing = await RegisterSession.findOne({ user: user._id, status: 'open' });
  if (existing) throw bad('Your till is already open');

  const session = await RegisterSession.create({
    user: user._id,
    userName: user.name,
    openingFloat: money(body.openingFloat),
    openedAt: new Date(),
  });

  await logAction(user, 'register.open', {
    entity: 'RegisterSession',
    entityId: session._id,
    label: `${user.name} opened till with float ${session.openingFloat}`,
    req,
  });

  return { session: session.toObject() };
});

/**
 * Close the till. The cashier enters what is physically in the drawer; the
 * system says what should be there. The difference is the whole point — it is
 * stored as a snapshot so it cannot be quietly rewritten later.
 */
export const PUT = route(async ({ body, user, req }) => {
  const session = await RegisterSession.findOne({ user: user._id, status: 'open' });
  if (!session) throw notFound('You do not have an open till');
  if (body.countedCash === undefined || body.countedCash === '') {
    throw bad('Count the cash in the drawer and enter the amount');
  }

  const { totals, count } = await shiftTotals(session._id);
  const expected = money(session.openingFloat + totals.cash - totals.cashOut);
  const counted = money(body.countedCash);
  const variance = money(counted - expected);

  // A shortfall has to be explained. That single rule is what turns this
  // from a form into a control.
  if (Math.abs(variance) >= 1 && !body.notes?.trim()) {
    throw bad(
      `The drawer is ${variance < 0 ? 'short' : 'over'} by ${Math.abs(variance)}. Add a note explaining it before closing.`
    );
  }

  session.closedAt = new Date();
  session.expectedCash = expected;
  session.countedCash = counted;
  session.variance = variance;
  session.totals = totals;
  session.salesCount = count;
  session.notes = body.notes?.trim();
  session.status = 'closed';
  await session.save();

  // A till that did not balance is a real cost (or windfall) and belongs in
  // the accounts by name, not buried in a note.
  await postSafely(postingsForRegisterClose(session.toObject()));

  await logAction(user, 'register.close', {
    entity: 'RegisterSession',
    entityId: session._id,
    label:
      `${user.name} closed till — expected ${expected}, counted ${counted}` +
      (variance === 0 ? ' (balanced)' : `, ${variance < 0 ? 'short' : 'over'} ${Math.abs(variance)}`),
    details: { expected, counted, variance, totals },
    req,
  });

  return { session: session.toObject() };
});
