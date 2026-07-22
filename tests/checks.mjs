/**
 * Checks for the rules that decide whether money is right.
 *
 *   npm test
 *
 * These run without a database on purpose, so they can be run anywhere, any
 * time, in a second. They cover the arithmetic, the date ranges, the exports,
 * the role boundary and the index definitions that protect against duplicates.
 */

import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { money, resolveRange, toCSV, startOfDay, endOfDay, APP_TZ } from '../lib/util.js';
import { scrubCosts } from '../lib/rbac.js';
import { dailySummaryText, toInternational } from '../lib/notify.js';
import { buildJobItems, summarise } from '../lib/jobs.js';
import { quoteMessage, receiptMessage, waUrl } from '../lib/share.js';
import * as models from '../lib/models.js';

let pass = 0;
let fail = 0;

const section = (name) => console.log(`\n${name}`);
const t = (name, fn) => {
  try {
    fn();
    pass++;
    console.log('  ok    ' + name);
  } catch (e) {
    fail++;
    console.log('  FAIL  ' + name + '  ->  ' + e.message);
  }
};

/* ------------------------------------------------------------------ */

section('money rounding');
t('rounds to 2dp', () => assert.equal(money(1234.567), 1234.57));
t('float dust collapses', () => assert.equal(money(0.1 + 0.2), 0.3));
t('non-numeric input is zero, never NaN', () => assert.equal(money('abc'), 0));
t('a half deposit divides cleanly', () => assert.equal(money(45000 / 2), 22500));

section('invoice balance arithmetic');
t('half deposit leaves the exact balance', () => {
  assert.equal(money(money(45000) - money(22500)), 22500);
});
t('three uneven payments settle to exactly zero', () => {
  assert.equal(money(10000 - money(3333.33 + 3333.33 + 3333.34)), 0);
});
t('a sub-kobo remainder counts as fully paid', () => {
  // recalcSale() treats anything <= 0.009 as settled, so an invoice never
  // sticks on "part paid" because of a rounding crumb.
  assert.ok(money(100 - 99.995) <= 0.009);
});

section('date ranges');
// Note: these are asserted in the SHOP's timezone, never the server's.
// Reading them with getHours()/getDate() would pass on a Lagos laptop and
// fail on a UTC host — which is the bug this whole area exists to prevent.
const inShop = (instant, opts) => new Intl.DateTimeFormat('en-GB', { timeZone: APP_TZ, ...opts }).format(instant);

t('today spans exactly one day', () => {
  const { from, to } = resolveRange({ period: 'today' });
  const hours = (to - from) / 3600000;
  assert.ok(hours > 23.9 && hours < 24.1, `span was ${hours}h`);
  assert.equal(inShop(from, { dateStyle: 'short' }), inShop(to, { dateStyle: 'short' }));
});
t('the week starts on Monday', () => {
  const { from } = resolveRange({ period: 'week' });
  assert.equal(inShop(from, { weekday: 'short' }), 'Mon');
});
t('the month starts on the 1st', () => {
  const { from } = resolveRange({ period: 'month' });
  assert.equal(inShop(from, { day: 'numeric' }), '1');
});

section('date ranges use the shop timezone, not the server clock');
// Hosted on Vercel the server runs in UTC. These assertions read the wall
// clock in the shop's timezone, so they hold whatever the host is set to.
const shopHour = (instant) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: APP_TZ, hour: '2-digit', hour12: false }).format(instant);
const shopDate = (instant) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: APP_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);

t('the timezone defaults to Lagos', () => assert.equal(APP_TZ, 'Africa/Lagos'));
t('a day starts at midnight in the shop, not on the server', () => {
  assert.equal(shopHour(startOfDay(new Date('2026-07-22T10:00:00Z'))), '00');
});
t('a day ends at 23:00-hour in the shop', () => {
  assert.equal(shopHour(endOfDay(new Date('2026-07-22T10:00:00Z'))), '23');
});
t('an evening sale falls on the shop\'s date, not the UTC one', () => {
  // 23:30 Lagos on the 22nd is 22:30 UTC on the 22nd — same day either way.
  // But 00:30 Lagos on the 23rd is 23:30 UTC on the 22nd, and must count as
  // the 23rd. That hour is exactly what an unpinned server gets wrong.
  const lateNight = new Date('2026-07-22T23:30:00Z'); // 00:30 Lagos on the 23rd
  assert.equal(shopDate(lateNight), '2026-07-23');
  assert.equal(shopDate(startOfDay(lateNight)), '2026-07-23');
});
t('a custom range covers the calendar days that were picked', () => {
  const { from, to } = resolveRange({ from: '2026-01-05', to: '2026-01-07' });
  assert.equal(shopDate(from), '2026-01-05');
  assert.equal(shopDate(to), '2026-01-07');
  assert.equal(shopHour(from), '00');
  assert.equal(shopHour(to), '23');
});
t('a one-day custom range is a full day, not zero-length', () => {
  const { from, to } = resolveRange({ from: '2026-03-10', to: '2026-03-10' });
  const hours = (to - from) / 3600000;
  assert.ok(hours > 23.9 && hours < 24.1, `span was ${hours}h`);
});
t('last month ends on the last day of that month', () => {
  const { from, to } = resolveRange({ period: 'lastmonth' });
  assert.ok(to > from);
  assert.equal(shopDate(from).slice(-2), '01');
});

