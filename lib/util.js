/** Round to 2dp. Every monetary value is passed through this on write. */
export function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

export function formatMoney(n, currency = '₦') {
  return currency + money(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/* ------------------------------------------------------------------ *
 * Dates.
 *
 * Every figure the owner reads is bounded by a date range, so "what counts
 * as today" has to be the shop's day — not the server's. Hosted on Vercel the
 * server runs in UTC, which would quietly shift every daily total and every
 * month boundary by an hour. All range maths below is therefore done in an
 * explicit timezone, defaulting to Lagos.
 * ------------------------------------------------------------------ */

export const APP_TZ = process.env.APP_TIMEZONE || 'Africa/Lagos';

/** The wall-clock fields showing on a clock in `tz` at a given instant. */
function wallClock(instant, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = {};
  for (const part of dtf.formatToParts(instant)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  if (p.hour === 24) p.hour = 0; // some engines report midnight as hour 24
  return p;
}

/** How far ahead of UTC `tz` is at a given instant, in milliseconds. */
function offsetMs(instant, tz) {
  const p = wallClock(instant, tz);
  const asIfUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const whole = instant.getTime() - (instant.getTime() % 1000);
  return asIfUTC - whole;
}

/** Turn a wall-clock time in `tz` into the real instant it refers to. */
function zonedToInstant({ year, month, day, hour = 0, minute = 0, second = 0, ms = 0 }, tz) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  // Two passes so a DST boundary resolves correctly. Lagos has no DST, but
  // this keeps the helper honest if the shop is ever somewhere that does.
  let instant = new Date(guess - offsetMs(new Date(guess), tz));
  instant = new Date(guess - offsetMs(instant, tz));
  return instant;
}

/** Day of the week (0 = Sunday) as it reads in `tz`. */
function zonedWeekday(instant, tz) {
  const p = wallClock(instant, tz);
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

/** The first instant of the shop's day containing `d`. */
export function startOfDay(d = new Date(), tz = APP_TZ) {
  const p = wallClock(new Date(d), tz);
  return zonedToInstant({ year: p.year, month: p.month, day: p.day }, tz);
}

/** The last instant of the shop's day containing `d`. */
export function endOfDay(d = new Date(), tz = APP_TZ) {
  const p = wallClock(new Date(d), tz);
  return zonedToInstant(
    { year: p.year, month: p.month, day: p.day, hour: 23, minute: 59, second: 59, ms: 999 },
    tz
  );
}

/** Shift by whole days in the shop's timezone, not by 24h of elapsed time. */
function addDays(d, days, tz = APP_TZ) {
  const p = wallClock(new Date(d), tz);
  return zonedToInstant({ year: p.year, month: p.month, day: p.day + days }, tz);
}

/**
 * Turn a report request into a concrete {from, to, label} range.
 * Accepts a named period or an explicit from/to pair.
 */
export function resolveRange({ period, from, to } = {}, tz = APP_TZ) {
  const now = new Date();
  const today = wallClock(now, tz);

  if (from || to) {
    // A date picked as "2026-01-05" means that calendar day in the shop's
    // timezone, so it is parsed by its parts rather than as a UTC instant.
    const parse = (v, fallback) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
      return m ? { year: +m[1], month: +m[2], day: +m[3] } : fallback;
    };
    const f = parse(from, today);
    const t = parse(to, today);
    const fromInstant = zonedToInstant(f, tz);
    const toInstant = zonedToInstant({ ...t, hour: 23, minute: 59, second: 59, ms: 999 }, tz);
    return {
      from: fromInstant,
      to: toInstant,
      label: `${fmtDate(fromInstant)} – ${fmtDate(toInstant)}`,
      period: 'custom',
    };
  }

  switch (period) {
    case 'yesterday': {
      const y = addDays(now, -1, tz);
      return { from: startOfDay(y, tz), to: endOfDay(y, tz), label: 'Yesterday', period };
    }
    case 'week': {
      // Week starts Monday — that is how shops talk about the week.
      const back = (zonedWeekday(now, tz) + 6) % 7;
      return {
        from: startOfDay(addDays(now, -back, tz), tz),
        to: endOfDay(now, tz),
        label: 'This week',
        period,
      };
    }
    case 'month':
      return {
        from: zonedToInstant({ year: today.year, month: today.month, day: 1 }, tz),
        to: endOfDay(now, tz),
        label: 'This month',
        period,
      };
    case 'lastmonth': {
      const start = zonedToInstant({ year: today.year, month: today.month - 1, day: 1 }, tz);
      // Day 0 of this month is the last day of the previous one.
      const end = zonedToInstant(
        { year: today.year, month: today.month, day: 0, hour: 23, minute: 59, second: 59, ms: 999 },
        tz
      );
      return { from: start, to: end, label: 'Last month', period };
    }
    case 'year':
      return {
        from: zonedToInstant({ year: today.year, month: 1, day: 1 }, tz),
        to: endOfDay(now, tz),
        label: 'This year',
        period,
      };
    case 'today':
    default:
      return { from: startOfDay(now, tz), to: endOfDay(now, tz), label: 'Today', period: 'today' };
  }
}

// Server-side formatting (CSV exports, summary messages) is pinned to the
// shop's timezone too, so an export never disagrees with the screen.
export function fmtDate(d, tz = APP_TZ) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', {
    timeZone: tz,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function fmtDateTime(d, tz = APP_TZ) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-GB', {
    timeZone: tz,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Build a CSV string. Excel opens this directly. */
export function toCSV(rows, columns) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.label)).join(',');
  const body = rows
    .map((r) => columns.map((c) => esc(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(','))
    .join('\n');
  // BOM so Excel reads UTF-8 (and the ₦ sign) correctly.
  return '﻿' + head + '\n' + body;
}

export function slug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
