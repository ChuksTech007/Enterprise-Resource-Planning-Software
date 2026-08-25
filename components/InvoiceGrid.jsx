'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import { Card, Spinner } from '@/components/ui';

/**
 * The counter grid — the shop's invoice pad, as a table.
 *
 * A row is one picture; the columns are the ones already printed on their
 * pad. The important thing is that a price is entered the way it is written
 * on paper: you put a number under Print, or you leave it blank. There is no
 * ticking a box first. Paper has no such step, the staff have never done it,
 * and adding one is how a familiar job becomes a thing to be learnt.
 *
 * Picking a size fills the row in from the rate card, and every figure stays
 * editable — a framer has to be able to say "call it 4,000 for this one"
 * without going and changing the shop's prices.
 */

/* The order printed on the pad. */
const COLUMNS = [
  { key: 'print', label: 'Print' },
  { key: 'canvas', label: 'Canvas' },
  { key: 'frame', label: 'Frame' },
  { key: 'glass', label: 'Acrylic' },
  { key: 'board', label: 'Board' },
];

const newRow = () => ({
  key: Math.random().toString(36).slice(2),
  size: '',
  quantity: 1,
  grade: 'normal',
  cells: {},
});

const n = (v) => {
  const x = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(x) ? x : 0;
};

export default function InvoiceGrid({ onChange }) {
  const { fmt } = useApp();
  const [card, setCard] = useState(null);
  const [rows, setRows] = useState([newRow()]);

  useEffect(() => {
    apiGet('/api/ratecard')
      .then(setCard)
      .catch(() => setCard({ sizes: [], grades: [] }));
  }, []);

  /* size + product + grade -> price, straight off the card. */
  const rateFor = useMemo(() => {
    const index = new Map();
    for (const s of card?.sizes || []) {
      for (const [product, list] of Object.entries(s.products || {})) {
        for (const row of list) index.set([s.size, product, row.grade || ''].join('|'), row.price);
      }
    }
    return (size, product, grade) =>
      index.get([size, product, product === 'frame' ? grade || '' : ''].join('|'));
  }, [card]);

  const priced = useMemo(
    () =>
      rows.map((r) => {
        const unit = COLUMNS.reduce((sum, c) => sum + n(r.cells[c.key]), 0);
        const quantity = Math.max(1, n(r.quantity) || 1);
        return { ...r, unit, quantity, total: unit * quantity };
      }),
    [rows]
  );

  const grandTotal = priced.reduce((s, r) => s + r.total, 0);

  useEffect(() => {
    onChange?.({ lines: priced, total: grandTotal });
  }, [priced, grandTotal, onChange]);

  /* Choosing a size fills the row from the card — but only the cells left
   * empty. Anything already typed by hand is a deliberate price for this job
   * and must not be overwritten by a change of size. */
  function chooseSize(key, size) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const cells = { ...r.cells };
        for (const c of COLUMNS) {
          const rate = rateFor(size, c.key, r.grade);
          if (rate !== undefined && (cells[c.key] === undefined || cells[c.key] === '')) {
            /* Only the things a picture usually needs are filled in.
             * Everything else stays blank until somebody writes a number,
             * exactly as on the pad. */
            if (c.key === 'print' || c.key === 'frame') cells[c.key] = String(rate);
          }
        }
        return { ...r, size, cells };
      })
    );
  }

  function chooseGrade(key, grade) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        /* Re-rate the frame cell, since the grade is what its price depends
         * on. Only if there is already a frame on this row. */
        const cells = { ...r.cells };
        if (cells.frame !== undefined && cells.frame !== '') {
          const rate = rateFor(r.size, 'frame', grade);
          if (rate !== undefined) cells.frame = String(rate);
        }
        return { ...r, grade, cells };
      })
    );
  }

  const setCell = (key, product, value) =>
    setRows((rs) =>
      rs.map((r) => (r.key === key ? { ...r, cells: { ...r.cells, [product]: value } } : r))
    );

  if (!card) {
    return (
      <Card className="flex items-center gap-2 p-6 text-sm text-muted">
        <Spinner /> Loading the rate card…
      </Card>
    );
  }

  const sizes = (card.sizes || []).map((s) => s.size);
  const grades = card.grades || [];

  return (
    <Card>
      {/* Scrolls sideways rather than stacking. A table that reflows into
          cards on a narrow screen stops looking like the pad, which is the
          whole point of it. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-surface text-left">
              <Th className="w-32">Size</Th>
              <Th className="w-16">Qty</Th>
              {COLUMNS.map((c) => (
                <Th key={c.key} className="w-28 text-right">
                  {c.label}
                </Th>
              ))}
              <Th className="w-32 text-right">Total</Th>
              <Th className="w-8" />
            </tr>
          </thead>

          <tbody>
            {priced.map((r) => (
              <tr key={r.key} className="border-b border-line align-top">
                <Td>
                  <select
                    value={r.size}
                    onChange={(e) => chooseSize(r.key, e.target.value)}
                    className="w-full rounded border border-line bg-card px-2 py-1.5"
                  >
                    <option value="">Size…</option>
                    {sizes.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>

                  {r.cells.frame !== undefined && r.cells.frame !== '' ? (
                    <select
                      value={r.grade}
                      onChange={(e) => chooseGrade(r.key, e.target.value)}
                      className="mt-1 w-full rounded border border-line bg-card px-2 py-1 text-xs"
                      title="Frame grade"
                    >
                      {grades.map((g) => (
                        <option key={g} value={g}>
                          {g} frame
                        </option>
                      ))}
                    </select>
                  ) : null}
                </Td>

                <Td>
                  <input
                    inputMode="numeric"
                    value={r.quantity}
                    onChange={(e) =>
                      setRows((rs) =>
                        rs.map((x) => (x.key === r.key ? { ...x, quantity: e.target.value } : x))
                      )
                    }
                    className="w-full rounded border border-line bg-card px-2 py-1.5 text-center"
                  />
                </Td>

                {COLUMNS.map((c) => (
                  <Td key={c.key}>
                    <input
                      inputMode="decimal"
                      value={r.cells[c.key] ?? ''}
                      onChange={(e) => setCell(r.key, c.key, e.target.value)}
                      placeholder={placeholder(rateFor, r, c.key)}
                      className="tnum w-full rounded border border-line bg-card px-2 py-1.5 text-right"
                    />
                  </Td>
                ))}

                <Td className="text-right">
                  <span className="tnum font-semibold">{fmt(r.total)}</span>
                  {r.quantity > 1 ? (
                    <p className="text-xs text-faint">{fmt(r.unit)} each</p>
                  ) : null}
                </Td>

                <Td>
                  {rows.length > 1 ? (
                    <button
                      onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                      className="text-muted hover:text-bad"
                      title="Remove this row"
                    >
                      ✕
                    </button>
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr>
              <Td colSpan={COLUMNS.length + 2} className="py-3">
                <button onClick={() => setRows((rs) => [...rs, newRow()])} className="btn-secondary btn-sm">
                  + Add row
                </button>
              </Td>
              <Td className="py-3 text-right">
                <p className="text-xs text-muted">Total</p>
                <p className="tnum text-xl font-bold text-brand">{fmt(grandTotal)}</p>
              </Td>
              <Td />
            </tr>
          </tfoot>
        </table>
      </div>

      {sizes.length === 0 ? (
        <p className="border-t border-line px-4 py-3 text-sm text-muted">
          No rates on the price list yet, so nothing will fill in by itself — you can still type
          every figure by hand.
        </p>
      ) : null}
    </Card>
  );
}

/* The card's rate, shown greyed in the empty cell. It tells the counter what
 * the shop charges without committing the row to it — the number only counts
 * once somebody types it. */
function placeholder(rateFor, row, product) {
  if (!row.size) return '';
  const rate = rateFor(row.size, product, row.grade);
  return rate === undefined ? '' : String(rate);
}

function Th({ children, className = '' }) {
  return <th className={'px-2 py-2 text-xs font-semibold text-muted ' + className}>{children}</th>;
}

function Td({ children, className = '', colSpan }) {
  return (
    <td colSpan={colSpan} className={'px-2 py-2 ' + className}>
      {children}
    </td>
  );
}
