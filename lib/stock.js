import { Material, StockMovement, Job } from './models.js';
import { money, num } from './util.js';
import { OUTWARD_MOVEMENTS } from './models.js';
import { postSafely } from './accounting/ledger.js';
import { postingsForMovement } from './accounting/postings.js';

/**
 * Apply one stock movement and write it to the log.
 *
 * The quantity change uses an atomic $inc rather than read-modify-write, so
 * two people recording movements against the same material at the same time
 * cannot overwrite each other's change.
 *
 * For `adjustment`, `quantity` is the *counted* total and the delta is
 * derived — that is how a stock count actually works on the shop floor.
 */
export async function applyMovement({
  materialId,
  type,
  quantity,
  reason,
  job,
  user,
  purchaseOrder,
}) {
  const material = await Material.findById(materialId);
  if (!material) throw new Error('Material not found');

  const qty = Math.abs(num(quantity));
  let delta;

  if (type === 'adjustment') {
    delta = money(qty - material.quantity);
  } else if (OUTWARD_MOVEMENTS.includes(type)) {
    delta = -qty;
  } else {
    delta = qty; // 'in' and 'return'
  }

  const updated = await Material.findByIdAndUpdate(
    materialId,
    { $inc: { quantity: delta } },
    { returnDocument: 'after' }
  );

  const movement = await StockMovement.create({
    material: material._id,
    materialName: material.name,
    type,
    quantity: type === 'adjustment' ? Math.abs(delta) : qty,
    delta,
    unit: material.unit,
    unitCost: material.unitCost,
    balanceAfter: money(updated.quantity),
    reason,
    job: job?._id,
    jobNumber: job?.jobNumber,
    purchaseOrder: purchaseOrder?._id || purchaseOrder,
    user: user?._id,
    userName: user?.name,
  });

  // Turns paper on a shelf into cost of sales, wastage, or inventory.
  await postSafely(postingsForMovement(movement.toObject()));

  return { movement, material: updated };
}

/**
 * Deduct every material listed on a job, once and only once.
 * Called when a job first reaches "done". The `stockDeducted` flag is the
 * guard — re-running a status change can never double-deduct.
 */
export async function deductJobMaterials(job, user) {
  if (job.stockDeducted) return { skipped: true, movements: [] };
  if (!job.materials?.length) {
    job.stockDeducted = true;
    job.stockDeductedAt = new Date();
    await job.save();
    return { skipped: true, movements: [] };
  }

  const movements = [];
  for (const line of job.materials) {
    if (!line.material || !line.quantity) continue;
    try {
      const { movement } = await applyMovement({
        materialId: line.material,
        type: 'used',
        quantity: line.quantity,
        reason: `Used on job ${job.jobNumber}`,
        job,
        user,
      });
      movements.push(movement);
    } catch (err) {
      // A missing/deleted material must not block the job from completing —
      // log it and carry on, the movement log will show the gap.
      console.error('[stock] could not deduct', line.name, err.message);
    }
  }

  job.stockDeducted = true;
  job.stockDeductedAt = new Date();
  await job.save();
  return { skipped: false, movements };
}

/** Put a cancelled job's materials back on the shelf. */
export async function returnJobMaterials(job, user) {
  if (!job.stockDeducted || !job.materials?.length) return;
  for (const line of job.materials) {
    if (!line.material || !line.quantity) continue;
    try {
      await applyMovement({
        materialId: line.material,
        type: 'return',
        quantity: line.quantity,
        reason: `Job ${job.jobNumber} cancelled — returned to stock`,
        job,
        user,
      });
    } catch (err) {
      console.error('[stock] could not return', line.name, err.message);
    }
  }
  job.stockDeducted = false;
  await job.save();
}

/** Total cost of the materials attached to a job. Owner-only figure. */
export function jobMaterialCost(job) {
  return money((job.materials || []).reduce((sum, l) => sum + num(l.quantity) * num(l.unitCost), 0));
}

/** Materials at or below their reorder level. */
export async function lowStockItems() {
  return Material.find({
    active: true,
    reorderLevel: { $gt: 0 },
    $expr: { $lte: ['$quantity', '$reorderLevel'] },
  })
    .populate('supplier', 'name phone leadTimeDays')
    .sort({ quantity: 1 })
    .lean();
}
