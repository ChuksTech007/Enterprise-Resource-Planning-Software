import { JournalEntry, Sale, Payment, StockMovement, Expense, RegisterSession, PurchaseOrder, SupplierPayment, FixedAsset, DepreciationRun } from '../models.js';
import { money } from '../util.js';
import { accountBalances, postEntry, postSafely } from './ledger.js';
import { ensureAccounts } from './coa.js';
import {
  postingsForSale,
  postingsForPayment,
  postingsForMovement,
  postingsForExpense,
  postingsForRegisterClose,
  postingsForReceipt,
  postingsForSupplierPayment,
  postingsForAsset,
  postingsForDepreciation,
} from './postings.js';

/**
 * Trial balance — every account, its debits and credits, and proof that the
 * two columns agree. If they ever don't, nothing else here is trustworthy,
 * so this is the first report to look at.
 */
export async function trialBalance({ from, to } = {}) {
  const balances = await accountBalances({ from, to });
  const rows = Object.values(balances)
    .filter((a) => a.debit !== 0 || a.credit !== 0)
    .sort((a, b) => a.code.localeCompare(b.code));

  const totalDebit = money(rows.reduce((s, r) => s + r.debit, 0));
  const totalCredit = money(rows.reduce((s, r) => s + r.credit, 0));

  return {
    rows,
    totalDebit,
    totalCredit,
    balanced: Math.abs(totalDebit - totalCredit) < 0.01,
    difference: money(totalDebit - totalCredit),
  };
}

/**
 * Profit & loss for a period.
 *
 * This is accrual profit — it counts work sold in the period, whether or not
 * the customer has paid yet. That is deliberately different from the cash
 * figure on the takings report, and both are labelled so they cannot be
 * mistaken for each other.
 */
export async function profitAndLoss({ from, to }) {
  const balances = await accountBalances({ from, to });
  const of = (type) => Object.values(balances).filter((a) => a.type === type && a.balance !== 0);

  const incomeRows = of('income');
  const cogsRows = of('cogs');
  const expenseRows = of('expense');

  const revenue = money(incomeRows.reduce((s, a) => s + a.balance, 0));
  const costOfSales = money(cogsRows.reduce((s, a) => s + a.balance, 0));
  const grossProfit = money(revenue - costOfSales);
  const expenses = money(expenseRows.reduce((s, a) => s + a.balance, 0));
  const netProfit = money(grossProfit - expenses);

  return {
    from,
    to,
    income: incomeRows.sort((a, b) => a.code.localeCompare(b.code)),
    costOfSales: cogsRows.sort((a, b) => a.code.localeCompare(b.code)),
    expenses: expenseRows.sort((a, b) => a.code.localeCompare(b.code)),
    revenue,
    costOfSalesTotal: costOfSales,
    grossProfit,
    grossMarginPct: revenue > 0 ? money((grossProfit / revenue) * 100) : 0,
    expensesTotal: expenses,
    netProfit,
    netMarginPct: revenue > 0 ? money((netProfit / revenue) * 100) : 0,
  };
}

/**
 * Balance sheet as at a date.
 *
 * Profit for the year is folded into equity rather than sitting in the income
 * accounts, which is what makes assets equal liabilities plus equity. If that
 * equation does not hold, the report says so loudly instead of hiding it.
 */