section('multi-item orders');
t('one flat product still produces one item', () => {
  const b = buildJobItems({ jobType: 'Flyers', quantity: 500, unitPrice: 40 });
  assert.equal(b.items.length, 1);
  assert.equal(b.price, 20000);
  assert.equal(b.quantity, 500);
  assert.equal(b.jobType, 'Flyers');
});
t('several products sum into one order total', () => {
  const b = buildJobItems({
    items: [
      { jobType: 'Flyers', quantity: 500, unitPrice: 40 },
      { jobType: 'Business cards', quantity: 100, unitPrice: 80 },
      { jobType: 'Banner', quantity: 1, total: 9000 },
    ],
  });
  assert.equal(b.items.length, 3);
  assert.equal(b.price, 20000 + 8000 + 9000);
  assert.equal(b.quantity, 601);
});
t('an explicit item total beats qty x unit price', () => {
  const b = buildJobItems({ items: [{ jobType: 'Banner', quantity: 3, unitPrice: 5000, total: 12000 }] });
  assert.equal(b.price, 12000);
});
t('the headline job type is the first item', () => {
  const b = buildJobItems({ items: [{ jobType: 'Banner', quantity: 1 }, { jobType: 'Flyers', quantity: 100 }] });
  assert.equal(b.jobType, 'Banner');
});
t('an unknown job type falls back rather than throwing', () => {
  assert.equal(buildJobItems({ items: [{ jobType: 'Nonsense', quantity: 1 }] }).jobType, 'Other');
});
t('the summary names the first item and counts the rest', () => {
  assert.equal(
    summarise([
      { quantity: 500, description: 'A5 flyers' },
      { quantity: 1, description: 'Banner' },
      { quantity: 100, description: 'Cards' },
    ]),
    '500 x A5 flyers + 2 more items'
  );
});
t('a single-item summary has no "+ more"', () => {
  assert.equal(summarise([{ quantity: 500, description: 'A5 flyers' }]), '500 x A5 flyers');
});

section('messages sent to the customer');
const shopSettings = { businessName: 'Test Press', currency: '₦', phone: '08031234567' };
const quote = quoteMessage(
  {
    jobNumber: 'JOB-00007',
    customerName: 'Ada Prints',
    status: 'quote',
    price: 29000,
    discount: 1000,
    deadline: new Date('2026-07-30T09:00:00Z'),
    items: [
      { jobType: 'Flyers', description: 'A5 flyers', quantity: 500, specs: { size: 'A5' }, total: 20000 },
      { jobType: 'Banner', description: 'Roll-up banner', quantity: 1, specs: {}, total: 9000 },
    ],
  },
  shopSettings
);
t('the quote lists every item', () => {
  assert.ok(quote.includes('500 x A5 flyers'), quote);
  assert.ok(quote.includes('1 x Roll-up banner'), quote);
});
t('the quote totals net of discount', () => assert.ok(quote.includes('TOTAL: ₦28,000.00'), quote));
t('the quote states when it will be ready', () => assert.ok(quote.includes('Ready by:')));

const receipt = receiptMessage(
  {
    invoiceNumber: 'INV-00042',
    createdAt: new Date('2026-07-22T10:00:00Z'),
    items: [{ description: '1000 cards', quantity: 1, total: 45000 }],
    total: 45000,
    amountPaid: 22500,
    balance: 22500,
    discount: 0,
  },
  shopSettings
);
t('an unpaid receipt is headed "Invoice"', () => assert.ok(receipt.includes('Invoice INV-00042'), receipt));
t('it states the balance due', () => assert.ok(receipt.includes('BALANCE DUE: ₦22,500.00'), receipt));

const paidReceipt = receiptMessage(
  { invoiceNumber: 'INV-00043', createdAt: new Date(), items: [], total: 5000, amountPaid: 5000, balance: 0 },
  shopSettings
);
t('a settled receipt is headed "Receipt"', () => assert.ok(paidReceipt.includes('Receipt INV-00043')));
t('a settled receipt says paid in full', () => assert.ok(paidReceipt.includes('Paid in full')));
t('the WhatsApp link carries the message', () => {
  const url = waUrl('08031234567', 'hello there');
  assert.ok(url.startsWith('https://wa.me/2348031234567?text='));
  assert.ok(url.includes(encodeURIComponent('hello there')));
});
t('no phone means no WhatsApp link', () => assert.equal(waUrl('', 'x'), null));

