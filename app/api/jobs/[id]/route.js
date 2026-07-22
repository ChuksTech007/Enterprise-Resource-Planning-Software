import { route, scrubCosts, notFound, bad, forbidden } from '@/lib/http';
import { Job, Sale, Payment, Material, StockMovement, JOB_STATUS_ALL, COLLECTION_STATUSES } from '@/lib/models';
import { ensureSaleForJob } from '@/lib/invoicing';
import { buildJobItems } from '@/lib/jobs';
import { deductJobMaterials, returnJobMaterials } from '@/lib/stock';
import { recalcCustomer, recalcSale } from '@/lib/rollups';
import { logAction } from '@/lib/audit';
import { money, num } from '@/lib/util';

export const dynamic = 'force-dynamic';

export const GET = route(async ({ params, user }) => {
  const job = await Job.findById(params.id).lean();
  if (!job) throw notFound('Job not found');

  const sale = job.sale ? await Sale.findById(job.sale).lean() : null;
  const payments = sale ? await Payment.find({ sale: sale._id }).sort({ createdAt: 1 }).lean() : [];
  const movements = await StockMovement.find({ job: job._id }).sort({ createdAt: -1 }).lean();

  return scrubCosts({ job, sale, payments, movements }, user);
});

export const PATCH = route(async ({ params, body, user, req }) => {
  const job = await Job.findById(params.id);
  if (!job) throw notFound('Job not found');

  const sale = job.sale ? await Sale.findById(job.sale) : null;
  const isOwner = user.role === 'owner';
  const changes = [];

  /* ---------------- details ---------------- */

  const priceLocked = sale && sale.amountPaid > 0 && !isOwner;

  for (const f of ['notes', 'assignedToName']) {
    if (body[f] !== undefined) job[f] = body[f];
  }
  if (body.assignedTo !== undefined) job.assignedTo = body.assignedTo || undefined;
  if (body.isRush !== undefined) job.isRush = !!body.isRush;
  if (body.deadline !== undefined) job.deadline = body.deadline ? new Date(body.deadline) : undefined;

  // Editing the item list re-derives the job's type, quantity, summary and
  // price together — they are one fact, so they change as one.
  if (body.items !== undefined) {
    if (priceLocked) {
      throw forbidden('This job already has a payment against it. Ask the owner to change what is on it.');
    }
    if (!Array.isArray(body.items) || !body.items.length) throw bad('A job needs at least one item');

    const built = buildJobItems(body);
    job.items = built.items;
    job.jobType = built.jobType;
    job.quantity = built.quantity;
    job.description = built.description;
    job.specs = built.specs;
    job.unitPrice = built.items[0]?.unitPrice || 0;
    job.price = built.price;
    changes.push(`items → ${built.items.length}, price → ${built.price}`);
  } else if (body.description !== undefined) {
    job.description = body.description;
  }

  if (body.discount !== undefined) {
    if (priceLocked) {
      throw forbidden('This job already has a payment against it. Ask the owner to change the price.');
    }
    job.discount = money(body.discount);
    changes.push(`discount → ${job.discount}`);
  }

  if (body.materials !== undefined) {
    if (job.stockDeducted) {
      throw bad('Stock has already been taken off for this job, so its materials cannot be changed. Record a stock adjustment instead.');
    }
    const materials = [];
    for (const line of body.materials) {
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
    job.materials = materials;
  }

  /* ---------------- status ---------------- */

  let stockResult = null;

  if (body.status && body.status !== job.status) {
    if (!JOB_STATUS_ALL.includes(body.status)) throw bad('Unknown status');

    // Cancelling destroys billable work — owners only.
    if (body.status === 'cancelled' && !isOwner) {
      throw forbidden('Only the owner can cancel a job');
    }
    if (job.status === 'cancelled' && !isOwner) {
      throw forbidden('This job was cancelled. Only the owner can reopen it.');
    }

    const previous = job.status;
    job.status = body.status;
    job.statusHistory.push({ status: body.status, at: new Date(), by: user.name });
    changes.push(`${previous} → ${body.status}`);

    if (body.status === 'cancelled') {
      if (sale && sale.amountPaid > 0) {
        throw bad('Money has been paid on this job. Refund the customer first, then cancel.');
      }
      job.cancelledAt = new Date();
      job.cancelReason = body.cancelReason?.trim();
      await returnJobMaterials(job, user);
      if (sale) {
        sale.voided = true;
        sale.voidReason = body.cancelReason?.trim() || 'Job cancelled';
        sale.voidedAt = new Date();
        sale.voidedBy = user._id;
        await sale.save();
        await recalcSale(sale._id);
      }
    } else {
      // Anything past a quote is a real order, so it needs an invoice.
      if (previous === 'quote') await ensureSaleForJob(job, user);

      if (body.status === 'done') {
        // The one place stock leaves the shelf automatically.
        stockResult = await deductJobMaterials(job, user);
        if (job.collectionStatus === 'not_ready') job.collectionStatus = 'ready';
      }

      if (body.status === 'delivered') {
        if (!job.stockDeducted) stockResult = await deductJobMaterials(job, user);
        job.collectionStatus = 'collected';
        job.deliveredAt = new Date();
        job.collectedAt = job.collectedAt || new Date();
        job.collectedBy = body.collectedBy?.trim() || job.customerName;
      }
    }
  }

  /* ------------- collection status ------------- */

  if (body.collectionStatus && body.collectionStatus !== job.collectionStatus) {
    if (!COLLECTION_STATUSES.includes(body.collectionStatus)) throw bad('Unknown collection status');

    if (body.collectionStatus === 'collected') {
      // The guard against handing the same job out twice.
      if (job.collectionStatus === 'collected') throw bad('This job has already been collected');
      if (!['done', 'delivered'].includes(job.status)) {
        throw bad('This job is not finished yet, so it cannot be marked collected');
      }
      job.collectedAt = new Date();
      job.collectedBy = body.collectedBy?.trim() || job.customerName;
    }
    job.collectionStatus = body.collectionStatus;
    changes.push(`collection → ${body.collectionStatus}`);
  }

  await job.save();

  // Keep the invoice in step with any price change.
  if (job.status !== 'quote' && job.status !== 'cancelled') await ensureSaleForJob(job, user);
  if (job.customer) await recalcCustomer(job.customer);

  await logAction(user, 'job.update', {
    entity: 'Job',
    entityId: job._id,
    label: `${job.jobNumber}: ${changes.join(', ') || 'details updated'}`,
    details: { changes, stockDeducted: !!stockResult && !stockResult.skipped },
    req,
  });

  const fresh = await Job.findById(job._id).lean();
  const freshSale = fresh.sale ? await Sale.findById(fresh.sale).lean() : null;

  return scrubCosts({ job: fresh, sale: freshSale, stockDeducted: stockResult }, user);
});

export const DELETE = route(
  async ({ params, user, req }) => {
    const job = await Job.findById(params.id);
    if (!job) throw notFound('Job not found');

    const sale = job.sale ? await Sale.findById(job.sale) : null;
    if (sale && sale.amountPaid > 0) {
      throw bad('Money has been paid on this job. Refund the customer first, then cancel.');
    }

    // Jobs are never actually deleted — the audit trail has to survive.
    job.status = 'cancelled';
    job.cancelledAt = new Date();
    job.cancelReason = 'Cancelled by owner';
    job.statusHistory.push({ status: 'cancelled', at: new Date(), by: user.name });
    await returnJobMaterials(job, user);
    await job.save();

    if (sale) {
      sale.voided = true;
      sale.voidReason = 'Job cancelled';
      sale.voidedAt = new Date();
      sale.voidedBy = user._id;
      await sale.save();
      await recalcSale(sale._id);
    }
    if (job.customer) await recalcCustomer(job.customer);

    await logAction(user, 'job.cancel', {
      entity: 'Job',
      entityId: job._id,
      label: `Cancelled job ${job.jobNumber}`,
      req,
    });

    return { ok: true };
  },
  { role: 'owner' }
);
