/**
 * Integration checks against a real MongoDB.
 *
 *   npm run test:db
 *
 * These exercise the things unit tests cannot: that the aggregations actually
 * run, that the unique indexes really are enforced by the database, that stock
 * comes off exactly once, and that a till reconciles.
 *
 * It runs against a SEPARATE database (…_test) and drops it when finished, so
 * the shop's real data is never touched.
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv(file) {
  const path = resolve(root, file);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!m) continue;
    let v = (m[2] || '').trim();
    if (/^["'].*["']$/.test(v)) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnv('.env.local');

if (!process.env.MONGODB_URI) {
  console.error('\n  MONGODB_URI is not set — skipping integration checks.\n');
  process.exit(0);
}

// Redirect to a throwaway database on the same cluster.
const testUri = process.env.MONGODB_URI.replace(/\/([^/?]+)(\?|$)/, '/printpress_test$2');

const models = await import('../lib/models.js');
const {
  User, Customer, Material, Job, Sale, Payment, RegisterSession, Expense, Settings, Counter, StockMovement,
  Account, JournalEntry, PurchaseOrder, SupplierPayment, FixedAsset, DepreciationRun, Supplier,
} = models;
const { ensureSaleForJob, recordPayment, recordRefund } = await import('../lib/invoicing.js');
const { deductJobMaterials, applyMovement } = await import('../lib/stock.js');
const { buildJobItems } = await import('../lib/jobs.js');
const { buildReport, debtorList } = await import('../lib/reports.js');
const { recalcSale } = await import('../lib/rollups.js');
const { resolveRange, money: M } = await import('../lib/util.js');
const { nextJobNumber, nextNumber } = await import('../lib/numbering.js');
const { ensureAccounts, A } = await import('../lib/accounting/coa.js');
const { postSafely, accountBalances } = await import('../lib/accounting/ledger.js');
const { postingsForReceipt, postingsForSupplierPayment, postingsForAsset, postingsForDepreciation } =
  await import('../lib/accounting/postings.js');
const { trialBalance, profitAndLoss, balanceSheet, rebuildLedger } = await import('../lib/accounting/statements.js');
const { recordExpense } = await import('../lib/expenses.js');

let pass = 0;
let fail = 0;
const section = (n) => console.log(`\n${n}`);
const t = async (name, fn) => {
  try {
    await fn();
    pass++;
    console.log('  ok    ' + name);
  } catch (e) {
    fail++;
    console.log('  FAIL  ' + name + '  ->  ' + e.message);
  }
};

console.log('Connecting to the test database…');
await mongoose.connect(testUri, { serverSelectionTimeoutMS: 20000 });
await mongoose.connection.dropDatabase();
console.log('Connected to printpress_test (fresh).\n');

// Build the indexes — this is itself a test: a bad partial filter fails here.
await Promise.all(
  [
    User, Customer, Material, Job, Sale, Payment, RegisterSession, Expense, Settings, Counter, StockMovement,
    Account, JournalEntry, PurchaseOrder, SupplierPayment, FixedAsset, DepreciationRun, Supplier,
  ].map((m) => m.createIndexes())
);
await ensureAccounts();

/* ------------------------------------------------------------------ */

section('indexes actually build in MongoDB');
await t('every model created its indexes without error', async () => {
  const idx = await Payment.collection.indexes();
  assert.ok(idx.some((i) => i.key?.reference === 1 && i.unique), 'no unique reference index');
  assert.ok(idx.some((i) => i.key?.clientRef === 1 && i.unique), 'no unique clientRef index');
});

/* ------------------------------------------------------------------ */

const owner = await User.create({
  name: 'Test Owner',
  username: 'testowner',
  passwordHash: 'x',
  role: 'owner',
});
const cashier = await User.create({
  name: 'Test Cashier',
  username: 'testcashier',
  passwordHash: 'x',
  role: 'cashier',
});
const customer = await Customer.create({ name: 'Ada Prints', phone: '08031234567' });

const paper = await Material.create({
  name: 'Art paper 300gsm',
  category: 'Paper',
  unit: 'sheets',
  quantity: 1000,
  reorderLevel: 100,
  unitCost: 120,
});

const till = await RegisterSession.create({
  user: cashier._id,
  userName: cashier.name,
  openingFloat: 5000,
});

