import { route, scrubCosts, notFound, bad } from '@/lib/http';
import { Sale, Payment, Job, Settings } from '@/lib/models';
import { recalcSale, recalcCustomer } from '@/lib/rollups';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export const GET = route(async ({ params, user }) => {
  const sale = await Sale.findById(params.id).lean();
  if (!sale) throw notFound('Invoice not found');

  const payments = await Payment.find({ sale: params.id }).sort({ createdAt: 1 }).lean();
  const job = sale.job ? await Job.findById(sale.job).lean() : null;
  const settings = await Settings.findOne({ key: 'main' }).lean();

  return scrubCosts({ sale, payments, job, settings }, user);
});

export const PATCH = route(async ({ params, body, user, req }) => {
  const sale = await Sale.findById(params.id);
  if (!sale) throw notFound('Invoice not found');

  if (body.notes !== undefined) sale.notes = body.notes;
  if (body.dueDate !== undefined) sale.dueDate = body.dueDate ? new Date(body.dueDate) : undefined;
  await sale.save();

  await logAction(user, 'sale.update', {
    entity: 'Sale',
    entityId: sale._id,
    label: `Updated invoice ${sale.invoiceNumber}`,
    req,
  });

  return { sale: sale.toObject() };
});

/**
 * Void an invoice. Owners only, and only once any money taken has been
 * refunded — otherwise voiding would quietly erase cash that is in the till.
 */
export const DELETE = route(
  async ({ params, body, user, req }) => {
    const sale = await Sale.findById(params.id);
    if (!sale) throw notFound('Invoice not found');
    if (sale.voided) throw bad('This invoice is already cancelled');
    if (sale.amountPaid > 0) {
      throw bad(`${sale.amountPaid} has been paid on this invoice. Refund it first, then cancel.`);
    }

    sale.voided = true;
    sale.voidReason = body?.reason?.trim() || 'Cancelled by owner';
    sale.voidedAt = new Date();
    sale.voidedBy = user._id;
    await sale.save();
    await recalcSale(sale._id);
    if (sale.customer) await recalcCustomer(sale.customer);

    await logAction(user, 'sale.void', {
      entity: 'Sale',
      entityId: sale._id,
      label: `Cancelled invoice ${sale.invoiceNumber}`,
      details: { reason: sale.voidReason, total: sale.total },
      req,
    });

    return { ok: true };
  },
  { role: 'owner' }
);
