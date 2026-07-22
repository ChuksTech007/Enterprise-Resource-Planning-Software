import { route, scrubCosts, bad } from '@/lib/http';
import { StockMovement, MOVEMENT_TYPES } from '@/lib/models';
import { applyMovement } from '@/lib/stock';
import { logAction } from '@/lib/audit';
import { num, resolveRange } from '@/lib/util';

export const dynamic = 'force-dynamic';

export const GET = route(async ({ query, user }) => {
  const filter = {};
  if (query.material) filter.material = query.material;
  if (query.type && query.type !== 'all') filter.type = query.type;
  if (query.period || query.from || query.to) {
    const { from, to } = resolveRange(query);
    filter.createdAt = { $gte: from, $lte: to };
  }

  const movements = await StockMovement.find(filter)
    .sort({ createdAt: -1 })
    .limit(num(query.limit, 200))
    .lean();

  return scrubCosts({ movements, types: MOVEMENT_TYPES }, user);
});

/**
 * Record a stock movement by hand: taking delivery, logging a misprint,
 * writing off damage, or correcting the count after a physical stock take.
 * Any signed-in user may do this — misprints happen at the machine, and a
 * cashier who cannot log wastage will simply not log it.
 */
export const POST = route(async ({ body, user, req }) => {
  if (!body.materialId) throw bad('Choose a material');
  if (!MOVEMENT_TYPES.includes(body.type)) throw bad('Choose what kind of movement this is');

  const qty = num(body.quantity);
  if (qty < 0) throw bad('Quantity cannot be negative');
  if (qty === 0 && body.type !== 'adjustment') throw bad('Enter a quantity');

  // Wastage and damage cost money, so the reason is not optional.
  if (['wastage', 'damage'].includes(body.type) && !body.reason?.trim()) {
    throw bad('Say what happened — wastage and damage must have a reason');
  }

  const { movement, material } = await applyMovement({
    materialId: body.materialId,
    type: body.type,
    quantity: qty,
    reason: body.reason?.trim(),
    user,
  });

  await logAction(user, `stock.${body.type}`, {
    entity: 'Material',
    entityId: material._id,
    label: `${body.type} · ${movement.quantity} ${material.unit} of ${material.name}`,
    details: { reason: body.reason, balanceAfter: movement.balanceAfter },
    req,
  });

  return scrubCosts({ movement: movement.toObject(), material: material.toObject() }, user);
});
