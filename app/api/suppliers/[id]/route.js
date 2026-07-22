import { route, notFound } from '@/lib/http';
import { Supplier } from '@/lib/models';
import { logAction } from '@/lib/audit';
import { num } from '@/lib/util';

export const dynamic = 'force-dynamic';

export const PATCH = route(
  async ({ params, body, user, req }) => {
    const supplier = await Supplier.findById(params.id);
    if (!supplier) throw notFound('Supplier not found');

    for (const f of ['name', 'phone', 'email', 'address', 'notes']) {
      if (body[f] !== undefined) supplier[f] = body[f];
    }
    if (body.leadTimeDays !== undefined) supplier.leadTimeDays = num(body.leadTimeDays, 3);
    if (body.active !== undefined) supplier.active = !!body.active;

    await supplier.save();
    await logAction(user, 'supplier.update', {
      entity: 'Supplier',
      entityId: supplier._id,
      label: `Updated supplier "${supplier.name}"`,
      req,
    });
    return { supplier: supplier.toObject() };
  },
  { role: 'owner' }
);

export const DELETE = route(
  async ({ params, user, req }) => {
    const supplier = await Supplier.findById(params.id);
    if (!supplier) throw notFound('Supplier not found');
    supplier.active = false;
    await supplier.save();
    await logAction(user, 'supplier.retire', {
      entity: 'Supplier',
      entityId: supplier._id,
      label: `Retired supplier "${supplier.name}"`,
      req,
    });
    return { ok: true };
  },
  { role: 'owner' }
);
