'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import DataTable from '@/components/DataTable';
import { EmptyState, Loading, PAY_STATUS_META, Segmented, StatTile, StatusChip } from '@/components/ui';

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

  const columns = [
    {
      key: 'invoiceNumber',
      label: 'Invoice',
      render: (s) => (
        <span className="whitespace-nowrap font-medium">
          {s.invoiceNumber}
          {s.jobNumber ? <span className="ml-1 text-xs text-faint">{s.jobNumber}</span> : null}
        </span>
      ),
    },
    {
      key: 'customerName',
      label: 'Customer',
      render: (s) => <span className="block max-w-[16rem] truncate">{s.customerName}</span>,
    },
    {
      key: 'createdAt',
      label: 'Date',
      hideOn: 'sm',
      render: (s) =>
        new Date(s.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    },
    { key: 'createdByName', label: 'Served by', hideOn: 'md' },
    {
      key: 'total',
      label: 'Total',
      align: 'right',
      tnum: true,
      render: (s) => <span className="font-semibold">{fmt(s.total)}</span>,
    },
    {
      /* Kept in its own column so a glance down it shows every naira still
       * to be collected, without reading a single invoice. */
      key: 'balance',
      label: 'Owing',
      align: 'right',
      tnum: true,
      render: (s) =>
        s.balance > 0 ? (
          <span className="font-semibold text-bad">{fmt(s.balance)}</span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (s) => <StatusChip status={s.status} map={PAY_STATUS_META} />,
    },
  ];

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

      <DataTable
        columns={columns}
        rows={data?.sales || []}
        loading={!data}
        hrefFor={(s) => `/sales/${s._id}`}
        minWidth={820}
        empty={<EmptyState title="No invoices here" hint="Invoices appear as work is sold." />}
      />
    </div>
  );
}
