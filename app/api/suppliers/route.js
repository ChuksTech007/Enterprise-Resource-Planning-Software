import { route, bad } from '@/lib/http';
import { Supplier, Material } from '@/lib/models';
import { logAction } from '@/lib/audit';
import { num } from '@/lib/util';

export const dynamic = 'force-dynamic';

export const GET = route(async ({ query }) => {
  const suppliers = await Supplier.find(query.includeInactive === '1' ? {} : { active: true })
    .sort({ name: 1 })
    .lean();

  // Attach what each supplier currently needs reordering, so the owner can
  // place one call per supplier instead of one per item.
  const low = await Material.find({
    active: true,
    reorderLevel: { $gt: 0 },
    $expr: { $lte: ['$quantity', '$reorderLevel'] },
  })
    .select('name supplier quantity reorderLevel unit')
    .lean();

  return {
    suppliers: suppliers.map((s) => ({
      ...s,
      lowItems: low.filter((m) => String(m.supplier) === String(s._id)),
    })),
  };
});

export const POST = route(
  async ({ body, user, req }) => {
    if (!body.name?.trim()) throw bad('Give the supplier a name');
    const supplier = await Supplier.create({
      name: body.name.trim(),
      phone: body.phone?.trim(),
      email: body.email?.trim(),
      address: body.address?.trim(),
      leadTimeDays: num(body.leadTimeDays, 3),
      notes: body.notes?.trim(),
    });
    await logAction(user, 'supplier.create', {
      entity: 'Supplier',
      entityId: supplier._id,
      label: `Added supplier "${supplier.name}"`,
      req,
    });
    return { supplier: supplier.toObject() };
  },
  { role: 'owner' }
);
