import { route, bad } from '@/lib/http';
import { PurchaseOrder, Supplier, Material, PO_STATUSES } from '@/lib/models';
import { nextNumber } from '@/lib/numbering';
import { logAction } from '@/lib/audit';
import { money, num, resolveRange } from '@/lib/util';

export const dynamic = 'force-dynamic';

// Purchasing is owner territory: it commits the business to spending money
// and it sets the cost prices that every profit figure depends on.
export const GET = route(
  async ({ query }) => {
    const filter = {};
    if (query.status && query.status !== 'all') filter.status = query.status;
    else if (query.open === '1') filter.status = { $in: ['draft', 'sent', 'part_received'] };
    if (query.supplier) filter.supplier = query.supplier;
    if (query.owing === '1') filter.balance = { $gt: 0 };

    if (query.period || query.from || query.to) {
      const { from, to } = resolveRange(query);
      filter.createdAt = { $gte: from, $lte: to };
    }

    const orders = await PurchaseOrder.find(filter).sort({ createdAt: -1 }).limit(num(query.limit, 200)).lean();

    const [totals] = await PurchaseOrder.aggregate([
      { $match: { status: { $ne: 'cancelled' } } },
      { $group: { _id: null, ordered: { $sum: '$total' }, owed: { $sum: { $max: ['$balance', 0] } } } },
    ]);

    return {
      orders,
      statuses: PO_STATUSES,
      totals: { ordered: money(totals?.ordered || 0), owed: money(totals?.owed || 0) },
    };
  },
  { role: 'owner' }
);

export const POST = route(
  async ({ body, user, req }) => {
    const supplier = await Supplier.findById(body.supplier);
    if (!supplier) throw bad('Choose a supplier');

    const items = [];
    for (const line of body.items || []) {
      const material = await Material.findById(line.material).lean();
      if (!material) continue;
      const quantity = num(line.quantity);
      if (quantity <= 0) continue;
      const unitCost = money(line.unitCost ?? material.unitCost);
      items.push({
        material: material._id,
        name: material.name,
        unit: material.unit,
        quantity,
        received: 0,
        unitCost,
        total: money(quantity * unitCost),
      });
    }

    if (!items.length) throw bad('Add at least one item to the order');

    const subtotal = money(items.reduce((s, i) => s + i.total, 0));

    const po = await PurchaseOrder.create({
      poNumber: await nextNumber('po', 'PO'),
      supplier: supplier._id,
      supplierName: supplier.name,
      items,
      subtotal,
      total: subtotal,
      balance: subtotal,
      status: body.status === 'sent' ? 'sent' : 'draft',
      expectedDate: body.expectedDate
        ? new Date(body.expectedDate)
        : new Date(Date.now() + (supplier.leadTimeDays || 3) * 86400000),
      notes: body.notes?.trim(),
      createdBy: user._id,
      createdByName: user.name,
    });

    await logAction(user, 'purchase.create', {
      entity: 'PurchaseOrder',
      entityId: po._id,
      label: `Raised ${po.poNumber} to ${supplier.name} for ${subtotal}`,
      details: { total: subtotal, items: items.length },
      req,
    });

    return { order: po.toObject() };
  },
  { role: 'owner' }
);
