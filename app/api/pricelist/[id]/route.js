import { route, notFound } from '@/lib/http';
import { PriceItem } from '@/lib/models';
import { logAction } from '@/lib/audit';
import { money, num } from '@/lib/util';

export const dynamic = 'force-dynamic';

export const PATCH = route(
  async ({ params, body, user, req }) => {
    const item = await PriceItem.findById(params.id);
    if (!item) throw notFound('Price item not found');

    for (const f of ['name', 'jobType', 'description', 'unitLabel']) {
      if (body[f] !== undefined) item[f] = body[f];
    }
    if (body.price !== undefined) item.price = money(body.price);
    if (body.estimatedCost !== undefined) item.estimatedCost = money(body.estimatedCost);
    if (body.minQuantity !== undefined) item.minQuantity = num(body.minQuantity, 1);
    if (body.active !== undefined) item.active = !!body.active;

    await item.save();
    await logAction(user, 'price.update', {
      entity: 'PriceItem',
      entityId: item._id,
      label: `Updated price "${item.name}" to ${item.price}`,
      req,
    });
    return { item: item.toObject() };
  },
  { role: 'owner' }
);

export const DELETE = route(
  async ({ params, user, req }) => {
    const item = await PriceItem.findById(params.id);
    if (!item) throw notFound('Price item not found');
    item.active = false;
    await item.save();
    await logAction(user, 'price.retire', {
      entity: 'PriceItem',
      entityId: item._id,
      label: `Removed price "${item.name}"`,
      req,
    });
    return { ok: true };
  },
  { role: 'owner' }
);
