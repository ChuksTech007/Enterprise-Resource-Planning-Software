import { route, notFound, bad } from '@/lib/http';
import { PurchaseOrder, SupplierPayment, StockMovement } from '@/lib/models';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export const GET = route(
  async ({ params }) => {
    const order = await PurchaseOrder.findById(params.id).lean();
    if (!order) throw notFound('Purchase order not found');

    const [payments, movements] = await Promise.all([
      SupplierPayment.find({ purchaseOrder: params.id }).sort({ createdAt: -1 }).lean(),
      StockMovement.find({ purchaseOrder: params.id }).sort({ createdAt: -1 }).lean(),
    ]);

    return { order, payments, movements };
  },
  { role: 'owner' }
);

export const PATCH = route(
  async ({ params, body, user, req }) => {
    const po = await PurchaseOrder.findById(params.id);
    if (!po) throw notFound('Purchase order not found');

    // Once goods have arrived the order is a record of what happened, not a
    // plan — editing it would put the stock and the ledger out of step.
    if (po.receipts.length && (body.items || body.status === 'draft')) {
      throw bad('Goods have already been received on this order, so it can no longer be edited.');
    }

    if (body.status === 'sent' && po.status === 'draft') po.status = 'sent';
    if (body.notes !== undefined) po.notes = body.notes;
    if (body.expectedDate !== undefined) po.expectedDate = body.expectedDate ? new Date(body.expectedDate) : undefined;
    if (body.supplierInvoiceNo !== undefined) po.supplierInvoiceNo = body.supplierInvoiceNo;

    await po.save();
    await logAction(user, 'purchase.update', {
      entity: 'PurchaseOrder',
      entityId: po._id,
      label: `Updated ${po.poNumber}`,
      req,
    });

    return { order: po.toObject() };
  },
  { role: 'owner' }
);

export const DELETE = route(
  async ({ params, user, req }) => {
    const po = await PurchaseOrder.findById(params.id);
    if (!po) throw notFound('Purchase order not found');
    if (po.receipts.length) throw bad('Goods have been received on this order. It cannot be cancelled.');
    if (po.amountPaid > 0) throw bad('This order has been paid against. It cannot be cancelled.');

    po.status = 'cancelled';
    po.balance = 0;
    await po.save();

    await logAction(user, 'purchase.cancel', {
      entity: 'PurchaseOrder',
      entityId: po._id,
      label: `Cancelled ${po.poNumber}`,
      req,
    });

    return { ok: true };
  },
  { role: 'owner' }
);