section('CSV export');
t('escapes commas and quotes in a customer name', () => {
  const csv = toCSV([{ a: 'Ade, "Big" Print', b: 5000 }], [
    { label: 'Customer', value: 'a' },
    { label: 'Total', value: 'b' },
  ]);
  assert.ok(csv.includes('"Ade, ""Big"" Print"'), csv);
});
t('leads with a BOM so Excel renders the naira sign', () => {
  assert.equal(toCSV([], [{ label: 'x', value: 'x' }]).charCodeAt(0), 0xfeff);
});

section('phone numbers for WhatsApp');
t('0803… becomes 234803…', () => assert.equal(toInternational('08031234567'), '2348031234567'));
t('an international number is left alone', () => assert.equal(toInternational('2348031234567'), '2348031234567'));
t('spaces and dashes are stripped', () => assert.equal(toInternational('0803-123 4567'), '2348031234567'));
t('nothing in, nothing out', () => assert.equal(toInternational(''), null));

section('shared vocabularies stay in step');
t('every job status is ordered or is "cancelled"', () => {
  for (const s of models.JOB_STATUS_ALL) {
    assert.ok(models.JOB_STATUSES.includes(s) || s === 'cancelled', s);
  }
});
t('every payment method has a label', () => {
  for (const m of models.PAYMENT_METHODS) assert.ok(models.PAYMENT_METHOD_LABELS[m], m);
});
t('every movement type has a label', () => {
  for (const m of models.MOVEMENT_TYPES) assert.ok(models.MOVEMENT_LABELS[m], m);
});
t('outward movements are all real movement types', () => {
  for (const m of models.OUTWARD_MOVEMENTS) assert.ok(models.MOVEMENT_TYPES.includes(m), m);
});

section('schemas compile');
for (const name of [
  'User', 'Customer', 'Supplier', 'Material', 'StockMovement', 'PriceItem',
  'Job', 'Sale', 'Payment', 'RegisterSession', 'AuditLog', 'Settings', 'Counter',
]) {
  t(name, () => assert.ok(models[name]?.schema));
}

section('the indexes that prevent duplicate money');
t('Sale.clientRef is unique (offline replay guard)', () => {
  const idx = models.Sale.schema.indexes().find(([k]) => k.clientRef);
  assert.ok(idx, 'missing');
  assert.equal(idx[1].unique, true);
});
t('Payment.clientRef is unique (offline replay guard)', () => {
  const idx = models.Payment.schema.indexes().find(([k]) => k.clientRef);
  assert.ok(idx, 'missing');
  assert.equal(idx[1].unique, true);
});
t('Payment.reference is unique (one payment, one invoice)', () => {
  const idx = models.Payment.schema.indexes().find(([k]) => k.reference);
  assert.ok(idx, 'missing');
  assert.equal(idx[1].unique, true);
});
t('partial index filters use only operators MongoDB accepts there', () => {
  // $ne is NOT valid in a partialFilterExpression — using it makes the index
  // fail to build at runtime, silently removing the duplicate protection.
  const ALLOWED = new Set(['$exists', '$type', '$eq', '$gt', '$gte', '$lt', '$lte', '$and', '$in']);
  for (const model of [models.Payment, models.Sale, models.Job]) {
    for (const [, opts] of model.schema.indexes()) {
      if (!opts?.partialFilterExpression) continue;
      for (const cond of Object.values(opts.partialFilterExpression)) {
        if (cond && typeof cond === 'object') {
          for (const op of Object.keys(cond)) {
            assert.ok(ALLOWED.has(op), `${op} is not permitted in a partialFilterExpression`);
          }
        }
      }
    }
  }
});

section('cashiers cannot see cost or profit');
const oid = new mongoose.Types.ObjectId();
const matOid = new mongoose.Types.ObjectId();
const when = new Date('2026-07-22T10:00:00Z');

const payload = {
  sale: {
    _id: oid,
    invoiceNumber: 'INV-00042',
    customerName: 'Ada Prints',
    total: 45000,
    amountPaid: 22500,
    balance: 22500,
    createdAt: when,
    materialCost: 19000,
    items: [{ description: '1000 cards', quantity: 1, unitPrice: 45000, total: 45000, unitCost: 19000 }],
  },
  materials: [{ _id: matOid, name: 'Art paper 300gsm', quantity: 500, unitCost: 120 }],
  summary: { billed: 45000, collected: 22500, profit: 26000, wastageValue: 3000 },
};

const asOwner = scrubCosts(payload, { role: 'owner' });
const asCashier = scrubCosts(payload, { role: 'cashier' });

