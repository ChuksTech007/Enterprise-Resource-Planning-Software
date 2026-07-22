import { route, scrubCosts, bad } from '@/lib/http';
import { PriceItem, JOB_TYPES } from '@/lib/models';
import { logAction } from '@/lib/audit';
import { money, num } from '@/lib/util';

export const dynamic = 'force-dynamic';

export const GET = route(async ({ query, user }) => {
  const filter = query.includeInactive === '1' ? {} : { active: true };
  if (query.jobType && query.jobType !== 'all') filter.jobType = query.jobType;

  const items = await PriceItem.find(filter).sort({ jobType: 1, name: 1 }).lean();
  return scrubCosts({ items, jobTypes: JOB_TYPES }, user);
});

export const POST = route(
  async ({ body, user, req }) => {
    if (!body.name?.trim()) throw bad('Give the price item a name');
    if (body.price === undefined || body.price === '') throw bad('Enter a price');

    const item = await PriceItem.create({
      name: body.name.trim(),
      jobType: body.jobType || 'Other',
      description: body.description?.trim(),
      unitLabel: body.unitLabel?.trim() || 'per unit',
      price: money(body.price),
      estimatedCost: money(body.estimatedCost),
      minQuantity: num(body.minQuantity, 1),
    });

    await logAction(user, 'price.create', {
      entity: 'PriceItem',
      entityId: item._id,
      label: `Added price "${item.name}"`,
      req,
    });

    return { item: item.toObject() };
  },
  { role: 'owner' }
);
