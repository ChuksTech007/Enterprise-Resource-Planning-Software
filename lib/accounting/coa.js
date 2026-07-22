import { Account, EXPENSE_CATEGORIES } from '../models.js';

/**
 * The chart of accounts.
 *
 * Deliberately small. A print shop does not need 300 accounts, and every
 * account nobody understands is an account somebody posts to wrongly. Codes
 * follow the usual convention so an accountant recognises it on sight:
 *
 *   1xxx assets · 2xxx liabilities · 3xxx equity
 *   4xxx income · 5xxx cost of sales · 6xxx running costs
 */

export const ACCOUNTS = [
  // --- assets -----------------------------------------------------
  { code: '1000', name: 'Cash on hand', type: 'asset', description: 'Money in the till' },
  { code: '1010', name: 'Bank', type: 'asset', description: 'Money received by transfer' },
  { code: '1020', name: 'Card / POS receivable', type: 'asset', description: 'Card takings not yet settled by the bank' },
  { code: '1030', name: 'Online (Paystack) receivable', type: 'asset', description: 'Online takings not yet settled' },
  { code: '1100', name: 'Accounts receivable', type: 'asset', description: 'What customers owe you' },
  { code: '1200', name: 'Inventory', type: 'asset', description: 'Paper, ink and consumables on the shelf' },
  { code: '1500', name: 'Fixed assets — cost', type: 'asset', description: 'Presses, cutters, generators at what they cost' },
  { code: '1590', name: 'Accumulated depreciation', type: 'asset', contra: true, description: 'Wear written off the machines so far' },

  // --- liabilities ------------------------------------------------
  { code: '2000', name: 'Accounts payable', type: 'liability', description: 'What you owe suppliers' },

  // --- equity -----------------------------------------------------
  { code: '3000', name: "Owner's capital", type: 'equity', description: 'Money and goods the owner put in' },
  { code: '3100', name: 'Retained earnings', type: 'equity', description: 'Profit kept in the business' },
  { code: '3200', name: 'Drawings', type: 'equity', contra: true, description: 'Money the owner took out' },

  // --- income -----------------------------------------------------
  { code: '4000', name: 'Sales — printing', type: 'income', description: 'Work sold, before discount' },
  { code: '4100', name: 'Discounts allowed', type: 'income', contra: true, description: 'Money given away on price' },

  // --- cost of sales ----------------------------------------------
  { code: '5000', name: 'Materials consumed', type: 'cogs', description: 'Stock used on jobs' },
  { code: '5100', name: 'Wastage & spoilage', type: 'cogs', description: 'Misprints, damage and stock-count losses' },

  // --- running costs ----------------------------------------------
  { code: '6000', name: 'Diesel / Fuel', type: 'expense' },
  { code: '6010', name: 'Electricity', type: 'expense' },
  { code: '6020', name: 'Rent', type: 'expense' },
  { code: '6030', name: 'Salaries & wages', type: 'expense' },
  { code: '6040', name: 'Transport & delivery', type: 'expense' },
  { code: '6050', name: 'Machine maintenance', type: 'expense' },
  { code: '6060', name: 'Consumables (non-stock)', type: 'expense' },
  { code: '6070', name: 'Internet & airtime', type: 'expense' },
  { code: '6080', name: 'Bank charges', type: 'expense' },
  { code: '6090', name: 'Marketing', type: 'expense' },
  { code: '6100', name: 'Other running costs', type: 'expense' },
  { code: '6500', name: 'Depreciation', type: 'expense', description: 'Machines wearing out over time' },
  { code: '6900', name: 'Cash short / over', type: 'expense', description: 'Till differences at cash-up' },
];

/** Named shortcuts, so posting rules read as English rather than numbers. */
export const A = {
  CASH: '1000',
  BANK: '1010',
  CARD: '1020',
  ONLINE: '1030',
  RECEIVABLE: '1100',
  INVENTORY: '1200',
  ASSET_COST: '1500',
  ACCUM_DEP: '1590',
  PAYABLE: '2000',
  CAPITAL: '3000',
  RETAINED: '3100',
  DRAWINGS: '3200',
  SALES: '4000',
  DISCOUNTS: '4100',
  MATERIALS: '5000',
  WASTAGE: '5100',
  DEPRECIATION: '6500',
  CASH_VARIANCE: '6900',
  OTHER_EXPENSE: '6100',
};

/** Where money of each payment method lands. */
export const METHOD_ACCOUNT = {
  cash: A.CASH,
  transfer: A.BANK,
  pos: A.CARD,
  online: A.ONLINE,
};

/** Expense categories map onto their own account. */
export const EXPENSE_ACCOUNT = {
  'Diesel / Fuel': '6000',
  Electricity: '6010',
  Rent: '6020',
  'Salaries & wages': '6030',
  'Transport & delivery': '6040',
  'Machine maintenance': '6050',
  'Consumables (non-stock)': '6060',
  'Internet & airtime': '6070',
  'Bank charges': '6080',
  Marketing: '6090',
  Other: '6100',
};

// A category with no mapping must still post somewhere rather than vanish.
export function expenseAccountFor(category) {
  return EXPENSE_ACCOUNT[category] || A.OTHER_EXPENSE;
}

/** Create any missing accounts. Safe to run repeatedly. */
export async function ensureAccounts() {
  const existing = new Set((await Account.find({}).select('code').lean()).map((a) => a.code));
  const missing = ACCOUNTS.filter((a) => !existing.has(a.code));
  if (missing.length) await Account.insertMany(missing.map((a) => ({ ...a, system: true })));

  // Guard against an expense category being added later with nowhere to post.
  const unmapped = EXPENSE_CATEGORIES.filter((c) => !EXPENSE_ACCOUNT[c]);
  if (unmapped.length) {
    console.warn('[accounting] expense categories with no account, posting to 6100:', unmapped.join(', '));
  }

  return missing.length;
}

/** code -> account _id, for building journal lines. */
export async function accountMap() {
  const accounts = await Account.find({}).lean();
  const byCode = {};
  for (const a of accounts) byCode[a.code] = a;
  return byCode;
}
