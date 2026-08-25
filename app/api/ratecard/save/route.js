import { route, bad } from '@/lib/http';
import { PriceItem, PRODUCTS, FRAME_GRADES, PRODUCT_LABELS } from '@/lib/models';
import { logAction } from '@/lib/audit';
import { money } from '@/lib/util';

export const dynamic = 'force-dynamic';

/**
 * Save the rate card as a whole.
 *
 * The card is edited as a grid — sizes down, products across — so it is saved
 * the same way. Entering forty-odd rates one dialog at a time is the kind of
 * job that never gets finished, and a half-filled price list is worse than
 * none: staff trust the figures that are there and quote the gaps from
 * memory.
 *
 * Only cells that actually changed are written, and a cleared cell removes
 * the rate rather than storing a zero. A zero is a real price — "we do this
 * for nothing" — and must not be how the app says "no rate set".
 */
export const PUT = route(
  async ({ body, user, req }) => {
    const cells = Array.isArray(body.cells) ? body.cells : null;
    if (!cells) throw bad('Nothing to save.');

    const existing = await PriceItem.find({}).lean();
    const key = (c) => [c.size || '', c.product, c.grade || ''].join('|');
    const byKey = new Map(existing.map((r) => [key(r), r]));

    let added = 0;
    let changed = 0;
    let removed = 0;

    for (const cell of cells) {
      if (!PRODUCTS.includes(cell.product)) continue;
      if (cell.grade && !FRAME_GRADES.includes(cell.grade)) continue;

      const size = String(cell.size || '').trim();
      if (!size) continue;

      const found = byKey.get(key({ ...cell, size }));
      const blank = cell.price === '' || cell.price === null || cell.price === undefined;

      if (blank) {
        /* Cleared. Withdraw the rate rather than storing zero — the counter
         * screen shows a withdrawn rate as an empty cell to be typed into,
         * and a zero as a price of nothing. */
        if (found) {
          await PriceItem.deleteOne({ _id: found._id });
          removed++;
        }
        continue;
      }

      const price = money(cell.price);
      const cost = cell.cost === '' || cell.cost === undefined ? undefined : money(cell.cost);

      if (!found) {
        await PriceItem.create({
          name: label(cell.product, size, cell.grade),
          product: cell.product,
          size,
          grade: cell.grade || null,
          unitLabel: 'per piece',
          price,
          estimatedCost: cost || 0,
        });
        added++;
        continue;
      }

      const sameCost = cost === undefined || money(found.estimatedCost) === cost;
      if (money(found.price) === price && sameCost) continue;

      await PriceItem.updateOne(
        { _id: found._id },
        { $set: { price, ...(cost === undefined ? {} : { estimatedCost: cost }), active: true } }
      );
      changed++;
    }

    if (added || changed || removed) {
      await logAction(user, 'price.card', {
        entity: 'PriceItem',
        label: `Rate card updated — ${added} added, ${changed} changed, ${removed} removed`,
        details: { added, changed, removed },
        req,
      });
    }

    return { added, changed, removed };
  },
  { role: 'owner' }
);

/** A readable name, since the rest of the app lists rates by name. */
function label(product, size, grade) {
  const base = PRODUCT_LABELS[product] || product;
  return grade ? `${base} ${size} ${grade}` : `${base} ${size}`;
}
