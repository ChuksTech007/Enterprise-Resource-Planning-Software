import { money } from '../util.js';
import { A, METHOD_ACCOUNT, expenseAccountFor } from './coa.js';

/**
 * Business event -> journal entry.
 *
 * Every function here is a PURE function of one source record. That is the
 * whole design: because nothing depends on the order things ran in or on
 * state held elsewhere, the entire ledger can be thrown away and rebuilt from
 * the sales, payments, movements and expenses — and come out identical.
 *
 * Each returns `null` when there is nothing to post.
 */

const acct = (method) => METHOD_ACCOUNT[method] || A.CASH;

/* ------------------------------------------------------------------ *
 * Selling
 * ------------------------------------------------------------------ */

/**
 * Raising an invoice earns the income and creates a receivable. Note this
 * happens when the work is SOLD, not when it is paid for — that is the whole
 * point of accrual accounting, and why the P&L and the cash position differ.
 */
export function postingsForSale(sale) {
  if (!sale || sale.voided) return null;

  const total = money(sale.total);
  const discount = money(sale.discount);
  const subtotal = money(sale.subtotal);
  if (subtotal <= 0) return null;

  return {
    sourceKey: `sale:${sale._id}`,
    sourceType: 'sale',
    sourceId: sale._id,
    date: sale.createdAt || new Date(),
    memo: `Invoice ${sale.invoiceNumber} — ${sale.customerName}`,
    lines: [
      { code: A.RECEIVABLE, debit: total },
      { code: A.DISCOUNTS, debit: discount },
      { code: A.SALES, credit: subtotal },
    ],
  };
}

/**
 * Taking money settles the receivable. A refund is stored as a negative
 * payment, so it simply posts the other way round.
 */
export function postingsForPayment(payment) {
  if (!payment || payment.voided) return null;

  const amount = money(payment.amount);
  if (amount === 0) return null;

  const bank = acct(payment.method);
  const isRefund = amount < 0;
  const value = Math.abs(amount);

  return {
    sourceKey: `payment:${payment._id}`,
    sourceType: 'payment',
    sourceId: payment._id,
    date: payment.createdAt || new Date(),
    memo: isRefund
      ? `Refund on ${payment.invoiceNumber} — ${payment.customerName}`
      : `${payment.method} payment on ${payment.invoiceNumber} — ${payment.customerName}`,
    lines: isRefund
      ? [
          { code: A.RECEIVABLE, debit: value },
          { code: bank, credit: value },
        ]
      : [
          { code: bank, debit: value },
          { code: A.RECEIVABLE, credit: value },
        ],
  };
}

/* ------------------------------------------------------------------ *
 * Stock
 * ------------------------------------------------------------------ */

/**
 * Stock only becomes a cost when it is consumed, not when it is bought —
 * until then it is inventory, an asset. This is the posting that turns paper
 * on a shelf into cost of sales.
 */
export function postingsForMovement(movement) {
  if (!movement) return null;

  // Deliveries against a purchase order are posted by the order itself.
  if (movement.purchaseOrder) return null;

  const qty = Math.abs(movement.type === 'adjustment' ? movement.delta : movement.quantity);
  const value = money(qty * (movement.unitCost || 0));
  if (value <= 0) return null;

  const base = {
    sourceKey: `movement:${movement._id}`,
    sourceType: 'movement',
    sourceId: movement._id,
    date: movement.createdAt || new Date(),
  };

  switch (movement.type) {
    case 'used':
      return {
        ...base,
        memo: `Materials used — ${movement.materialName}${movement.jobNumber ? ` on ${movement.jobNumber}` : ''}`,
        lines: [
          { code: A.MATERIALS, debit: value },
          { code: A.INVENTORY, credit: value },
        ],
      };

    case 'wastage':
    case 'damage':
      return {
        ...base,
        memo: `${movement.type === 'wastage' ? 'Wastage' : 'Damage'} — ${movement.materialName}`,
        lines: [
          { code: A.WASTAGE, debit: value },
          { code: A.INVENTORY, credit: value },
        ],
      };

    case 'return':
      return {
        ...base,
        memo: `Returned to stock — ${movement.materialName}`,
        lines: [
          { code: A.INVENTORY, debit: value },
          { code: A.MATERIALS, credit: value },
        ],
      };

    case 'in':
      // Stock entered by hand with no purchase order behind it: opening
      // balances, or something the owner bought and brought in.
      return {
        ...base,
        memo: `Stock in — ${movement.materialName}${movement.reason ? ` (${movement.reason})` : ''}`,
        lines: [
          { code: A.INVENTORY, debit: value },
          { code: A.CAPITAL, credit: value },
        ],
      };

    case 'adjustment': {
      const found = movement.delta > 0;
      return {
        ...base,
        memo: `Stock count ${found ? 'gain' : 'loss'} — ${movement.materialName}`,
        lines: found
          ? [
              { code: A.INVENTORY, debit: value },
              { code: A.WASTAGE, credit: value },
            ]
          : [
              { code: A.WASTAGE, debit: value },
              { code: A.INVENTORY, credit: value },
            ],
      };
    }

    default:
      return null;
  }
}

