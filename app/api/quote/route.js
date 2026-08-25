import { route, bad } from '@/lib/http';
import { PriceItem, Settings } from '@/lib/models';
import { quoteFramedPiece } from '@/lib/pricing';
import { parseSize } from '@/lib/measure';
import { num } from '@/lib/util';

export const dynamic = 'force-dynamic';

/**
 * Price a framed piece.
 *
 * Computed here rather than in the browser, for two reasons.
 *
 * The first is cost. Every rate carries an owner-only cost price used for the
 * margin, and sending the price list to the counter with costs attached would
 * put the shop's buying prices on a screen any customer can lean over and
 * read. The browser sends the size and which rows were chosen; it never
 * receives a cost.
 *
 * The second is that the figure quoted to a customer should be one the server
 * worked out. A price assembled in the browser is a price that can be edited
 * in the browser, and a quote is the beginning of an invoice.
 *
 * Writes nothing. A counter hand can price the same piece twenty times while
 * a customer changes their mind about the mount, and nothing is recorded
 * until they say yes.
 */
export const POST = route(async ({ body }) => {
  /* Accept either a typed size ("24 x 36 in") or explicit millimetres. Staff
   * write sizes the way customers say them, and the shop's own default unit
   * decides what a bare "24x36" means. */
  const settings = await Settings.findOne({ key: 'main' }).lean();
  const defaultUnit = settings?.sizeUnit === 'mm' ? 'mm' : 'in';

  let widthMm = num(body.artworkWidthMm, 0);
  let heightMm = num(body.artworkHeightMm, 0);

  if (body.size) {
    try {
      ({ widthMm, heightMm } = parseSize(body.size, { defaultUnit }));
    } catch (err) {
      throw bad(err.message);
    }
  }

  if (!(widthMm > 0) || !(heightMm > 0)) {
    throw bad('Measure the artwork first — give a width and a height.');
  }

  /* Only rows that are actually on the price list, and only active ones. A
   * quote built from a rate that has been withdrawn is a quote the shop
   * cannot honour. */
  const ids = ['moulding', 'glazing', 'mountBoard', 'backing']
    .map((part) => body.parts?.[part])
    .filter(Boolean);

  const rows = ids.length
    ? await PriceItem.find({ _id: { $in: ids }, active: true }).lean()
    : [];
  const byId = new Map(rows.map((r) => [String(r._id), r]));

  const parts = {};
  for (const part of ['moulding', 'glazing', 'mountBoard', 'backing']) {
    const id = body.parts?.[part];
    if (!id) continue;
    const row = byId.get(String(id));
    if (!row) throw bad('One of the chosen items is no longer on the price list.');
    parts[part] = {
      id: String(row._id),
      name: row.name,
      price: row.price,
      cost: row.estimatedCost || 0,
      mouldingWidthMm: row.mouldingWidthMm || 0,
      wastageMm: row.wastageMm || 0,
      cutting: row.cuttingPrice || 0,
    };
  }

  const quote = quoteFramedPiece(
    {
      artworkWidthMm: widthMm,
      artworkHeightMm: heightMm,
      mountBorderMm: num(body.mountBorderMm, 0),
      mountApertures: Math.max(1, num(body.mountApertures, 1)),
      quantity: Math.max(1, num(body.quantity, 1)),
      labour: num(body.labour, 0),
      discount: num(body.discount, 0),
      minCharge: num(settings?.minimumCharge, 0),
      extras: (body.extras || [])
        .filter((e) => e?.name && num(e.amount, 0) > 0)
        .map((e) => ({ name: String(e.name).trim(), detail: e.detail || null, amount: num(e.amount, 0) })),
    },
    parts
  );

  /* The breakdown goes back without a single cost figure on it — the counter
   * sees what the customer is charged and how it was arrived at, nothing
   * about what the shop paid. */
  return {
    artworkWidthMm: widthMm,
    artworkHeightMm: heightMm,
    glassWidthMm: quote.glassWidthMm,
    glassHeightMm: quote.glassHeightMm,
    lines: quote.lines.map((l) => ({ part: l.part, name: l.name, detail: l.detail, amount: l.amount })),
    minimumApplied: quote.minimumApplied,
    unit: quote.unit,
    quantity: quote.quantity,
    gross: quote.gross,
    discount: quote.discount,
    total: quote.total,
  };
});
