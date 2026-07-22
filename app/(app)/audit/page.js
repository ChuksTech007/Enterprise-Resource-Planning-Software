'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/client';
import { Card, Chip, EmptyState, Loading, Segmented } from '@/components/ui';

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'all', label: 'All' },
];

// Actions worth flagging visually — the ones that move money or erase records.
const TONE_FOR = (action) => {
  if (action.startsWith('payment.refund') || action.includes('void') || action.includes('cancel')) return 'bad';
  if (action.startsWith('register.close')) return 'warn';
  if (action.startsWith('payment') || action.startsWith('sale')) return 'good';
  if (action.startsWith('auth')) return 'neutral';
  return 'info';
};

/** Who did what, when. Nothing in this app happens without landing here. */
export default function AuditPage() {
  const [period, setPeriod] = useState('week');
  const [action, setAction] = useState('all');
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    const params = { action, limit: 300 };
    if (period !== 'all') params.period = period;
    apiGet('/api/audit', params)
      .then(setData)
      .catch(() => setData({ logs: [], actions: [] }));
  }, [period, action]);

  const groups = [...new Set((data?.actions || []).map((a) => a.split('.')[0]))];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Activity log</h1>
      <p className="text-sm text-muted">Every action taken in the system, and who took it.</p>

      <Segmented options={PERIODS} value={period} onChange={setPeriod} />

      <select className="field" value={action} onChange={(e) => setAction(e.target.value)}>
        <option value="all">Everything</option>
        {groups.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>

      <Card>
        {!data ? (
          <Loading />
        ) : data.logs.length === 0 ? (
          <EmptyState title="Nothing logged" hint="No activity recorded in this period." />
        ) : (
          <ul className="divide-y divide-line">
            {data.logs.map((l) => (
              <li key={l._id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{l.label || l.action}</p>
                    <p className="truncate text-xs text-muted">
                      {l.userName}
                      {l.role ? ` (${l.role})` : ''} ·{' '}
                      {new Date(l.createdAt).toLocaleString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <Chip tone={TONE_FOR(l.action)}>{l.action}</Chip>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
