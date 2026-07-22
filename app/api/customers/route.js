import { route, bad } from '@/lib/http';
import { Customer } from '@/lib/models';
import { logAction } from '@/lib/audit';
import { num } from '@/lib/util';

export const dynamic = 'force-dynamic';

export const GET = route(async ({ query }) => {
  const filter = {};
  if (query.q) {
    const rx = new RegExp(String(query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { phone: rx }, { company: rx }];
  }
  if (query.debtors === '1') filter.outstanding = { $gt: 0 };
  if (query.repeat === '1') filter.jobCount = { $gte: 2 };

  const sort = query.debtors === '1' ? { outstanding: -1 } : { name: 1 };

  const customers = await Customer.find(filter).sort(sort).limit(num(query.limit, 300)).lean();

  return {
    customers: customers.map((c) => ({ ...c, isRepeat: c.jobCount >= 2 })),
  };
});

export const POST = route(async ({ body, user, req }) => {
  const name = body.name?.trim();
  if (!name) throw bad("Enter the customer's name");

  const phone = body.phone?.trim();

  // Phone numbers are how a print shop actually identifies a customer.
  // Reuse the existing record rather than creating a second one — otherwise
  // the outstanding balance ends up split across duplicates.
  if (phone) {
    const existing = await Customer.findOne({ phone });
    if (existing) return { customer: existing.toObject(), existing: true };
  }

  const customer = await Customer.create({
    name,
    phone,
    email: body.email?.trim(),
    company: body.company?.trim(),
    address: body.address?.trim(),
    notes: body.notes?.trim(),
    createdBy: user._id,
  });

  await logAction(user, 'customer.create', {
    entity: 'Customer',
    entityId: customer._id,
    label: `Added customer "${customer.name}"`,
    req,
  });

  return { customer: customer.toObject() };
});