/* ------------------------------------------------------------------ */

section('a two-item job becomes one itemised invoice');

const built = buildJobItems({
  items: [
    { jobType: 'Flyers', description: 'A5 flyers', quantity: 500, unitPrice: 40, specs: { size: 'A5' } },
    { jobType: 'Banner', description: 'Roll-up banner', quantity: 1, total: 9000 },
  ],
});

const job = await Job.create({
  jobNumber: await nextJobNumber(),
  customer: customer._id,
  customerName: customer.name,
  items: built.items,
  jobType: built.jobType,
  description: built.description,
  quantity: built.quantity,
  specs: built.specs,
  price: built.price,
  status: 'approved',
  materials: [{ material: paper._id, name: paper.name, quantity: 250, unit: 'sheets', unitCost: 120 }],
  createdBy: cashier._id,
  createdByName: cashier.name,
  statusHistory: [{ status: 'approved', at: new Date(), by: cashier.name }],
});

let sale = await ensureSaleForJob(job, cashier);

await t('the order totals 29,000', () => assert.equal(built.price, 29000));
await t('the invoice has one line per product', () => assert.equal(sale.items.length, 2));
await t('the invoice total matches the order', () => assert.equal(sale.total, 29000));
await t('it starts fully unpaid', () => {
  assert.equal(sale.status, 'unpaid');
  assert.equal(sale.balance, 29000);
});

/* ------------------------------------------------------------------ */

section('half now, half on collection');

const dep = await recordPayment({
  sale,
  amount: 14500,
  method: 'cash',
  isDeposit: true,
  user: cashier,
});
sale = dep.sale;

await t('the balance halves', () => assert.equal(sale.balance, 14500));
await t('it is marked part paid', () => assert.equal(sale.status, 'partial'));
await t('the payment is tied to the open till', () => assert.equal(String(dep.payment.registerSession), String(till._id)));

await t('paying more than is owed is refused', async () => {
  await assert.rejects(
    () => recordPayment({ sale, amount: 145000, method: 'cash', user: cashier }),
    /more than/i
  );
});

await t('a transfer with no reference is refused', async () => {
  await assert.rejects(
    () => recordPayment({ sale, amount: 100, method: 'transfer', user: cashier }),
    /reference/i
  );
});

await t('the same transfer reference cannot be used twice', async () => {
  const first = await recordPayment({
    sale,
    amount: 500,
    method: 'transfer',
    reference: 'TRF/UNIQUE/001',
    user: cashier,
  });
  sale = first.sale;
  await assert.rejects(
    () => recordPayment({ sale, amount: 500, method: 'transfer', reference: 'TRF/UNIQUE/001', user: cashier }),
    (e) => e.code === 11000 || /already in use|duplicate/i.test(e.message)
  );
});

await t('an offline replay does not take the money twice', async () => {
  const ref = 'client-abc-123';
  const a = await recordPayment({ sale, amount: 1000, method: 'cash', user: cashier, clientRef: ref });
  sale = a.sale;
  const balanceAfterFirst = sale.balance;

  // The same queued write arriving a second time.
  await assert.rejects(
    () => recordPayment({ sale, amount: 1000, method: 'cash', user: cashier, clientRef: ref }),
    (e) => e.code === 11000
  );

  const fresh = await recalcSale(sale._id);
  assert.equal(fresh.balance, balanceAfterFirst, 'balance moved on the replay');
});

/* ------------------------------------------------------------------ */

section('finishing the job takes stock off, once');

await t('stock is deducted when the job is done', async () => {
  await deductJobMaterials(job, cashier);
  const after = await Material.findById(paper._id);
  assert.equal(after.quantity, 750, `expected 750, got ${after.quantity}`);
});

await t('running it again does not deduct a second time', async () => {
  const reloaded = await Job.findById(job._id);
  await deductJobMaterials(reloaded, cashier);
  const after = await Material.findById(paper._id);
  assert.equal(after.quantity, 750, 'stock moved twice');
});

await t('the movement log explains the balance', async () => {
  const moves = await StockMovement.find({ material: paper._id }).lean();
  const net = moves.reduce((s, m) => s + m.delta, 0);
  assert.equal(1000 + net, 750);
});

/* ------------------------------------------------------------------ */

