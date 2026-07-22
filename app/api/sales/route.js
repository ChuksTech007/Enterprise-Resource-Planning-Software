import { route, scrubCosts, bad } from '@/lib/http';
import { Sale, PriceItem } from '@/lib/models';
import { resolveCustomer } from '@/lib/customers';
import { recordPayment } from '@/lib/invoicing';
import { nextInvoiceNumber } from '@/lib/numbering';
import { recalcCustomer } from '@/lib/rollups';
import { logAction } from '@/lib/audit';
import { money, num, resolveRange } from '@/lib/util';

export const dynamic = 'force-dynamic';

export const GET = route(async ({ query, user }) => {
  const filter = {};

  if (query.includeVoid !== '1') filter.voided = false;
  if (query.status && query.status !== 'all') filter.status = query.status;
  if (query.unpaid === '1') filter.status = { $in: ['unpaid', 'partial'] };
  if (query.customer) filter.customer = query.customer;
  if (query.createdBy) filter.createdBy = query.createdBy;

  if (query.period || query.from || query.to) {
    const { from, to } = resolveRange(query);
    filter.createdAt = { $gte: from, $lte: to };
  }

  if (query.q) {
    const rx = new RegExp(String(query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ invoiceNumber: rx }, { customerName: rx }, { jobNumber: rx }];
  }

  const sort = query.unpaid === '1' ? { balance: -1 } : { createdAt: -1 };

  const sales = await Sale.find(filter).sort(sort).limit(num(query.limit, 200)).lean();

  const [totals] = await Sale.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        billed: { $sum: '$total' },
        paid: { $sum: '$amountPaid' },
        owed: { $sum: { $max: ['$balance', 0] } },
        count: { $sum: 1 },
      },
    },
  ]);

  return scrubCosts(
    { sales, totals: totals || { billed: 0, paid: 0, owed: 0, count: 0 } },
    user
  );
});

/**
 * A walk-in sale: someone buys something over the counter with no print job
 * attached (a ream of paper, lamination of a document they brought in).
 * Job-linked invoices are created by the jobs API instead.
 */
export const POST = route(async ({ body, user, req }) => {
  // Replay of an offline-queued sale that already landed — hand back the
  // original invoice rather than creating a second one.
  if (body.clientRef) {
    const existing = await Sale.findOne({ clientRef: body.clientRef }).lean();
    if (existing) return scrubCosts({ sale: existing, duplicate: true }, user);
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (!rawItems.length) throw bad('Add at least one item to the sale');

  const items = [];
  for (const line of rawItems) {
    const quantity = num(line.quantity, 1);
    if (quantity <= 0) continue;

    let unitPrice = money(line.unitPrice);
    let unitCost = 0;
    let description = line.description?.trim();
    let jobType = line.jobType;

    // If the cashier picked from the price list, the price and the cost both
    // come from the server. Cost never travels through the browser.
    if (line.priceItemId) {
      const preset = await PriceItem.findById(line.priceItemId).lean();
      if (preset) {
        if (!line.unitPrice) unitPrice = preset.price;
        unitCost = preset.estimatedCost || 0;
        description = description || preset.name;
        jobType = jobType || preset.jobType;
      }
    }

    if (!description) throw bad('Every line needs a description');

    items.push({
      description,
      jobType,
      quantity,
      unitPrice,
      total: money(quantity * unitPrice),
      unitCost,
    });
  }

  if (!items.length) throw bad('Add at least one item to the sale');

  const customer = await resolveCustomer({
    customerId: body.customerId,
    name: body.customerName,
    phone: body.customerPhone,
    user,
  });

  const subtotal = money(items.reduce((s, i) => s + i.total, 0));
  const discount = money(body.discount);
  if (discount > subtotal) throw bad('The discount is larger than the sale total');
  const total = money(subtotal - discount);

  let sale = await Sale.create({
    invoiceNumber: await nextInvoiceNumber(),
    type: 'walkin',
    customer: customer?._id,
    customerName: customer?.name || 'Walk-in customer',
    customerPhone: customer?.phone || body.customerPhone?.trim(),
    items,
    subtotal,
    discount,
    total,
    balance: total,
    materialCost: money(items.reduce((s, i) => s + i.unitCost * i.quantity, 0)),
    dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
    notes: body.notes?.trim(),
    clientRef: body.clientRef,
    createdBy: user._id,
    createdByName: user.name,
  });

  // Most counter sales are paid on the spot; part-payment is allowed here too.
  let payment = null;
  if (body.payment?.amount) {
    const result = await recordPayment({
      sale,
      amount: body.payment.amount,
      method: body.payment.method,
      reference: body.payment.reference,
      note: body.payment.note,
      tendered: body.payment.tendered,
      user,
    });
    payment = result.payment;
    sale = result.sale;
  }

  if (customer) await recalcCustomer(customer._id);

  await logAction(user, 'sale.create', {
    entity: 'Sale',
    entityId: sale._id,
    label: `Sale ${sale.invoiceNumber} — ${total} to ${sale.customerName}`,
    details: { total, paid: sale.amountPaid, items: items.length },
    req,
  });

  return scrubCosts({ sale: sale.toObject?.() ?? sale, payment }, user);
});
