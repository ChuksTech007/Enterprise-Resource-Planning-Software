import { route, scrubCosts, bad } from '@/lib/http';
import { Job, Material, JOB_TYPES, JOB_STATUSES, FINISHES } from '@/lib/models';
import { resolveCustomer } from '@/lib/customers';
import { buildJobItems } from '@/lib/jobs';
import { ensureSaleForJob, recordPayment } from '@/lib/invoicing';
import { nextJobNumber } from '@/lib/numbering';
import { recalcCustomer } from '@/lib/rollups';
import { logAction } from '@/lib/audit';
import { money, num, resolveRange } from '@/lib/util';

export const dynamic = 'force-dynamic';

export const GET = route(async ({ query, user }) => {
  const filter = {};

  if (query.status && query.status !== 'all') filter.status = query.status;
  else if (query.open === '1') filter.status = { $in: ['approved', 'printing', 'finishing'] };
  else if (query.quotes === '1') filter.status = 'quote';

  if (query.collection && query.collection !== 'all') filter.collectionStatus = query.collection;
  if (query.rush === '1') filter.isRush = true;
  if (query.customer) filter.customer = query.customer;
  if (query.assignedTo) filter.assignedTo = query.assignedTo;

  if (query.period || query.from || query.to) {
    const { from, to } = resolveRange(query);
    filter.createdAt = { $gte: from, $lte: to };
  }

  if (query.q) {
    const rx = new RegExp(String(query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ jobNumber: rx }, { customerName: rx }, { description: rx }];
  }

  const jobs = await Job.find(filter)
    // Rush jobs first, then whatever is due soonest — this is the order the
    // production bench should actually work in.
    .sort({ isRush: -1, deadline: 1, createdAt: -1 })
    .limit(num(query.limit, 200))
    .populate('sale', 'invoiceNumber status total amountPaid balance')
    .lean();

  const counts = await Job.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);

  return scrubCosts(
    {
      jobs,
      counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
      jobTypes: JOB_TYPES,
      statuses: JOB_STATUSES,
      finishes: FINISHES,
    },
    user
  );
});

export const POST = route(async ({ body, user, req }) => {
  // Replay of an offline-queued job that already landed.
  if (body.clientRef) {
    const existing = await Job.findOne({ clientRef: body.clientRef }).lean();
    if (existing) return scrubCosts({ job: existing, duplicate: true }, user);
  }

  const hasItems = Array.isArray(body.items) && body.items.length > 0;
  /* A job type is not demanded. It is inferred from what is being charged
   * for, and where nothing says otherwise it is simply "Other" — a
   * classification the shop can correct later is worth more than a dropdown
   * standing between a customer and their ticket. */

  const customer = await resolveCustomer({
    customerId: body.customerId,
    name: body.customerName,
    phone: body.customerPhone,
    user,
  });
  /* No name is not an error. Somebody hands over a picture and pays cash;
   * the shop writes the size and the price on the pad and gives them a
   * ticket. Refusing to record that until a name is typed would push staff
   * back to paper for exactly the jobs the shop takes most of. Sales
   * already works this way. */

  // One order can carry several products. buildJobItems accepts either a list
  // or a single flat product, and derives the summary fields from it.
  const built = buildJobItems(body);
  /* The one thing genuinely required: a job with no lines at all is not a
   * record of anything. Everything else — name, size, price, deadline — can
   * be filled in when it is known. */
  if (!built.items.length) throw bad('Add at least one row before saving');

  const status = JOB_STATUSES.includes(body.status) ? body.status : 'quote';

  // Snapshot each material's cost at the moment of quoting. If paper prices
  // change next month, this job's profit figure must not change with them.
  const materials = [];
  for (const line of body.materials || []) {
    if (!line.materialId || !num(line.quantity)) continue;
    const mat = await Material.findById(line.materialId).lean();
    if (!mat) continue;
    materials.push({
      material: mat._id,
      name: mat.name,
      quantity: num(line.quantity),
      unit: mat.unit,
      unitCost: mat.unitCost,
    });
  }

  const job = await Job.create({
    jobNumber: await nextJobNumber(),
    customer: customer?._id,
    customerName: customer?.name || 'Walk-in customer',
    items: built.items,
    jobType: built.jobType,
    description: built.description,
    quantity: built.quantity,
    specs: built.specs,
    /* Frozen as given, never recomputed — see PriceLineSchema. */
    priceBreakdown: Array.isArray(body.priceBreakdown)
      ? body.priceBreakdown.map((l) => ({
          part: l.part,
          name: l.name,
          detail: l.detail,
          amount: money(l.amount),
        }))
      : undefined,
    materials,
    assignedTo: body.assignedTo || undefined,
    assignedToName: body.assignedToName,
    status,
    isRush: !!body.isRush,
    unitPrice: built.items[0]?.unitPrice || 0,
    price: built.price,
    discount: money(body.discount),
    deadline: body.deadline ? new Date(body.deadline) : undefined,
    notes: body.notes?.trim(),
    clientRef: body.clientRef,
    createdBy: user._id,
    createdByName: user.name,
    statusHistory: [{ status, at: new Date(), by: user.name }],
  });

  // A quote is not yet money owed, so it does not raise an invoice.
  let sale = null;
  if (status !== 'quote') sale = await ensureSaleForJob(job, user);

  // Optional deposit taken at the counter while the customer is standing there.
  let payment = null;
  if (sale && body.deposit?.amount) {
    const result = await recordPayment({
      sale,
      amount: body.deposit.amount,
      method: body.deposit.method,
      reference: body.deposit.reference,
      note: 'Deposit taken with order',
      isDeposit: true,
      user,
    });
    payment = result.payment;
    sale = result.sale;
  }

  /* Only if there is one. A walk-in has no running balance to recompute. */
  if (customer) await recalcCustomer(customer._id);

  await logAction(user, 'job.create', {
    entity: 'Job',
    entityId: job._id,
    label: `Created ${status === 'quote' ? 'quote' : 'job'} ${job.jobNumber} for ${customer?.name || 'a walk-in'}`,
    details: { price: built.price, items: built.items.length, status, isRush: job.isRush },
    req,
  });

  return scrubCosts({ job: job.toObject(), sale: sale?.toObject?.() ?? sale, payment }, user);
});
