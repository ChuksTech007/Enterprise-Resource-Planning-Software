'use client';

/**
 * Money in, split by how it arrived.
 *
 * Horizontal bars rather than a pie: four categories of the same measure,
 * compared by magnitude, and a bar's length is read far more accurately than
 * an angle. Every row carries its own name and amount as text, so identity
 * never depends on colour alone — which also covers the two palette slots
 * that sit below 3:1 contrast on a white card.
 *
 * Colours are categorical slots 1–4 of the validated palette, assigned to a
 * fixed method and never cycled: cash is always blue, transfer always orange.
 * Filtering the list must not repaint the survivors.
 */

const METHOD_META = {
  cash: { label: 'Cash', color: '#2a78d6' },
  transfer: { label: 'Bank transfer', color: '#eb6834' },
  pos: { label: 'POS / Card', color: '#1baf7a' },
  online: { label: 'Online (Paystack)', color: '#eda100' },
};

export default function MethodBreakdown({ byMethod, fmt, title = 'How the money came in' }) {
  const rows = Object.entries(METHOD_META).map(([key, meta]) => ({
    key,
    ...meta,
    value: Number(byMethod?.[key] || 0),
  }));

  const total = rows.reduce((s, r) => s + r.value, 0);
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <span className="tnum text-sm font-semibold text-ink">{fmt(total)}</span>
      </div>

      {total === 0 ? (
        <p className="py-4 text-center text-sm text-muted">No money recorded yet for this period.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const share = total > 0 ? (r.value / total) * 100 : 0;
            return (
              <li key={r.key}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2 text-muted">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: r.color }}
                    />
                    <span className="truncate">{r.label}</span>
                  </span>
                  <span className="tnum shrink-0 font-semibold text-ink">
                    {fmt(r.value)}
                    <span className="ml-1.5 font-normal text-faint">{share.toFixed(0)}%</span>
                  </span>
                </div>
                {/* Track is recessive; the bar itself carries the value. */}
                <div className="h-2 w-full overflow-hidden rounded-full bg-page">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${(r.value / max) * 100}%`, background: r.color }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export { METHOD_META };
