import { route, scrubCosts, notFound, bad } from '@/lib/http';
import { Material, StockMovement } from '@/lib/models';
import { logAction } from '@/lib/audit';
import { money, num } from '@/lib/util';

export const dynamic = 'force-dynamic';

export const GET = route(async ({ params, user }) => {
  const material = await Material.findById(params.id).populate('supplier', 'name phone leadTimeDays').lean();
  if (!material) throw notFound('Stock item not found');

  const movements = await StockMovement.find({ material: params.id }).sort({ createdAt: -1 }).limit(100).lean();

  return scrubCosts({ material, movements }, user);
});

export const PATCH = route(
  async ({ params, body, user, req }) => {
    const material = await Material.findById(params.id);
    if (!material) throw notFound('Stock item not found');

    const editable = ['name', 'category', 'size', 'finish', 'colour', 'shelfLocation', 'unit', 'supplier'];
    for (const f of editable) {
      if (body[f] !== undefined) material[f] = body[f] || undefined;
    }
    if (body.gsm !== undefined) material.gsm = body.gsm ? num(body.gsm) : undefined;
    if (body.reorderLevel !== undefined) material.reorderLevel = num(body.reorderLevel);
    if (body.unitCost !== undefined) material.unitCost = money(body.unitCost);
    if (body.active !== undefined) material.active = !!body.active;

    // Quantity is intentionally not editable here. It only ever moves through
    // a logged stock movement, so the log always reconciles to the balance.
    await material.save();

    await logAction(user, 'material.update', {
      entity: 'Material',
      entityId: material._id,
      label: `Updated stock item "${material.name}"`,
      req,
    });

    return { material: material.toObject() };
  },
  { role: 'owner' }
);

export const DELETE = route(
  async ({ params, user, req }) => {
    const material = await Material.findById(params.id);
    if (!material) throw notFound('Stock item not found');
    if (material.quantity > 0) {
      throw bad('This item still has stock. Adjust it to zero first, then retire it.');
    }

    // Soft delete — the movement history must survive.
    material.active = false;
    await material.save();

    await logAction(user, 'material.retire', {
      entity: 'Material',
      entityId: material._id,
      label: `Retired stock item "${material.name}"`,
      req,
    });

    return { ok: true };
  },
  { role: 'owner' }
);
