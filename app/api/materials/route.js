import { route, scrubCosts, bad } from '@/lib/http';
import { Material, MATERIAL_CATEGORIES, UNITS } from '@/lib/models';
import { applyMovement } from '@/lib/stock';
import { logAction } from '@/lib/audit';
import { money, num } from '@/lib/util';

export const dynamic = 'force-dynamic';

export const GET = route(async ({ query, user }) => {
  const filter = { active: query.includeInactive === '1' ? { $in: [true, false] } : true };

  if (query.category && query.category !== 'all') filter.category = query.category;
  if (query.q) {
    const rx = new RegExp(escapeRx(query.q), 'i');
    filter.$or = [{ name: rx }, { size: rx }, { colour: rx }, { shelfLocation: rx }];
  }

  let materials = await Material.find(filter)
    .populate('supplier', 'name phone leadTimeDays')
    .sort({ name: 1 })
    .limit(500)
    .lean();

  if (query.low === '1') {
    materials = materials.filter((m) => m.reorderLevel > 0 && m.quantity <= m.reorderLevel);
  }

  return scrubCosts(
    {
      materials,
      categories: MATERIAL_CATEGORIES,
      units: UNITS,
      lowCount: materials.filter((m) => m.reorderLevel > 0 && m.quantity <= m.reorderLevel).length,
    },
    user
  );
});

// Only the owner can create stock items, because doing so means setting a
// cost price — a figure cashiers are never allowed to see or influence.
export const POST = route(
  async ({ body, user, req }) => {
    if (!body.name?.trim()) throw bad('Give the material a name');

    const material = await Material.create({
      name: body.name.trim(),
      category: body.category || 'Paper',
      size: body.size?.trim(),
      gsm: body.gsm ? num(body.gsm) : undefined,
      finish: body.finish?.trim(),
      colour: body.colour?.trim(),
      supplier: body.supplier || undefined,
      unit: body.unit || 'sheets',
      quantity: 0,
      reorderLevel: num(body.reorderLevel),
      unitCost: money(body.unitCost),
      shelfLocation: body.shelfLocation?.trim(),
    });

    // Opening quantity is recorded as a real stock-in movement rather than
    // written straight onto the material, so the log explains every unit.
    const opening = num(body.quantity);
    if (opening > 0) {
      await applyMovement({
        materialId: material._id,
        type: 'in',
        quantity: opening,
        reason: 'Opening stock',
        user,
      });
    }

    await logAction(user, 'material.create', {
      entity: 'Material',
      entityId: material._id,
      label: `Added stock item "${material.name}"`,
      details: { opening },
      req,
    });

    return { material: await Material.findById(material._id).lean() };
  },
  { role: 'owner' }
);

function escapeRx(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
