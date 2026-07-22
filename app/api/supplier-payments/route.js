import { route, bad } from '@/lib/http';
import { SupplierPayment, PurchaseOrder, Supplier, PAYMENT_METHODS } from '@/lib/models';
import { postSafely } from '@/lib/accounting/ledger';
import { postingsForSupplierPayment } from '@/lib/accounting/postings';
import { logAction } from '@/lib/audit';
import { money, num, resolveRange } from '@/lib/util';

export const dynamic = 'force-dynamic';

export const GET = route(
  async ({ query }) => {
    const filter = {};
    if (query.supplier) filter.supplier = query.supplier;
    if (query.purchaseOrder) filter.purchaseOrder = query.purchaseOrder;
    if (query.period || query.from || query.to) {
      const { from, to } = resolveRange(query);
      filter.createdAt = { $gte: from, $lte: to };
    }

    const payments = await SupplierPayment.find(filter).sort({ createdAt: -1 }).limit(num(query.limit, 200)).lean();

    // What you owe, per supplier — the mirror of the customer debtor list.
    const owing = await PurchaseOrder.aggregate([
      { $match: { status: { $ne: 'cancelled' }, balance: { $gt: 0 } } },
      {
        $group: {
          _id: { id: '$supplier', name: '$supplierName' },
          owed: { $sum: '$balance' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { owed: -1 } },
    ]);

    return {
      payments,
      owing: owing.map((o) => ({
        supplier: o._id.id ? String(o._id.id) : null,
        name: o._id.name,
        owed: money(o.owed),
        orders: o.orders,
      })),
      totalOwed: money(owing.reduce((s, o) => s + o.owed, 0)),
    };
  },
  { role: 'owner' }
);

/** Pay a supplier. Reduces what you owe them and the money you hold. */
export const POST = route(
  async ({ body, user, req }) => {
    const amount = money(body.amount);
    if (!(amount > 0)) throw bad('Enter an amount');
    if (!PAYMENT_METHODS.includes(body.method)) throw bad('How was the supplier paid?');

    const po = body.purchaseOrder ? await PurchaseOrder.findById(body.purchaseOrder) : null;
    if (body.purchaseOrder && !po) throw bad('Purchase order not found');

    if (po) {
      if (amount > po.balance + 0.01) {
        throw bad(`That is more than the ${money(po.balance)} outstanding on ${po.poNumber}.`);
      }
    }

    const supplier = po ? await Supplier.findById(po.supplier) : await Supplier.findById(body.supplier);
    if (!supplier) throw bad('Choose a supplier');

    const payment = await SupplierPayment.create({
      purchaseOrder: po?._id,
      poNumber: po?.poNumber,
      supplier: supplier._id,
      supplierName: supplier.name,
      amount,
      method: body.method,
      reference: body.reference?.trim(),
      note: body.note?.trim(),
      paidBy: user._id,
      paidByName: user.name,
    });

    if (po) {
      po.amountPaid = money(po.amountPaid + amount);
      po.balance = money(po.total - po.amountPaid);
      await po.save();
    }

    await postSafely(postingsForSupplierPayment(payment.toObject()));

    await logAction(user, 'purchase.pay', {
      entity: 'SupplierPayment',
      entityId: payment._id,
      label: `Paid ${supplier.name} ${amount}${po ? ` on ${po.poNumber}` : ''}`,
      details: { amount, method: body.method },
      req,
    });

    return { payment: payment.toObject(), order: po?.toObject() };
  },
  { role: 'owner' }
);
