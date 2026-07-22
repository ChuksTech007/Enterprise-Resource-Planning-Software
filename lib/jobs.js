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
  const raw =
    Array.isArray(body.items) && body.items.length
      ? body.items
      : [
          {
            jobType: body.jobType,
            description: body.description,
            quantity: body.quantity,
            size: body.size,
            paper: body.paper,
            colour: body.colour,
            sides: body.sides,
            finishing: body.finishing,
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
        paper: specs.paper?.trim() || undefined,
        colour: specs.colour?.trim() || undefined,
        finishing: specs.finishing?.trim() || undefined,
        sides: specs.sides?.trim() || undefined,
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
  return (
    [
      item.description || item.jobType,
      item.specs?.size,
      item.specs?.paper,
      item.specs?.colour,
      item.specs?.finishing,
    ]
      .filter(Boolean)
      .join(' · ') || item.jobType
  );
}