section('petty cash out of the drawer');

// Through the shared function, exactly as the API route does — so this also
// proves the expense reaches the ledger, not just the expense list.
await recordExpense({
  category: 'Diesel / Fuel',
  description: '20 litres for the generator',
  amount: 18000,
  paymentMethod: 'cash',
  paidFromTill: true,
  user: cashier,
});

await t('the till expects less cash after money is taken out', async () => {
  const [cashAgg] = await Payment.aggregate([
    { $match: { registerSession: till._id, voided: false, method: 'cash' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const [outAgg] = await Expense.aggregate([
    { $match: { registerSession: till._id, paidFromTill: true } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const expected = 5000 + (cashAgg?.total || 0) - (outAgg?.total || 0);
  // float 5,000 + cash taken 15,500 − diesel 18,000 = 2,500
  assert.equal(expected, 2500, `expected 2500, got ${expected}`);
});

/* ------------------------------------------------------------------ */

section('the reports the owner reads');

const range = resolveRange({ period: 'today' });
const report = await buildReport(range);

await t('the aggregations all run', () => assert.ok(report.summary));
await t('money collected matches what was taken', () => {
  // 14,500 cash + 500 transfer + 1,000 cash = 16,000
  assert.equal(report.summary.collected, 16000);
});
await t('cash and transfer are split correctly', () => {
  assert.equal(report.byMethod.cash, 15500);
  assert.equal(report.byMethod.transfer, 500);
});
await t('work invoiced is the full order, not just what was paid', () => {
  assert.equal(report.summary.billed, 29000);
});
await t('both products appear in best-sellers, not just the first', () => {
  const types = report.jobTypes.map((j) => j.jobType);
    assert.ok(types.includes('Flyers'), types.join(','));
  assert.ok(types.includes('Banner'), types.join(','));
});
await t('material cost is counted', () => assert.equal(report.summary.materialCost, 250 * 120));
await t('running costs are counted', () => assert.equal(report.summary.expenses, 18000));
await t('net profit is gross margin minus running costs', () => {
  assert.equal(report.summary.grossMargin, 29000 - 30000 - 0);
  assert.equal(report.summary.netProfit, report.summary.grossMargin - 18000);
});
await t('one job counted as one order', () => assert.equal(report.summary.jobsCreated, 1));

await t('the debtor list shows what is still owed', async () => {
  const debts = await debtorList();
  assert.equal(debts.invoices.length, 1);
  assert.equal(debts.invoices[0].balance, 13000);
});

/* ------------------------------------------------------------------ */

section('refunds reverse money without erasing the record');

const before = (await Sale.findById(sale._id)).amountPaid;
const refund = await recordRefund({
  sale: await Sale.findById(sale._id),
  amount: 1000,
  method: 'cash',
  reason: 'Customer cancelled part of the order',
  user: owner,
});

await t('the refund is stored as a negative payment', () => assert.equal(refund.payment.amount, -1000));
await t('the amount paid drops by the refund', () => assert.equal(refund.sale.amountPaid, before - 1000));
await t('the original payments are all still there', async () => {
  const count = await Payment.countDocuments({ sale: sale._id, isRefund: false, voided: false });
  assert.equal(count, 3);
});
await t('refunding more than was paid is refused', async () => {
  await assert.rejects(
    () => recordRefund({ sale: refund.sale, amount: 999999, method: 'cash', reason: 'x', user: owner }),
    /only refund up to/i
  );
});

/* ------------------------------------------------------------------ */

section('customer totals stay in step');

await t("the customer's outstanding balance matches the invoice", async () => {
  const c = await Customer.findById(customer._id);
  const s = await Sale.findById(sale._id);
  assert.equal(c.outstanding, s.balance);
});

/* ------------------------------------------------------------------ *
 * Accounting
 * ------------------------------------------------------------------ */

section('every journal entry balances');
await t('no entry has debits differing from credits', async () => {
  const entries = await JournalEntry.find({}).lean();
  assert.ok(entries.length > 0, 'nothing was posted at all');
  for (const e of entries) {
    const dr = M(e.lines.reduce((s, l) => s + l.debit, 0));
    const cr = M(e.lines.reduce((s, l) => s + l.credit, 0));
    assert.equal(dr, cr, `${e.entryNumber} (${e.memo}) is out: Dr ${dr} vs Cr ${cr}`);
  }
});
await t('the sale posted to receivables and income', async () => {
  const entry = await JournalEntry.findOne({ sourceType: 'sale' }).lean();
  assert.ok(entry, 'no sale entry');
  assert.ok(entry.lines.some((l) => l.code === A.RECEIVABLE && l.debit > 0));
  assert.ok(entry.lines.some((l) => l.code === A.SALES && l.credit > 0));
});
await t('materials used moved inventory into cost of sales', async () => {
  const bal = await accountBalances();
  assert.equal(bal[A.MATERIALS].balance, 30000, 'expected 250 sheets x 120');
});

section('buying: a delivery creates stock AND a debt');
const supplier = await Supplier.create({ name: 'Paper House', leadTimeDays: 3 });
const po = await PurchaseOrder.create({
  poNumber: await nextNumber('po', 'PO'),
  supplier: supplier._id,
  supplierName: supplier.name,
  items: [{ material: paper._id, name: paper.name, unit: 'sheets', quantity: 400, received: 400, unitCost: 130, total: 52000 }],
  subtotal: 52000,
  total: 52000,
  balance: 52000,
  status: 'received',
  receipts: [{ at: new Date(), by: owner.name, value: 52000, lines: [{ material: paper._id, name: paper.name, quantity: 400, unitCost: 130 }] }],
});
await applyMovement({ materialId: paper._id, type: 'in', quantity: 400, reason: 'PO', user: owner, purchaseOrder: po._id });
await postSafely(postingsForReceipt(po.toObject(), 0));

await t('stock went up', async () => {
  const m = await Material.findById(paper._id);
  assert.equal(m.quantity, 1150, `expected 1150, got ${m.quantity}`);
});
await t('the delivery was not double-counted in the ledger', async () => {
  // The movement must NOT post its own entry — the purchase order does.
  const movementEntries = await JournalEntry.countDocuments({ sourceType: 'movement', memo: /Stock in/ });
  assert.equal(movementEntries, 0, 'the PO delivery also posted as a manual stock-in');
});
await t('inventory and payables both rose by the delivery value', async () => {
  const entry = await JournalEntry.findOne({ sourceType: 'purchase' }).lean();
  assert.ok(entry, 'no purchase entry');
  assert.ok(entry.lines.some((l) => l.code === A.INVENTORY && l.debit === 52000));
  assert.ok(entry.lines.some((l) => l.code === A.PAYABLE && l.credit === 52000));
});

const supplierPayment = await SupplierPayment.create({
  purchaseOrder: po._id, poNumber: po.poNumber, supplier: supplier._id, supplierName: supplier.name,
  amount: 20000, method: 'transfer', paidBy: owner._id, paidByName: owner.name,
});
await postSafely(postingsForSupplierPayment(supplierPayment.toObject()));

await t('paying the supplier reduced what is owed', async () => {
  const bal = await accountBalances();
  assert.equal(bal[A.PAYABLE].balance, 32000, 'expected 52,000 less the 20,000 paid');
});

section('equipment wears out over time');
const press = await FixedAsset.create({
  name: 'Test press', category: 'Printing press',
  purchaseDate: new Date('2026-01-15'), cost: 1200000,
  usefulLifeMonths: 60, residualValue: 0, paidBy: 'transfer',
});
await postSafely(postingsForAsset(press.toObject()));

await t('buying it is not a cost — it is an asset', async () => {
  const bal = await accountBalances();
  assert.equal(bal[A.ASSET_COST].balance, 1200000);
  const pl = await profitAndLoss({ from: new Date('2020-01-01'), to: new Date('2030-01-01') });
  assert.ok(!pl.expenses.some((e) => e.code === A.ASSET_COST), 'the press was charged to profit');
});

const depAmount = M(1200000 / 60);
const run = await DepreciationRun.create({
  period: '2026-07', runAt: new Date(), total: depAmount,
  lines: [{ asset: press._id, name: press.name, amount: depAmount }],
});
await postSafely(postingsForDepreciation(run.toObject()));

await t('one month of wear is charged to profit', async () => {
  const bal = await accountBalances();
  assert.equal(bal[A.DEPRECIATION].balance, depAmount, 'depreciation expense');
  // Accumulated depreciation is an asset account holding a CREDIT balance, so
  // it reads negative — that is what makes it reduce total assets rather than
  // inflate them.
  assert.equal(bal[A.ACCUM_DEP].balance, -depAmount, 'accumulated depreciation');
});
await t('the machine is now worth less than it cost', async () => {
  const bs = await balanceSheet({ asAt: new Date('2030-01-01') });
  const cost = bs.assets.find((a) => a.code === A.ASSET_COST)?.balance || 0;
  const accum = bs.assets.find((a) => a.code === A.ACCUM_DEP)?.balance || 0;
  assert.equal(cost + accum, 1200000 - depAmount, 'book value should be cost less depreciation');
});
await t('depreciation cannot be run twice for the same month', async () => {
  await assert.rejects(
    () => DepreciationRun.create({ period: '2026-07', total: 1, lines: [] }),
    (e) => e.code === 11000
  );
});

section('the books balance');
await t('debits equal credits across every account', async () => {
  const tb = await trialBalance();
  assert.ok(tb.balanced, `out of balance by ${tb.difference}`);
  assert.ok(tb.totalDebit > 0);
});
await t('assets = liabilities + equity', async () => {
  const bs = await balanceSheet({ asAt: new Date('2030-01-01') });
  assert.ok(bs.balanced, `balance sheet out by ${bs.difference}`);
});
await t('the P&L revenue matches what was invoiced', async () => {
  const pl = await profitAndLoss({ from: new Date('2020-01-01'), to: new Date('2030-01-01') });
  // One 29,000 order, no discounts.
  assert.equal(pl.revenue, 29000, `got ${pl.revenue}`);
});
await t('gross profit is revenue less what the job consumed', async () => {
  const pl = await profitAndLoss({ from: new Date('2020-01-01'), to: new Date('2030-01-01') });
  assert.equal(pl.costOfSalesTotal, 30000);
  assert.equal(pl.grossProfit, -1000, 'this job genuinely lost money on materials');
});

section('the ledger can be rebuilt from the transactions');
let baseline;
await t('a rebuild reproduces the same trial balance', async () => {
  baseline = await trialBalance();
  const result = await rebuildLedger({ user: owner });
  assert.ok(result.balanced, `rebuild came out unbalanced by ${result.difference}`);

  const after = await trialBalance();
  assert.equal(after.totalDebit, baseline.totalDebit, 'totals changed after rebuild');
  assert.equal(after.totalCredit, baseline.totalCredit);

  for (const row of baseline.rows) {
    const match = after.rows.find((r) => r.code === row.code);
    assert.ok(match, `account ${row.code} vanished in the rebuild`);
    assert.equal(match.balance, row.balance, `${row.code} ${row.name} changed: ${row.balance} -> ${match.balance}`);
  }
});
await t('rebuilding twice is still identical', async () => {
  await rebuildLedger({ user: owner });
  const after = await trialBalance();
  assert.equal(after.totalDebit, baseline.totalDebit);
  assert.ok(after.balanced);
});
await t('a manual journal entry survives a rebuild', async () => {
  await JournalEntry.create({
    entryNumber: 'JE-MANUAL', date: new Date(), memo: 'Owner put in cash', manual: true, total: 50000,
    lines: [
      { account: (await Account.findOne({ code: A.CASH }))._id, code: A.CASH, name: 'Cash on hand', debit: 50000, credit: 0 },
      { account: (await Account.findOne({ code: A.CAPITAL }))._id, code: A.CAPITAL, name: "Owner's capital", debit: 0, credit: 50000 },
    ],
  });
  await rebuildLedger({ user: owner });
  const kept = await JournalEntry.findOne({ entryNumber: 'JE-MANUAL' });
  assert.ok(kept, 'the manual entry was wiped by the rebuild');
  const tb = await trialBalance();
  assert.ok(tb.balanced, 'books unbalanced after a manual entry');
});

/* ------------------------------------------------------------------ */

console.log(`\n${pass} passed, ${fail} failed`);
console.log('Dropping the test database…');
await mongoose.connection.dropDatabase();
await mongoose.disconnect();
console.log('Done. The shop database was not touched.\n');
process.exit(fail ? 1 : 0);
