import { JOB_TYPES } from './models.js';
import { money, num } from './util.js';

/**
 * Normalise whatever the client sent into a job's item list, plus the
 * denormalised summary fields the lists and reports read.
 *
 * Accepts either shape:
 *   - `items: [{ jobType, quantity, unitPrice, … }]`  (multi-product order)
 *   - a flat single product on the body                (older/simple callers)
 *
 * Keeping both accepted means the job form, the repeat-order flow and any
 * future integration can all post the shape that suits them.
 */
export function buildJobItems(body) {
  /* An explicit empty list means "no rows", not "fall back to the single
   * item form". Without this an entirely blank invoice saves as a job with
   * no size, no price and a number of its own — clutter the shop then has
   * to find and cancel. Everything else on a row stays optional. */
  if (Array.isArray(body.items) && body.items.length === 0) return { items: [], jobType: undefined, description: undefined, quantity: 0, specs: {}, price: 0 };

  const raw =
    Array.isArray(body.items) && body.items.length
      ? body.items
      : [
          {
            jobType: body.jobType,
            description: body.description,
            quantity: body.quantity,
            /* Carried through as an object.
             *
             * This used to lift size, paper, colour and the rest off the
             * body as flat fields, which silently dropped everything a
             * caller sent under `specs` — a job would save with its price
             * intact and no record of what size it was. The flat form is
             * still accepted, because older callers send it that way. */
            specs: body.specs || {
              size: body.size,
            },
            unitPrice: body.unitPrice,
            total: body.price,
          },
        ];

  const items = [];

  for (const line of raw) {
    const jobType = JOB_TYPES.includes(line.jobType) ? line.jobType : 'Other';
    const quantity = num(line.quantity, 1);
    const unitPrice = money(line.unitPrice);

    // An explicit total wins over qty x unit price — print jobs are often
    // priced as a lump sum for the run rather than per piece.
    const total =
      line.total !== undefined && line.total !== '' && line.total !== null
        ? money(line.total)
        : money(quantity * unitPrice);

    const specs = line.specs || line;

    items.push({
      jobType,
      description: (line.description || '').trim(),
      quantity,
      specs: {
        size: specs.size?.trim() || undefined,
        /* The millimetre figures are what the workshop cuts to and what the
         * customer was charged on, so they travel as numbers rather than
         * being re-derived from the typed size weeks later. */
        artworkWidthMm: num(specs.artworkWidthMm) || undefined,
        artworkHeightMm: num(specs.artworkHeightMm) || undefined,
        glassWidthMm: num(specs.glassWidthMm) || undefined,
        glassHeightMm: num(specs.glassHeightMm) || undefined,
        mountBorderMm: num(specs.mountBorderMm) || undefined,
        mountApertures: num(specs.mountApertures) || undefined,
        moulding: specs.moulding?.trim() || undefined,
        glazing: specs.glazing?.trim() || undefined,
        mountBoard: specs.mountBoard?.trim() || undefined,
        backing: specs.backing?.trim() || undefined,
        notes: specs.notes?.trim() || undefined,
      },
      unitPrice,
      total,
    });
  }

  const price = money(items.reduce((s, i) => s + i.total, 0));
  const quantity = items.reduce((s, i) => s + i.quantity, 0);

  return {
    items,
    price,
    quantity,
    jobType: items[0]?.jobType || 'Other',
    // A one-line summary for job lists and the customer's receipt.
    description: summarise(items),
    // The first item's specs, kept on the job for the older single-item views.
    specs: items[0]?.specs || {},
  };
}

/** "500 x A5 flyers + 2 more items" */
export function summarise(items) {
  if (!items?.length) return '';
  const first = items[0];
  const head = [first.quantity ? `${first.quantity} x` : '', first.description || first.jobType]
    .filter(Boolean)
    .join(' ');
  if (items.length === 1) return head;
  return `${head} + ${items.length - 1} more item${items.length - 1 === 1 ? '' : 's'}`;
}

/** A readable one-line label for a single item, used on invoices. */
export function describeItem(item) {
  /* What a framer would write on a ticket: what it is, how big, and the
   * mount — because the mount is why the glass is the size it is, and that
   * is the line a customer queries. */
  return [
    item.description || item.jobType,
    item.specs?.size,
    item.specs?.mountBorderMm ? item.specs.mountBorderMm + 'mm mount' : null,
    item.specs?.moulding,
    item.specs?.glazing,
  ]
    .filter(Boolean)
    .join(' · ');
}
