import { NextResponse } from 'next/server';
import { route } from '@/lib/http';
import { dbConnect } from '@/lib/db';
import { Settings } from '@/lib/models';
import { buildReport } from '@/lib/reports';
import { dailySummaryText, sendSummaryEmail, toInternational } from '@/lib/notify';
import { resolveRange } from '@/lib/util';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

async function makeSummary(query) {
  const range = resolveRange({ period: query.period || 'today', from: query.from, to: query.to });
  const settings = (await Settings.findOne({ key: 'main' }).lean()) || {};
  const report = await buildReport(range);

  const text = dailySummaryText(report, {
    businessName: settings.businessName || "Master's Technology",
    currency: settings.currency || '₦',
    label: range.label,
  });

  const wa = toInternational(settings.ownerWhatsapp);

  return {
    range,
    settings,
    report,
    text,
    whatsappUrl: wa ? `https://wa.me/${wa}?text=${encodeURIComponent(text)}` : null,
  };
}

/**
 * The owner's end-of-day message.
 *
 * Two ways in:
 *  1. Signed in as owner — used by the "Daily summary" button, which shows the
 *     text and offers one tap to WhatsApp it.
 *  2. With ?secret=CRON_SECRET — for an unattended scheduled call at closing
 *     time, which emails it. See README for how to schedule it.
 */
export const GET = async (req) => {
  const url = new URL(req.url);
  const query = Object.fromEntries(url.searchParams);

  // Vercel Cron cannot carry a query string — it sends the CRON_SECRET as a
  // bearer token instead. Windows Task Scheduler and curl find ?secret= far
  // easier. Both are accepted.
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const presented = query.secret || bearer;

  if (presented) {
    if (!process.env.CRON_SECRET || presented !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
    }
    await dbConnect();
    const { text, settings, whatsappUrl, range } = await makeSummary(query);
    const email = await sendSummaryEmail({
      to: settings.ownerEmail,
      subject: `${settings.businessName || 'Press'} — takings for ${range.label}`,
      text,
    });
    return NextResponse.json({ ok: true, email, text, whatsappUrl });
  }

  // Signed-in path.
  return route(
    async ({ query: q, user, req: r }) => {
      const { text, whatsappUrl, report, range, settings } = await makeSummary(q);

      if (q.email === '1') {
        const email = await sendSummaryEmail({
          to: settings.ownerEmail,
          subject: `${settings.businessName || 'Press'} — takings for ${range.label}`,
          text,
        });
        await logAction(user, 'summary.email', {
          entity: 'Report',
          label: `Emailed the ${range.label} summary`,
          details: email,
          req: r,
        });
        return { text, whatsappUrl, report, label: range.label, email };
      }

      return { text, whatsappUrl, report, label: range.label };
    },
    { role: 'owner' }
  )(req, {});
};
