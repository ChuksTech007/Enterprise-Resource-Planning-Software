'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import { Card, EmptyState, Loading, PAY_STATUS_META, Segmented, StatTile, StatusChip } from '@/components/ui';

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All' },
];

export default function SalesPage() {
  const { fmt } = useApp();
  const [period, setPeriod] = useState('today');
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    const params = { status, q, limit: 200 };
    if (period !== 'all') params.period = period;
    apiGet('/api/sales', params)
      .then(setData)
      .catch(() => setData({ sales: [], totals: {} }));
  }, [period, status, q]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Sales & invoices</h1>
        <Link href="/sales/new" className="btn-primary btn-sm">
          New sale
        </Link>
      </div>

      <Segmented options={PERIODS} value={period} onChange={setPeriod} />

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Invoiced" value={fmt(data?.totals?.billed || 0, { decimals: false })} sub={`${data?.totals?.count || 0} invoice(s)`} />
        <StatTile label="Collected" value={fmt(data?.totals?.paid || 0, { decimals: false })} tone="good" />
        <StatTile label="Still owed" value={fmt(data?.totals?.owed || 0, { decimals: false })} tone={data?.totals?.owed > 0 ? 'warn' : 'default'} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="field flex-1"
          placeholder="Search invoice no., customer or job no."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="field sm:w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Part paid</option>
          <option value="paid">Paid</option>
        </select>
      </div>

      <Card>
        {!data ? (
          <Loading />
        ) : data.sales.length === 0 ? (
          <EmptyState title="No sales here" hint="Try a different period, or record a new sale." />
        ) : (
          <ul className="divide-y divide-line">
            {data.sales.map((s) => (
              <li key={s._id}>
                <Link href={`/sales/${s._id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-page">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.customerName}</p>
                    <p className="truncate text-xs text-muted">
                      {s.invoiceNumber}
                      {s.jobNumber ? ` · ${s.jobNumber}` : ''} ·{' '}
                      {new Date(s.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ·{' '}
                      {s.createdByName}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tnum font-semibold">{fmt(s.total)}</p>
                    <div className="mt-0.5 flex items-center justify-end gap-1">
                      {s.balance > 0 ? <span className="tnum text-xs text-bad">{fmt(s.balance)} owing</span> : null}
                      <StatusChip status={s.status} map={PAY_STATUS_META} />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
