/**
 * What each role is allowed to see.
 *
 * Deliberately free of any framework import so it can be unit-tested on its
 * own — this is the boundary that keeps cost prices and margins away from
 * cashiers, and it should be provable without booting the app.
 */

const COST_FIELDS = [
  'unitCost',
  'materialCost',
  'estimatedCost',
  'cost',
  'profit',
  'margin',
  'totalCost',
  'wastageValue',
  'grossMargin',
  'netProfit',
  'expenses',
  'expensesByCategory',
];

/**
 * Strip cost and profit fields from anything a cashier is about to receive.
 *
 * Applied at the API boundary rather than in the UI, so hiding a menu item is
 * never the only thing standing between a cashier and the margins.
 */
export function scrubCosts(data, user) {
  if (user?.role === 'owner') return data;
  return walk(data);

  function walk(v) {
    if (Array.isArray(v)) return v.map(walk);

    if (v && typeof v === 'object') {
      // Only descend into plain objects. ObjectIds, Dates, Buffers and
      // mongoose documents are values, not containers — recursing into an
      // ObjectId would rebuild it as {buffer:…} and every _id in the response
      // would stop working.
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) return v;

      const out = {};
      for (const [k, val] of Object.entries(v)) {
        if (COST_FIELDS.includes(k)) continue;
        out[k] = walk(val);
      }
      return out;
    }

    return v;
  }
}

export { COST_FIELDS };
