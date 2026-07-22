import { formatMoney, fmtDate } from './util.js';
import { toInternational } from './notify.js';
import { describeItem } from './jobs.js';

/**
 * Messages a customer actually receives.
 *
 * Same approach as the balance reminders: build the text, hand back a wa.me
 * link that opens WhatsApp with it typed, and let the cashier press send.
 * Customers ask for their receipt on WhatsApp far more often than on paper.
 */

export function waUrl(phone, message) {
  const number = toInternational(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null;
}

export function smsUrl(phone, message) {
  return phone ? `sms:${phone}?body=${encodeURIComponent(message)}` : null;
}

/** A quote or job confirmation. */
export function quoteMessage(job, settings = {}) {
  const currency = settings.currency || '₦';
  const m = (v) => formatMoney(v, currency);
  const isQuote = job.status === 'quote';

  const items = job.items?.length
    ? job.items
    : [{ jobType: job.jobType, description: job.description, quantity: job.quantity, specs: job.specs, total: job.price }];

  const lines = [
    `*${settings.businessName || 'Our press'}*`,
    ``,
    `${isQuote ? 'Quote' : 'Job'} ${job.jobNumber} for ${job.customerName}`,
    ``,
  ];

  for (const item of items) {
    lines.push(`• ${item.quantity} x ${describeItem(item)}`);
    lines.push(`   ${m(item.total)}`);
  }

  const total = (job.price || 0) - (job.discount || 0);
  if (job.discount > 0) lines.push(``, `Discount: −${m(job.discount)}`);
  lines.push(``, `TOTAL: ${m(total)}`);

  if (job.deadline) lines.push(`Ready by: ${fmtDate(job.deadline)}`);
  if (isQuote) lines.push(``, `This quote is valid for 7 days. Let us know to proceed.`);

  if (settings.phone) lines.push(``, settings.phone);

  return lines.join('\n');
}

/** A receipt, or an invoice if there is still a balance. */
export function receiptMessage(sale, settings = {}) {
  const currency = settings.currency || '₦';
  const m = (v) => formatMoney(v, currency);
  const owing = sale.balance > 0;

  const lines = [
    `*${settings.businessName || 'Our press'}*`,
    ``,
    `${owing ? 'Invoice' : 'Receipt'} ${sale.invoiceNumber}`,
    `${fmtDate(sale.createdAt)}`,
    sale.jobNumber ? `Job ${sale.jobNumber}` : '',
    ``,
  ].filter((l) => l !== '');

  for (const item of sale.items || []) {
    lines.push(`• ${item.quantity} x ${item.description} — ${m(item.total)}`);
  }

  lines.push(``);
  if (sale.discount > 0) lines.push(`Discount: −${m(sale.discount)}`);
  lines.push(`TOTAL: ${m(sale.total)}`);
  lines.push(`Paid: ${m(sale.amountPaid)}`);

  if (owing) {
    lines.push(`*BALANCE DUE: ${m(sale.balance)}*`);
    if (sale.dueDate) lines.push(`Due: ${fmtDate(sale.dueDate)}`);
  } else {
    lines.push(``, `Paid in full — thank you.`);
  }

  if (settings.receiptFooter) lines.push(``, settings.receiptFooter);

  return lines.join('\n');
}
