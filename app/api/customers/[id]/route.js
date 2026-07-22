import { route, scrubCosts, notFound } from '@/lib/http';
import { Customer, Job, Sale, Payment } from '@/lib/models';
import { recalcCustomer } from '@/lib/rollups';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export const GET = route(async ({ params, user }) => {
  const customer = await Customer.findById(params.id).lean();
  if (!customer) throw notFound('Customer not found');

  const [jobs, sales, payments] = await Promise.all([
    Job.find({ customer: params.id }).sort({ createdAt: -1 }).limit(50).lean(),
    Sale.find({ customer: params.id }).sort({ createdAt: -1 }).limit(50).lean(),
    Payment.find({ customer: params.id, voided: false }).sort({ createdAt: -1 }).limit(50).lean(),
  ]);

  return scrubCosts(
    { customer: { ...customer, isRepeat: customer.jobCount >= 2 }, jobs, sales, payments },
    user
  );
});

export const PATCH = route(async ({ params, body, user, req }) => {
  const customer = await Customer.findById(params.id);
  if (!customer) throw notFound('Customer not found');

  for (const f of ['name', 'phone', 'email', 'company', 'address', 'notes']) {
    if (body[f] !== undefined) customer[f] = body[f];
  }
  await customer.save();

  await logAction(user, 'customer.update', {
    entity: 'Customer',
    entityId: customer._id,
    label: `Updated customer "${customer.name}"`,
    req,
  });

  return { customer: customer.toObject() };
});

// Recompute this customer's totals from source records. Handy if anything
// ever looks off after an offline sync.
export const PUT = route(async ({ params }) => {
  await recalcCustomer(params.id);
  return { customer: await Customer.findById(params.id).lean() };
});

export const DELETE = route(
  async ({ params, user, req }) => {
    const customer = await Customer.findById(params.id);
    if (!customer) throw notFound('Customer not found');

    const jobCount = await Job.countDocuments({ customer: params.id });
    if (jobCount > 0) throw notFound('This customer has job history and cannot be deleted');

    await customer.deleteOne();
    await logAction(user, 'customer.delete', {
      entity: 'Customer',
      entityId: params.id,
      label: `Deleted customer "${customer.name}"`,
      req,
    });
    return { ok: true };
  },
  { role: 'owner' }
);
