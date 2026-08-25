import { route, scrubCosts } from '@/lib/http';
import { PriceItem, PRODUCTS, FRAME_GRADES } from '@/lib/models';

export const dynamic = 'force-dynamic';

/**
 * The rate card, arranged the way the counter reads it.
 *
 * Staff do not think "show me all the moulding". They think "the customer
 * wants 12 by 15" and then need the three or four numbers that go with that
 * size. So the rows come back grouped by size, with the products under each,
 * which is the shape of the paper card this replaces.
 *
 * Cost prices are stripped for anyone but the owner, as everywhere else.
 */
export const GET = route(async ({ user, query }) => {
  const filter = query.includeInactive === '1' ? {} : { active: true };

  const items = await PriceItem.find(filter).sort({ size: 1, product: 1, grade: 1, name: 1 }).lean();

  /* Rows with no size are rates that hold whatever the size — a mount cut,
   * a delivery. They are kept apart rather than filed under a blank heading,
   * which would read as a missing size rather than a deliberate one. */
  const bySize = new Map();
  const anySize = [];

  for (const item of items) {
    if (!item.size) {
      anySize.push(item);
      continue;
    }
    if (!bySize.has(item.size)) bySize.set(item.size, []);
    bySize.get(item.size).push(item);
  }

  /* Sorted the way a framer reads a card — smallest first — rather than
   * alphabetically, where "12/15" lands after "10/12" but before "4/6". */
  const sizes = [...bySize.entries()]
    .map(([size, rows]) => ({ size, area: sizeArea(size), rows }))
    .sort((a, b) => a.area - b.area || a.size.localeCompare(b.size))
    .map(({ size, rows }) => ({
      size,
      products: Object.fromEntries(
        PRODUCTS.map((p) => [p, rows.filter((r) => r.product === p)]).filter(([, r]) => r.length)
      ),
    }));

  return scrubCosts(
    { sizes, anySize, products: PRODUCTS, grades: FRAME_GRADES },
    user
  );
});

/**
 * Roughly how big a size label is, for ordering only.
 *
 * "12/15" and "12 x 15" and "12x15" all mean the same thing to the shop, so
 * all three sort together. Anything unparseable sorts last rather than
 * throwing — a rate card with an odd label on it should still open.
 */
function sizeArea(label) {
  const m = String(label).match(/(\d+(?:\.\d+)?)\s*[\/x×]\s*(\d+(?:\.\d+)?)/i);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return Number(m[1]) * Number(m[2]);
}
