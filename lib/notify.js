import { formatMoney } from './util.js';

/**
 * Turn a report into the plain-text message the owner reads on his phone.
 * Deliberately plain text: it renders identically in email, WhatsApp and SMS,
 * and stays readable on a cheap Android in poor light.
 */
export function dailySummaryText(report, { businessName = 'the press', currency = '₦', label = 'Today' } = {}) {
  const s = report.summary;
  const m = report.byMethod;
  const money = (v) => formatMoney(v, currency);

  const lines = [
    `*${businessName}* — ${label}`,
    ``,
    `MONEY IN: ${money(s.collected)}`,
    `  Cash: ${money(m.cash)}`,
    `  Transfer: ${money(m.transfer)}`,
    `  POS/Card: ${money(m.pos)}`,
    `  Online: ${money(m.online)}`,
    ``,
    `Work invoiced: ${money(s.billed)}`,
    `Jobs created: ${s.jobsCreated}   Completed: ${s.jobsCompleted}`,
  ];

  if (s.refunds > 0) lines.push(`Refunds: ${money(s.refunds)} (${s.refundCount})`);
  if (s.discount > 0) lines.push(`Discounts: ${money(s.discount)}`);

  lines.push(
    ``,
    `Gross margin: ${money(s.grossMargin)}`,
    `  (after ${money(s.materialCost)} materials, ${money(s.wastageValue)} wastage)`,
    `Running costs: ${money(s.expenses)}`,
    `NET PROFIT: ${money(s.netProfit)}`
  );

  if (report.expensesByCategory?.length) {
    const top = report.expensesByCategory.slice(0, 3).map((e) => `${e.category} ${money(e.total)}`);
    lines.push(`  (${top.join(', ')})`);
  }

  lines.push(``, `OWED TO YOU: ${money(s.outstanding)} across ${s.outstandingCount} invoice(s)`);

  if (report.register.sessions > 0) {
    lines.push(
      ``,
      `Till: ${report.register.sessions} shift(s) closed` +
        (report.register.shortfall > 0 ? ` — SHORT ${money(report.register.shortfall)}` : ' — balanced')
    );
  }

  if (report.staff?.length) {
    lines.push(``, `By staff:`);
    for (const st of report.staff.slice(0, 6)) {
      lines.push(`  ${st.name}: ${money(st.collected)} taken, ${st.jobs} job(s)`);
    }
  }

  const topType = report.jobTypes?.[0];
  if (topType) lines.push(``, `Best seller: ${topType.jobType} (${money(topType.value)})`);

  if (report.wastage?.length) {
    lines.push(``, `Wastage logged: ${report.wastage.length} item(s), ${money(s.wastageValue)}`);
  }

  return lines.join('\n');
}

/** Local Nigerian number -> international, for wa.me links. */
export function toInternational(phone) {
  if (!phone) return null;
  const d = String(phone).replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('234')) return d;
  if (d.startsWith('0')) return '234' + d.slice(1);
  if (d.length === 10) return '234' + d;
  return d;
}

/**
 * Send the summary by email if SMTP is configured. Returns a result object
 * rather than throwing — a failed email must never break the closing routine,
 * and the owner still has the WhatsApp link and the on-screen summary.
 */
export async function sendSummaryEmail({ to, subject, text }) {
  if (!process.env.SMTP_HOST || !to) {
    return { sent: false, reason: 'Email is not configured' };
  }
  try {
    const nodemailer = (await import('nodemailer')).default;
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });

    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text: text.replace(/\*/g, ''), // WhatsApp bold markers mean nothing in email
    });

    return { sent: true };
  } catch (err) {
    console.error('[notify] email failed', err.message);
    return { sent: false, reason: err.message };
  }
}
