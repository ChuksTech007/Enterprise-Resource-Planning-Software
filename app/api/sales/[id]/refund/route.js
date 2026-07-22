import { route, scrubCosts, notFound } from '@/lib/http';
import { Sale } from '@/lib/models';
import { recordRefund } from '@/lib/invoicing';
import { recalcCustomer } from '@/lib/rollups';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// Refunds move money out of the business, so they are owner-only and always
// carry a reason. They are recorded as negative payments rather than by
// editing the original payment, so the trail stays intact.
export const POST = route(
  async ({ params, body, user, req }) => {
    const sale = await Sale.findById(params.id);
    if (!sale) throw notFound('Invoice not found');

    const { payment, sale: updated } = await recordRefund({
      sale,
      amount: body.amount,
      method: body.method || 'cash',
      reason: body.reason,
      user,
    });

    if (sale.customer) await recalcCustomer(sale.customer);

    await logAction(user, 'payment.refund', {
      entity: 'Sale',
      entityId: sale._id,
      label: `Refunded ${Math.abs(payment.amount)} on ${sale.invoiceNumber}`,
      details: { reason: body.reason, method: payment.method },
      req,
    });

    return scrubCosts({ payment: payment.toObject(), sale: updated.toObject?.() ?? updated }, user);
  },
  { role: 'owner' }
);
