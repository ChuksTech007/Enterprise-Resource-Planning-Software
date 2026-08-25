'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import { Card, SectionTitle, Segmented, Spinner, StatTile } from '@/components/ui';

/**
 * Money in, money out, what is left.
 *
 * Kept separate from the till on purpose. The till is one drawer, counted
 * against physical cash, and its number has to mean exactly one thing: what
 * should be in that drawer right now. This is every naira through the
 * business by every method — transfers and card payments included, which
 * never touch the drawer at all.
 *
 * Mixing them would break the count. A cashier reconciling ₦32,000 of cash
 * against a figure that includes a ₦200,000 bank transfer is a cashier who
 * stops trusting the screen.
 */

const PERIODS = [
  { value: 'all', label: 'Since you started' },
  { value: 'month', label: 'This month' },
  { value: 'week', label: 'This week' },
  { value: 'today', label: 'Today' },
];


function Figure({ label, value, tone }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={'tnum text-xl font-bold leading-tight ' + tone}>{value}</p>
    </div>
  );
}

const METHOD_LABELS = {
  cash: 'Cash',
  transfer: 'Bank transfer',
  pos: 'POS / Card',
  online: 'Online',
};

export default function MoneyPosition({ compact = false }) {
  const { fmt } = useApp();
  const [period, setPeriod] = useState('all');
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    apiGet('/api/money', { period })
      .then(setData)
      .catch(() => setData(null));
  }, [period]);

  if (compact) {
    return (
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <SectionTitle>All money</SectionTitle>
          <Segmented options={PERIODS} value={period} onChange={setPeriod} />
        </div>

        {!data ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted">
            <Spinner /> Working it out…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Figure label="In" value={fmt(data.in.net, { decimals: false })} tone="text-good" />
              <Figure label="Out" value={fmt(data.out.total, { decimals: false })} tone="text-warn" />
              <Figure
                label="Left"
                value={fmt(data.left, { decimals: false })}
                tone={data.left >= 0 ? 'text-brand' : 'text-bad'}
              />
            </div>
            <p className="mt-2 text-xs text-faint">
              Money that actually moved — not profit, and not the cash in the drawer below.
            </p>
          </>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Segmented options={PERIODS} value={period} onChange={setPeriod} />

      {!data ? (
        <Card className="flex items-center justify-center gap-2 p-8 text-sm text-muted">
          <Spinner /> Working it out…
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatTile
              label="Money in"
              value={fmt(data.in.net, { decimals: false })}
              sub={`${data.in.count} payment${data.in.count === 1 ? '' : 's'}${
                data.in.refunds ? ` · ${fmt(data.in.refunds, { decimals: false })} refunded` : ''
              }`}
              tone="good"
            />
            <StatTile
              label="Money out"
              value={fmt(data.out.total, { decimals: false })}
              sub={`${fmt(data.out.expenses, { decimals: false })} running costs · ${fmt(
                data.out.toSuppliers,
                { decimals: false }
              )} to suppliers`}
              tone="warn"
            />
            <StatTile
              label="What is left"
              value={fmt(data.left, { decimals: false })}
              sub={data.label}
              tone={data.left >= 0 ? 'brand' : 'bad'}
            />
          </div>

          {/* Said plainly, because the difference between this and profit is
              the thing owners most often get wrong — and being wrong about it
              in the confident direction is how a shop spends money it has
              already promised to somebody else. */}
          <p className="text-xs text-muted">
            This is money that actually moved. It is not profit: work sold but not yet paid for is
            not counted here, and money you owe suppliers is only counted once you have paid it.
          </p>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <SectionTitle>Where the money came in</SectionTitle>
              <div className="space-y-0.5">
                {Object.entries(data.in.byMethod).map(([method, amount]) => (
                  <div key={method} className="flex justify-between gap-4 py-1 text-sm">
                    <span className="text-muted">{METHOD_LABELS[method] || method}</span>
                    <span className="tnum">{fmt(amount)}</span>
                  </div>
                ))}
                <div className="mt-2 flex justify-between gap-4 border-t border-line pt-2 text-sm font-semibold">
                  <span>Total in</span>
                  <span className="tnum">{fmt(data.in.net)}</span>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <SectionTitle>Where it went</SectionTitle>
              {data.out.byCategory.length === 0 && !data.out.toSuppliers ? (
                <p className="py-3 text-sm text-muted">Nothing has gone out in this period.</p>
              ) : (
                <div className="space-y-0.5">
                  {data.out.byCategory.map((c) => (
                    <div key={c.category} className="flex justify-between gap-4 py-1 text-sm">
                      <span className="text-muted">{c.category}</span>
                      <span className="tnum">{fmt(c.total)}</span>
                    </div>
                  ))}
                  {data.out.toSuppliers > 0 ? (
                    <div className="flex justify-between gap-4 py-1 text-sm">
                      <span className="text-muted">
                        Paid to suppliers
                        <span className="ml-1 text-xs text-faint">
                          {data.out.supplierCount} payment(s)
                        </span>
                      </span>
                      <span className="tnum">{fmt(data.out.toSuppliers)}</span>
                    </div>
                  ) : null}
                  <div className="mt-2 flex justify-between gap-4 border-t border-line pt-2 text-sm font-semibold">
                    <span>Total out</span>
                    <span className="tnum">{fmt(data.out.total)}</span>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
