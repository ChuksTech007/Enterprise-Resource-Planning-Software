import { route, scrubCosts, bad } from '@/lib/http';
import { Payment, Sale, PAYMENT_METHODS } from '@/lib/models';
import { recordPayment } from '@/lib/invoicing';
import { logAction } from '@/lib/audit';
import { num, resolveRange } from '@/lib/util';

export const dynamic = 'force-dynamic';

export const GET = route(async ({ query, user }) => {
  const filter = { voided: false };
  if (query.method && query.method !== 'all') filter.method = query.method;
  if (query.sale) filter.sale = query.sale;
  if (query.customer) filter.customer = query.customer;
  if (query.receivedBy) filter.receivedBy = query.receivedBy;
  if (query.session) filter.registerSession = query.session;
  if (query.refunds === '1') filter.isRefund = true;

  if (query.period || query.from || query.to) {
    const { from, to } = resolveRange(query);
    filter.createdAt = { $gte: from, $lte: to };
  }

  const payments = await Payment.find(filter).sort({ createdAt: -1 }).limit(num(query.limit, 300)).lean();

  const byMethod = await Payment.aggregate([
    { $match: filter },
    { $group: { _id: '$method', total: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);

  return scrubCosts(
    {
      payments,
      byMethod: Object.fromEntries(byMethod.map((m) => [m._id, { total: m.total, count: m.count }])),
      methods: PAYMENT_METHODS,
    },
    user
  );
});

/** Take a payment (or the balance) against an existing invoice. */
export const POST = route(async ({ body, user, req }) => {
  if (!body.saleId) throw bad('Which invoice is this payment for?');

  // Replay of an offline-queued payment that already landed. Taking the same
  // money twice is the worst thing this app could do, so it is checked first.
  if (body.clientRef) {
    const existing = await Payment.findOne({ clientRef: body.clientRef }).lean();
    if (existing) {
      const sale = await Sale.findById(existing.sale).lean();
      return scrubCosts({ payment: existing, sale, duplicate: true }, user);
    }
  }

  const sale = await Sale.findById(body.saleId);
  if (!sale) throw bad('Invoice not found');

  const { payment, sale: updated } = await recordPayment({
    sale,
    amount: body.amount,
    method: body.method,
    reference: body.reference,
    note: body.note,
    isDeposit: !!body.isDeposit,
    clientRef: body.clientRef,
    tendered: body.tendered,
    user,
  });

  await logAction(user, 'payment.create', {
    entity: 'Sale',
    entityId: sale._id,
    label: `${payment.method} payment of ${payment.amount} on ${sale.invoiceNumber}`,
    details: {
      method: payment.method,
      amount: payment.amount,
      reference: payment.reference,
      balanceAfter: updated.balance,
    },
    req,
  });

  return scrubCosts({ payment: payment.toObject(), sale: updated.toObject?.() ?? updated }, user);
});