/* ------------------------------------------------------------------ *
 * Running costs
 * ------------------------------------------------------------------ */

export function postingsForExpense(expense) {
  if (!expense) return null;
  const value = money(expense.amount);
  if (value <= 0) return null;

  return {
    sourceKey: `expense:${expense._id}`,
    sourceType: 'expense',
    sourceId: expense._id,
    date: expense.date || expense.createdAt || new Date(),
    memo: `${expense.category} — ${expense.description}`,
    lines: [
      { code: expenseAccountFor(expense.category), debit: value },
      { code: acct(expense.paymentMethod), credit: value },
    ],
  };
}

/** A till that did not balance. Small, but it is exactly what an owner wants named. */
export function postingsForRegisterClose(session) {
  if (!session || session.status !== 'closed') return null;
  const variance = money(session.variance);
  if (variance === 0) return null;

  const value = Math.abs(variance);
  const short = variance < 0;

  return {
    sourceKey: `register:${session._id}`,
    sourceType: 'register',
    sourceId: session._id,
    date: session.closedAt || new Date(),
    memo: `Till ${short ? 'short' : 'over'} — ${session.userName}`,
    lines: short
      ? [
          { code: A.CASH_VARIANCE, debit: value },
          { code: A.CASH, credit: value },
        ]
      : [
          { code: A.CASH, debit: value },
          { code: A.CASH_VARIANCE, credit: value },
        ],
  };
}

/* ------------------------------------------------------------------ *
 * Buying
 * ------------------------------------------------------------------ */

/**
 * Goods arriving create stock and a debt to the supplier. One entry per
 * delivery, keyed on its position in the order's receipt list so a rebuild is
 * deterministic even when a delivery came in parts.
 */
export function postingsForReceipt(po, index) {
  const receipt = po?.receipts?.[index];
  if (!receipt) return null;

  const value = money(receipt.value);
  if (value <= 0) return null;

  return {
    sourceKey: `po-receipt:${po._id}:${index}`,
    sourceType: 'purchase',
    sourceId: po._id,
    date: receipt.at || new Date(),
    memo: `Goods received on ${po.poNumber} — ${po.supplierName}`,
    lines: [
      { code: A.INVENTORY, debit: value },
      { code: A.PAYABLE, credit: value },
    ],
  };
}

export function postingsForSupplierPayment(sp) {
  if (!sp) return null;
  const value = money(sp.amount);
  if (value <= 0) return null;

  return {
    sourceKey: `supplier-payment:${sp._id}`,
    sourceType: 'supplier-payment',
    sourceId: sp._id,
    date: sp.createdAt || new Date(),
    memo: `Paid ${sp.supplierName}${sp.poNumber ? ` for ${sp.poNumber}` : ''}`,
    lines: [
      { code: A.PAYABLE, debit: value },
      { code: acct(sp.method), credit: value },
    ],
  };
}

/* ------------------------------------------------------------------ *
 * Fixed assets
 * ------------------------------------------------------------------ */

/** Buying a press is not a cost — it swaps cash for an asset of equal value. */
export function postingsForAsset(asset) {
  if (!asset) return null;
  const value = money(asset.cost);
  if (value <= 0) return null;

  return {
    sourceKey: `asset:${asset._id}`,
    sourceType: 'asset',
    sourceId: asset._id,
    date: asset.purchaseDate || asset.createdAt || new Date(),
    memo: `Bought ${asset.name}`,
    lines: [
      { code: A.ASSET_COST, debit: value },
      { code: acct(asset.paidBy), credit: value },
    ],
  };
}

/** The cost of the press appears gradually, as it wears out. */
export function postingsForDepreciation(run) {
  if (!run) return null;
  const value = money(run.total);
  if (value <= 0) return null;

  return {
    sourceKey: `depreciation:${run.period}`,
    sourceType: 'depreciation',
    sourceId: run._id,
    date: run.runAt || new Date(),
    memo: `Depreciation for ${run.period}`,
    lines: [
      { code: A.DEPRECIATION, debit: value },
      { code: A.ACCUM_DEP, credit: value },
    ],
  };
}
