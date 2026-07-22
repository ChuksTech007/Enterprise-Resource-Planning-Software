import { route, notFound } from '@/lib/http';
import { Sale, Customer, Settings } from '@/lib/models';
import { receiptMessage, waUrl, smsUrl } from '@/lib/share';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Prepare a receipt (or invoice, if a balance remains) to send on WhatsApp. */
export const POST = route(async ({ params, user, req }) => {
  const sale = await Sale.findById(params.id).lean();
  if (!sale) throw notFound('Invoice not found');

  const settings = (await Settings.findOne({ key: 'main' }).lean()) || {};

  let phone = sale.customerPhone;
  if (!phone && sale.customer) {
    const customer = await Customer.findById(sale.customer).select('phone').lean();
    phone = customer?.phone;
  }

  const message = receiptMessage(sale, settings);

  await logAction(user, 'sale.share', {
    entity: 'Sale',
    entityId: sale._id,
    label: `Sent ${sale.balance > 0 ? 'invoice' : 'receipt'} ${sale.invoiceNumber} to ${sale.customerName}`,
    req,
  });

  return {
    message,
    phone,
    whatsappUrl: waUrl(phone, message),
    smsUrl: smsUrl(phone, message),
  };
});
