'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPut } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import { Card, ErrorNote, Loading, SectionTitle, Spinner } from '@/components/ui';

/**
 * The rate card.
 *
 * A grid, because that is what it is and what the shop already keeps: sizes
 * down the side, what each thing costs at that size across the top. Editing
 * it one dialog at a time — which is how this screen used to work — turns
 * filling in forty rates into an afternoon nobody ever finishes, and a
 * half-filled price list is worse than an empty one: staff trust the figures
 * that are there and quote the gaps from memory.
 *
 * An empty cell means "no rate set", and stays empty on the counter screen
 * for somebody to type into. It is not the same as a rate of zero, which is
 * a real price meaning the shop does that part for nothing.
 */

/* One column per thing the shop charges for. Frames appear three times
 * because the grade is what its price depends on. */
const COLUMNS = [
  { product: 'print', label: 'Print' },
  { product: 'canvas', label: 'Canvas' },
  { product: 'frame', grade: 'bold', label: 'Frame bold' },
  { product: 'frame', grade: 'normal', label: 'Frame normal' },
  { product: 'frame', grade: 'tiny', label: 'Frame tiny' },
  { product: 'glass', label: 'Acrylic' },
  { product: 'board', label: 'Board' },
];

const cellKey = (size, col) => [size, col.product, col.grade || ''].join('|');

export default function PriceListPage() {
  const { fmt, isOwner, toast } = useApp();

  const [card, setCard] = useState(null);
  const [values, setValues] = useState({});
  const [original, setOriginal] = useState({});
  const [newSize, setNewSize] = useState('');
  const [extraSizes, setExtraSizes] = useState([]);
  const [showCost, setShowCost] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    apiGet('/api/ratecard')
      .then((d) => {
        setCard(d);
        const v = {};
        for (const s of d.sizes || []) {
          for (const rows of Object.values(s.products || {})) {
            for (const r of rows) {
              v[cellKey(s.size, { product: r.product, grade: r.grade })] = {
                price: String(r.price ?? ''),
                cost: r.estimatedCost === undefined ? '' : String(r.estimatedCost),
              };
            }
          }
        }
        setValues(v);
        setOriginal(v);
        setExtraSizes([]);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  const sizes = useMemo(() => {
    const known = (card?.sizes || []).map((s) => s.size);
    return [...known, ...extraSizes.filter((s) => !known.includes(s))];
  }, [card, extraSizes]);

  const dirty = useMemo(
    () =>
      Object.keys({ ...values, ...original }).filter((k) => {
        const a = values[k] || {};
        const b = original[k] || {};
        return (a.price ?? '') !== (b.price ?? '') || (a.cost ?? '') !== (b.cost ?? '');
      }),
    [values, original]
  );

  function set(size, col, field, value) {
    const k = cellKey(size, col);
    setValues((v) => ({ ...v, [k]: { ...(v[k] || { price: '', cost: '' }), [field]: value } }));
  }

  function addSize() {
    const s = newSize.trim();
    if (!s) return;
    if (sizes.includes(s)) {
      setError(`"${s}" is already on the card.`);
      return;
    }
    setExtraSizes((x) => [...x, s]);
    setNewSize('');
    setError('');
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const cells = dirty.map((k) => {
        const [size, product, grade] = k.split('|');
        const v = values[k] || {};
        return {
          size,
          product,
          grade: grade || null,
          price: v.price ?? '',
          cost: v.cost ?? '',
        };
      });

      const res = await apiPut('/api/ratecard/save', { cells }, { queue: false });
      toast(
        `Saved — ${res.added} added, ${res.changed} changed` +
          (res.removed ? `, ${res.removed} removed` : '')
      );
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (error && !card) return <Card className="p-6 text-center text-bad">{error}</Card>;
  if (!card) return <Loading />;

  const field = showCost ? 'cost' : 'price';

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Price list</h1>

        {isOwner ? (
          <div className="flex items-center gap-2">
            {/* One grid, two figures. Showing both at once doubles the width
                of every column and pushes the card off the screen. */}
            <button
              onClick={() => setShowCost((s) => !s)}
              className={showCost ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
            >
              {showCost ? 'Editing cost' : 'Editing selling price'}
            </button>
            <button onClick={save} disabled={!dirty.length || saving} className="btn-primary btn-sm">
              {saving ? <Spinner /> : null}
              {dirty.length ? `Save ${dirty.length} change${dirty.length === 1 ? '' : 's'}` : 'Saved'}
            </button>
          </div>
        ) : null}
      </div>

      <p className="text-sm text-muted">
        {showCost
          ? 'What each thing costs the shop to buy. Only you see these; they are what the profit figures are worked out from.'
          : 'What the customer is charged. Leave a box empty if the shop does not sell that at that size.'}
      </p>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-surface">
                <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-left text-xs font-semibold text-muted">
                  Size
                </th>
                {COLUMNS.map((c) => (
                  <th
                    key={c.label}
                    className="px-2 py-2 text-right text-xs font-semibold text-muted"
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {sizes.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="px-3 py-8 text-center text-sm text-muted">
                    No sizes yet. Add the ones the shop sells below.
                  </td>
                </tr>
              ) : (
                sizes.map((size) => (
                  <tr key={size} className="border-b border-line">
                    <td className="sticky left-0 z-10 bg-card px-3 py-2 font-semibold">{size}</td>
                    {COLUMNS.map((c) => {
                      const k = cellKey(size, c);
                      const v = values[k]?.[field] ?? '';
                      const isDirty = dirty.includes(k);
                      return (
                        <td key={c.label} className="px-1 py-1">
                          <input
                            value={v}
                            onChange={(e) => set(size, c, field, e.target.value)}
                            disabled={!isOwner}
                            inputMode="decimal"
                            placeholder="—"
                            className={
                              'tnum w-full rounded border px-2 py-1.5 text-right disabled:opacity-60 ' +
                              (isDirty ? 'border-brand bg-brand-soft' : 'border-line bg-card')
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {isOwner ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-3">
            <input
              value={newSize}
              onChange={(e) => setNewSize(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSize()}
              placeholder="Add a size — 12/15"
              className="w-48 rounded-lg border border-line bg-card px-3 py-2 text-sm"
            />
            <button onClick={addSize} className="btn-secondary btn-sm">
              Add size
            </button>
            <p className="ml-auto text-xs text-faint">
              A new size appears as an empty row. Type its prices, then save.
            </p>
          </div>
        ) : null}
      </Card>

      {/* Rates that hold whatever the size — a delivery, a mount cut. Kept
          out of the grid because they have no size to sit against. */}
      {card.anySize?.length ? (
        <Card className="p-4">
          <SectionTitle>Charged the same at any size</SectionTitle>
          <ul className="divide-y divide-line">
            {card.anySize.map((r) => (
              <li key={r._id} className="flex justify-between py-2 text-sm">
                <span>{r.name}</span>
                <span className="tnum">{fmt(r.price)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