export async function balanceSheet({ asAt = new Date() } = {}) {
  const balances = await accountBalances({ to: asAt });
  const of = (type) => Object.values(balances).filter((a) => a.type === type && a.balance !== 0);

  const assets = of('asset').sort((a, b) => a.code.localeCompare(b.code));
  const liabilities = of('liability').sort((a, b) => a.code.localeCompare(b.code));
  const equityRows = of('equity').sort((a, b) => a.code.localeCompare(b.code));

  // Balances are signed in their type's direction, so contra accounts (like
  // accumulated depreciation) already sit negative and a plain sum is right.
  const totalAssets = money(assets.reduce((s, a) => s + a.balance, 0));
  const totalLiabilities = money(liabilities.reduce((s, a) => s + a.balance, 0));
  const capital = money(equityRows.reduce((s, a) => s + a.balance, 0));

  // Everything the business has earned since it started, not yet in equity.
  const income = of('income').reduce((s, a) => s + a.balance, 0);
  const cogs = of('cogs').reduce((s, a) => s + a.balance, 0);
  const expenses = of('expense').reduce((s, a) => s + a.balance, 0);
  const earnings = money(income - cogs - expenses);

  const totalEquity = money(capital + earnings);
  const difference = money(totalAssets - (totalLiabilities + totalEquity));

  return {
    asAt,
    assets,
    liabilities,
    equity: equityRows,
    totalAssets,
    totalLiabilities,
    capital,
    earnings,
    totalEquity,
    balanced: Math.abs(difference) < 0.01,
    difference,
  };
}

/**
 * Rebuild the entire ledger from the operational records.
 *
 * The safety net for the whole accounting module. Because every posting rule
 * is a pure function of one source document, deleting every entry and
 * replaying produces exactly the same ledger — so a posting that failed
 * during a network blip, or a bug fixed later, can always be put right.
 */
export async function rebuildLedger({ user, onProgress = () => {} } = {}) {
  await ensureAccounts();

  const removed = await JournalEntry.deleteMany({ manual: { $ne: true } });
  onProgress(`Cleared ${removed.deletedCount} posted entries (manual entries kept)`);

  const counts = {};
  const post = async (label, entry) => {
    if (!entry) return;
    const result = await postEntry({ ...entry, user });
    if (result) counts[label] = (counts[label] || 0) + 1;
  };

  // Order does not affect the result — each entry is independent — but going
  // chronologically keeps the entry numbers sensible to read.
  for (const sale of await Sale.find({ voided: false }).sort({ createdAt: 1 }).lean()) {
    await post('sales', postingsForSale(sale));
  }
  onProgress(`Sales: ${counts.sales || 0}`);

  for (const payment of await Payment.find({ voided: false }).sort({ createdAt: 1 }).lean()) {
    await post('payments', postingsForPayment(payment));
  }
  onProgress(`Payments: ${counts.payments || 0}`);

  for (const po of await PurchaseOrder.find({ 'receipts.0': { $exists: true } }).sort({ createdAt: 1 }).lean()) {
    for (let i = 0; i < po.receipts.length; i++) await post('receipts', postingsForReceipt(po, i));
  }
  onProgress(`Goods received: ${counts.receipts || 0}`);

  for (const sp of await SupplierPayment.find({}).sort({ createdAt: 1 }).lean()) {
    await post('supplierPayments', postingsForSupplierPayment(sp));
  }
  onProgress(`Supplier payments: ${counts.supplierPayments || 0}`);

  for (const mv of await StockMovement.find({}).sort({ createdAt: 1 }).lean()) {
    await post('movements', postingsForMovement(mv));
  }
  onProgress(`Stock movements: ${counts.movements || 0}`);

  for (const ex of await Expense.find({}).sort({ date: 1 }).lean()) {
    await post('expenses', postingsForExpense(ex));
  }
  onProgress(`Expenses: ${counts.expenses || 0}`);

  for (const asset of await FixedAsset.find({}).sort({ purchaseDate: 1 }).lean()) {
    await post('assets', postingsForAsset(asset));
  }
  onProgress(`Assets: ${counts.assets || 0}`);

  for (const run of await DepreciationRun.find({}).sort({ runAt: 1 }).lean()) {
    await post('depreciation', postingsForDepreciation(run));
  }
  onProgress(`Depreciation runs: ${counts.depreciation || 0}`);

  for (const session of await RegisterSession.find({ status: 'closed' }).sort({ closedAt: 1 }).lean()) {
    await post('tillVariances', postingsForRegisterClose(session));
  }
  onProgress(`Till variances: ${counts.tillVariances || 0}`);

  const tb = await trialBalance();
  return { counts, balanced: tb.balanced, difference: tb.difference, totalDebit: tb.totalDebit };
}

export { postSafely };
