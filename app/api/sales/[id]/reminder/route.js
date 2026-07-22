import { route, notFound, bad } from '@/lib/http';
import { Sale, Customer, Settings } from '@/lib/models';
import { logAction } from '@/lib/audit';
import { formatMoney, fmtDate } from '@/lib/util';

export const dynamic = 'force-dynamic';

/**
 * Prepare a balance reminder for a customer.
 *
 * WhatsApp's Business API needs template approval and a paid number, which is
 * more than a small press wants to deal with on day one. So instead of
 * pretending to send, this builds a ready-to-send wa.me link that opens
 * WhatsApp with the message already typed. The cashier taps send. The reminder
 * is still logged, so the owner can see who has been chased and when.
 */
export const POST = route(async ({ params, user, req }) => {
  const sale = await Sale.findById(params.id);
  if (!sale) throw notFound('Invoice not found');
  if (sale.balance <= 0) throw bad('Nothing is owed on this invoice');

  const settings = await Settings.findOne({ key: 'main' }).lean();
  const currency = settings?.currency || '₦';
  const business = settings?.businessName || 'our press';

  let phone = sale.customerPhone;
  if (!phone && sale.customer) {
    const customer = await Customer.findById(sale.customer).select('phone').lean();
    phone = customer?.phone;
  }

  const message =
    `Hello ${sale.customerName},\n\n` +
    `This is a reminder from ${business} about invoice ${sale.invoiceNumber}` +
    (sale.jobNumber ? ` (job ${sale.jobNumber})` : '') +
    `.\n\n` +
    `Total: ${formatMoney(sale.total, currency)}\n` +
    `Paid: ${formatMoney(sale.amountPaid, currency)}\n` +
    `Balance due: ${formatMoney(sale.balance, currency)}\n` +
    (sale.dueDate ? `Due: ${fmtDate(sale.dueDate)}\n` : '') +
    `\nKindly settle the balance at your convenience. Thank you.`;

  sale.lastReminderAt = new Date();
  sale.reminderCount = (sale.reminderCount || 0) + 1;
  await sale.save();

  await logAction(user, 'sale.reminder', {
    entity: 'Sale',
    entityId: sale._id,
    label: `Reminder #${sale.reminderCount} prepared for ${sale.customerName} (${sale.balance} owing)`,
    req,
  });

  return {
    message,
    phone: normalise(phone),
    whatsappUrl: normalise(phone)
      ? `https://wa.me/${normalise(phone)}?text=${encodeURIComponent(message)}`
      : null,
    smsUrl: phone ? `sms:${phone}?body=${encodeURIComponent(message)}` : null,
    reminderCount: sale.reminderCount,
  };
});

/** Nigerian local format (0803…) -> international (234803…) for wa.me. */
function normalise(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('234')) return digits;
  if (digits.startsWith('0')) return '234' + digits.slice(1);
  if (digits.length === 10) return '234' + digits;
  return digits;
}
