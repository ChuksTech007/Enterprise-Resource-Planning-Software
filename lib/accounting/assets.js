import { money } from '../util.js';

/**
 * Straight-line depreciation: the same amount written off every month until
 * the asset reaches its residual value.
 *
 * Chosen over reducing-balance because an owner can check it in their head —
 * "the press cost 3 million, it lasts five years, so that's 50,000 a month."
 * A method nobody can verify is a method nobody trusts.
 */
export function monthlyDepreciation(asset) {
  const depreciable = money(asset.cost - (asset.residualValue || 0));
  if (depreciable <= 0 || !asset.usefulLifeMonths) return 0;
  return money(depreciable / asset.usefulLifeMonths);
}

/** Whole months between purchase and a date, capped at the asset's life. */
export function monthsElapsed(asset, asAt = new Date()) {
  const start = new Date(asset.purchaseDate);
  const months = (asAt.getFullYear() - start.getFullYear()) * 12 + (asAt.getMonth() - start.getMonth());
  return Math.max(0, Math.min(months, asset.usefulLifeMonths));
}

/** What the asset is worth on the books today. */
export function bookValue(asset) {
  return money(asset.cost - (asset.accumulatedDepreciation || 0));
}

export function isFullyDepreciated(asset) {
  return bookValue(asset) <= money(asset.residualValue || 0) + 0.01;
}
