'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import { Card, ErrorNote, Field, SectionTitle, Spinner } from '@/components/ui';

/**
 * Pricing a framed piece at the counter.
 *
 * The shape of this screen follows the conversation that actually happens.
 * The customer puts a picture on the counter; the first thing anyone does is
 * measure it, and every figure after that follows from the measurement. So
 * the size comes first, and the breakdown stays on screen — a framer quoting
 * by hand can say "the glass is the dear part on this one", and a till that
 * shows only a total takes that away from them.
 *
 * Nothing is worked out here. The size and the chosen rows go to the server
 * and the priced breakdown comes back, because the rates carry cost prices
 * that must never reach a screen a customer can lean over and read. It also
 * means the number quoted is the number the server stands behind.
 */

/* The borders a framer actually reaches for. Anything else can be typed. */
const COMMON_BORDERS = [0, 40, 50, 60, 75, 100];

const PART_LABELS = {
  moulding: 'Moulding',
  glazing: 'Glass / acrylic',
  mountBoard: 'Mount board',
  backing: 'Backing',
};

export default function FramePricer({ onQuote, initial = {} }) {
  const { fmt } = useApp();

  const [rates, setRates] = useState(null);
  const [size, setSize] = useState(initial.size || '');
  const [mountBorderMm, setMountBorderMm] = useState(initial.mountBorderMm ?? 0);
  const [mountApertures, setMountApertures] = useState(initial.mountApertures ?? 1);
  const [quantity, setQuantity] = useState(initial.quantity ?? 1);
  const [labour, setLabour] = useState(initial.labour ?? '');
  const [parts, setParts] = useState(initial.parts || {});

  const [quote, setQuote] = useState(null);
  const [pricing, setPricing] = useState(false);
  const [error, setError] = useState('');

  /* Only the newest request may land. A counter hand types a size, changes
   * the mount, changes it back — on a slow connection those replies arrive
   * out of order, and an older one overwriting a newer would leave a price on
   * screen belonging to a frame nobody is building. */
  const request = useRef(0);

  useEffect(() => {
    apiGet('/api/pricelist')
      .then((d) => {
        const byPart = {};
        for (const item of d.items || []) {
          if (!PART_LABELS[item.part]) continue;
          (byPart[item.part] ||= []).push(item);
        }
        setRates(byPart);
      })
      .catch(() => setRates({}));
  }, []);

  const price = useCallback(async () => {
    if (!size.trim()) {
      setQuote(null);
      setError('');
      return;
    }

    const id = ++request.current;
    setPricing(true);
    try {
      const q = await apiPost(
        '/api/quote',
        {
          size,
          mountBorderMm: Number(mountBorderMm) || 0,
          mountApertures: Number(mountApertures) || 1,
          quantity: Number(quantity) || 1,
          labour: Number(labour) || 0,
          parts,
        },
        { queue: false }
      );
      if (request.current !== id) return;
      setQuote(q);
      setError('');
      onQuote?.(q, { size, mountBorderMm, mountApertures, quantity, labour, parts });
    } catch (e) {
      if (request.current !== id) return;
      setQuote(null);
      setError(e.message);
    } finally {
      if (request.current === id) setPricing(false);
    }
  }, [size, mountBorderMm, mountApertures, quantity, labour, parts, onQuote]);

  /* Repriced a beat after typing stops, not on every keystroke: "24 x 3" is a
   * perfectly valid size and would otherwise be priced and shown on the way
   * to "24 x 36". */
  useEffect(() => {
    const t = setTimeout(price, 400);
    return () => clearTimeout(t);
  }, [price]);

  const choose = (part, id) => setParts((p) => ({ ...p, [part]: id || undefined }));

  if (rates === null) {
    return (
      <Card className="flex items-center gap-2 p-6 text-sm text-muted">
        <Spinner /> Loading the price list…
      </Card>
    );
  }

  const noRates = Object.keys(rates).length === 0;
  const mounted = Number(mountBorderMm) > 0;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionTitle>Measure the piece</SectionTitle>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Size of the artwork" hint="However the customer says it — 24 x 36 in, or 600 x 900 mm">
            <input
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder="24 x 36 in"
              className="w-full rounded-lg border border-line bg-card px-3 py-2"
              autoFocus
            />
          </Field>

          <Field label="Mount border" hint="The border pushes the glass out on all four sides">
            <div className="flex flex-wrap gap-1">
              {COMMON_BORDERS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setMountBorderMm(b)}
                  className={
                    'rounded-md border px-2.5 py-1.5 text-sm ' +
                    (Number(mountBorderMm) === b
                      ? 'border-brand bg-brand-soft font-semibold text-brand'
                      : 'border-line')
                  }
                >
                  {b === 0 ? 'None' : b + 'mm'}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Openings in the mount" hint="Each one is cut by hand">
            <input
              type="number"
              min="1"
              value={mountApertures}
              onChange={(e) => setMountApertures(e.target.value)}
              disabled={!mounted}
              className="w-full rounded-lg border border-line bg-card px-3 py-2 disabled:opacity-50"
            />
          </Field>
          <Field label="How many">
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-lg border border-line bg-card px-3 py-2"
            />
          </Field>
          <Field label="Labour" hint="Per piece">
            <input
              value={labour}
              onChange={(e) => setLabour(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              className="w-full rounded-lg border border-line bg-card px-3 py-2"
            />
          </Field>
        </div>
      </Card>

      <Card className="p-4">
        <SectionTitle>What it is made of</SectionTitle>

        {noRates ? (
          <p className="py-3 text-sm text-muted">
            No framing rates on the price list yet. Add moulding, glass and board under{' '}
            <a href="/pricelist" className="font-semibold text-brand">
              Price list
            </a>
            , each with how its rate is charged.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.keys(PART_LABELS).map((part) => (
              <Field key={part} label={PART_LABELS[part]}>
                <select
                  value={parts[part] || ''}
                  onChange={(e) => choose(part, e.target.value)}
                  className="w-full rounded-lg border border-line bg-card px-3 py-2"
                >
                  <option value="">— none —</option>
                  {(rates[part] || []).map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.name} · {fmt(r.price, { decimals: false })} {r.unitLabel}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
        )}

        {/* Said plainly, because it is the commonest source of an argument at
            collection: the customer measured their picture, the invoice shows
            a bigger piece of glass, and nobody wrote down why. */}
        {mounted && (
          <p className="mt-3 text-xs text-muted">
            Glass, board and backing are cut to the size <em>with</em> the mount, not to the
            artwork.
          </p>
        )}
      </Card>

      <Quote quote={quote} pricing={pricing} error={error} fmt={fmt} />
    </div>
  );
}

function Quote({ quote, pricing, error, fmt }) {
  if (error) return <ErrorNote>{error}</ErrorNote>;

  if (!quote) {
    return (
      <Card className="flex items-center justify-center gap-2 p-6 text-sm text-muted">
        {pricing ? <Spinner /> : 'Enter a size to see the price.'}
      </Card>
    );
  }

  const grown = quote.glassWidthMm !== quote.artworkWidthMm;

  return (
    <Card className={'p-4 ' + (pricing ? 'opacity-60' : '')}>
      <SectionTitle>The price</SectionTitle>

      <p className="mb-3 text-xs text-muted">
        Artwork {quote.artworkWidthMm} × {quote.artworkHeightMm} mm
        {grown ? (
          <>
            {' '}
            · cut to {quote.glassWidthMm} × {quote.glassHeightMm} mm with the mount
          </>
        ) : null}
      </p>

      <div className="space-y-0.5">
        {quote.lines.map((l, i) => (
          <div key={i} className="flex justify-between gap-4 py-1 text-sm">
            <span className="min-w-0">
              <span className="font-medium">{l.name}</span>
              {l.detail ? <span className="ml-2 text-xs text-muted">{l.detail}</span> : null}
            </span>
            <span className="tnum shrink-0">{fmt(l.amount)}</span>
          </div>
        ))}
      </div>

      {quote.minimumApplied ? (
        <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
          Below the shop minimum, so the minimum charge applies — the work is the same on a small
          piece.
        </p>
      ) : null}

      <div className="mt-3 border-t border-line pt-3">
        {quote.quantity > 1 ? (
          <div className="flex justify-between gap-4 py-1 text-sm text-muted">
            <span>
              {fmt(quote.unit)} each × {quote.quantity}
            </span>
            <span className="tnum">{fmt(quote.gross)}</span>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-semibold">Total</span>
          <span className="tnum text-2xl font-bold text-brand">{fmt(quote.total)}</span>
        </div>
      </div>
    </Card>
  );
}
