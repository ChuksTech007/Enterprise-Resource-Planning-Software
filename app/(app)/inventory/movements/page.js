'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import { Card, Chip, EmptyState, Loading, Segmented } from '@/components/ui';

const LABELS = {
  in: 'Stock in',
  used: 'Used on job',
  wastage: 'Wastage',
  damage: 'Damage',
  adjustment: 'Count correction',
  return: 'Returned',
};

const TONES = {
  in: 'good',
  used: 'brand',
  wastage: 'bad',
  damage: 'bad',
  adjustment: 'warn',
  return: 'info',
};

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'all', label: 'All' },
];

/**
 * The full stock-movement log: every unit that came in, went out on a job, or
 * was wasted — with the reason and the staff name attached. This is the record
 * that answers "where did the paper go".
 */
export default function MovementsPage() {
  const { fmt, isOwner } = useApp();
  const [period, setPeriod] = useState('week');
  const [type, setType] = useState('all');
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    const params = { type, limit: 300 };
    if (period !== 'all') params.period = period;
    apiGet('/api/movements', params)
      .then(setData)
      .catch(() => setData({ movements: [] }));
  }, [period, type]);

  const wastageValue = isOwner
    ? (data?.movements || [])
        .filter((m) => m.type === 'wastage' || m.type === 'damage')
        .reduce((s, m) => s + m.quantity * (m.unitCost || 0), 0)
    : null;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Stock movements</h1>

      <Segmented options={PERIODS} value={period} onChange={setPeriod} />

      <select className="field" value={type} onChange={(e) => setType(e.target.value)}>
        <option value="all">All movement types</option>
        {Object.entries(LABELS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>

      {isOwner && wastageValue > 0 ? (
        <div className="rounded-card bg-bad-soft px-4 py-3">
          <p className="text-sm font-semibold text-bad">
            Wastage and damage in this period: {fmt(wastageValue)}
          </p>
          <p className="text-xs text-bad/80">Money that left the building as spoiled stock.</p>
        </div>
      ) : null}

      <Card>
        {!data ? (
          <Loading />
        ) : data.movements.length === 0 ? (
          <EmptyState title="No movements" hint="Nothing has moved in or out of stock in this period." />
        ) : (
          <ul className="divide-y divide-line">
            {data.movements.map((m) => (
              <li key={m._id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.materialName}</p>
                    <p className="truncate text-xs text-muted">
                      {new Date(m.createdAt).toLocaleString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      · {m.userName || 'system'}
                      {m.jobNumber ? ` · ${m.jobNumber}` : ''}
                    </p>
                    {m.reason ? <p className="truncate text-xs text-faint">{m.reason}</p> : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`tnum font-bold ${m.delta < 0 ? 'text-bad' : 'text-good'}`}>
                      {m.delta > 0 ? '+' : ''}
                      {m.delta} <span className="text-xs font-normal text-muted">{m.unit}</span>
                    </p>
                    <p className="tnum text-xs text-faint">balance {m.balanceAfter}</p>
                  </div>
                </div>
                <div className="mt-1.5">
                  <Chip tone={TONES[m.type]}>{LABELS[m.type] || m.type}</Chip>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
