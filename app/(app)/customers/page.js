'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import DataTable from '@/components/DataTable';
import { Chip, EmptyState, Loading, Segmented } from '@/components/ui';

const VIEWS = [
  { value: 'all', label: 'Everyone' },
  { value: 'debtors', label: 'Owing money' },
  { value: 'repeat', label: 'Repeat' },
];

export default function CustomersPage() {
  const { fmt } = useApp();
  const [view, setView] = useState('all');
  const [q, setQ] = useState('');
  const [customers, setCustomers] = useState(null);

  useEffect(() => {
    setCustomers(null);
    const params = { q, limit: 300 };
    if (view === 'debtors') params.debtors = '1';
    if (view === 'repeat') params.repeat = '1';
    apiGet('/api/customers', params)
      .then((d) => setCustomers(d.customers))
      .catch(() => setCustomers([]));
  }, [view, q]);

  const columns = [
    {
      key: 'name',
      label: 'Name',
      render: (c) => (
        <span className="flex items-center gap-1.5">
          <span className="max-w-[14rem] truncate font-medium">{c.name}</span>
          {c.isRepeat ? <Chip tone="brand">Repeat</Chip> : null}
        </span>
      ),
    },
    {
      key: 'phone',
      label: 'Phone',
      /* The number is how a customer is found again when they come back for
       * a job, so it earns a column rather than sitting in small print. */
      render: (c) => c.phone || <span className="text-faint">—</span>,
    },
    { key: 'jobCount', label: 'Jobs', align: 'right', tnum: true, hideOn: 'sm' },
    {
      key: 'totalBilled',
      label: 'Billed',
      align: 'right',
      tnum: true,
      hideOn: 'sm',
      render: (c) => fmt(c.totalBilled, { decimals: false }),
    },
    {
      key: 'outstanding',
      label: 'Owing',
      align: 'right',
      tnum: true,
      render: (c) =>
        c.outstanding > 0 ? (
          <span className="font-semibold text-bad">{fmt(c.outstanding)}</span>
        ) : (
          <span className="text-xs text-faint">Settled</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Customers</h1>

      <Segmented options={VIEWS} value={view} onChange={setView} />

      <input className="field" placeholder="Search by name or phone" value={q} onChange={(e) => setQ(e.target.value)} />

      <DataTable
        columns={columns}
        rows={customers || []}
        loading={!customers}
        hrefFor={(c) => `/customers/${c._id}`}
        minWidth={760}
        empty={
          <EmptyState
            title="No customers here"
            hint="Customers are created automatically the first time you record a job or sale for them."
          />
        }
      />
    </div>
  );
}