t('the owner keeps material cost', () => assert.equal(asOwner.sale.materialCost, 19000));
t('the owner keeps profit', () => assert.equal(asOwner.summary.profit, 26000));
t('the cashier loses material cost', () => assert.equal(asCashier.sale.materialCost, undefined));
t('the cashier loses per-line unit cost', () => assert.equal(asCashier.sale.items[0].unitCost, undefined));
t('the cashier loses stock unit cost', () => assert.equal(asCashier.materials[0].unitCost, undefined));
t('the cashier loses profit', () => assert.equal(asCashier.summary.profit, undefined));
t('the cashier loses wastage value', () => assert.equal(asCashier.summary.wastageValue, undefined));

section('…without breaking the rest of the response');
t('_id survives as an ObjectId, not a rebuilt buffer', () => {
  assert.ok(asCashier.sale._id instanceof mongoose.Types.ObjectId, `got ${typeof asCashier.sale._id}`);
  assert.equal(String(asCashier.sale._id), String(oid));
});
t('a nested _id inside an array survives', () => {
  assert.equal(String(asCashier.materials[0]._id), String(matOid));
});
t('Dates survive as Dates', () => {
  assert.ok(asCashier.sale.createdAt instanceof Date);
  assert.equal(asCashier.sale.createdAt.getTime(), when.getTime());
});
t('_id serialises to a usable id over the wire', () => {
  assert.equal(JSON.parse(JSON.stringify(asCashier)).sale._id, String(oid));
});
t('the figures a cashier legitimately needs are intact', () => {
  assert.equal(asCashier.sale.total, 45000);
  assert.equal(asCashier.sale.balance, 22500);
  assert.equal(asCashier.sale.invoiceNumber, 'INV-00042');
});
t('the original payload is not mutated', () => assert.equal(payload.sale.materialCost, 19000));

section('the daily summary the owner receives');
const grossMargin = 240000 - 81000 - 4200; // billed − materials − wastage
const expenses = 46000;
const report = {
  summary: {
    collected: 187500, billed: 240000, discount: 2000, invoiceCount: 9,
    jobsCreated: 11, jobsCompleted: 7, outstanding: 96500, outstandingCount: 4,
    refunds: 5000, refundCount: 1, materialCost: 81000, wastageValue: 4200,
    expenses, grossMargin, netProfit: grossMargin - expenses,
  },
  byMethod: { cash: 62500, transfer: 80000, pos: 25000, online: 20000 },
  register: { sessions: 2, shortfall: 1500, over: 0 },
  staff: [{ name: 'Ada', collected: 120000, jobs: 6 }, { name: 'Musa', collected: 67500, jobs: 5 }],
  jobTypes: [{ jobType: 'Banner', value: 90000 }],
  wastage: [{ name: 'Art paper 300gsm' }],
  expensesByCategory: [
    { category: 'Diesel / Fuel', total: 30000 },
    { category: 'Transport & delivery', total: 16000 },
  ],
};
const text = dailySummaryText(report, { businessName: 'Test Press', currency: '₦', label: 'Today' });

t('names the business', () => assert.ok(text.includes('Test Press')));
t('leads with money in', () => assert.ok(text.includes('MONEY IN: ₦187,500.00'), text));
t('breaks money down by method', () => {
  for (const m of ['Cash', 'Transfer', 'POS/Card', 'Online']) assert.ok(text.includes(m), m);
});
t('states what is owed', () => assert.ok(text.includes('OWED TO YOU: ₦96,500.00')));
t('flags a till shortfall', () => assert.ok(text.includes('SHORT ₦1,500.00'), text));
t('reports each member of staff', () => assert.ok(text.includes('Ada: ₦120,000.00 taken, 6 job(s)')));

section('profit is reported honestly');
t('gross margin and net profit are both shown', () => {
  assert.ok(text.includes('Gross margin: ₦154,800.00'), text);
  assert.ok(text.includes('NET PROFIT: ₦108,800.00'), text);
});
t('net profit is lower than gross margin once costs are counted', () => {
  assert.ok(report.summary.netProfit < report.summary.grossMargin);
});
t('running costs are stated, not buried', () => {
  assert.ok(text.includes('Running costs: ₦46,000.00'), text);
  assert.ok(text.includes('Diesel / Fuel ₦30,000.00'), text);
});
t('expense figures are hidden from cashiers', () => {
  const forCashier = scrubCosts({ summary: report.summary, expensesByCategory: report.expensesByCategory }, {
    role: 'cashier',
  });
  assert.equal(forCashier.summary.netProfit, undefined);
  assert.equal(forCashier.summary.grossMargin, undefined);
  assert.equal(forCashier.summary.expenses, undefined);
  assert.equal(forCashier.expensesByCategory, undefined);
  // …but the takings themselves are not cost data.
  assert.equal(forCashier.summary.collected, 187500);
});

/* ------------------------------------------------------------------ */

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
