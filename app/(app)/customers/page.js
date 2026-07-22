'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import { Card, Chip, EmptyState, Loading, Segmented } from '@/components/ui';

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

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Customers</h1>

      <Segmented options={VIEWS} value={view} onChange={setView} />

      <input className="field" placeholder="Search by name or phone" value={q} onChange={(e) => setQ(e.target.value)} />

      <Card>
        {!customers ? (
          <Loading />
        ) : customers.length === 0 ? (
          <EmptyState
            title="No customers here"
            hint="Customers are created automatically the first time you record a job or sale for them."
          />
        ) : (
          <ul className="divide-y divide-line">
            {customers.map((c) => (
              <li key={c._id}>
                <Link href={`/customers/${c._id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-page">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate font-medium">
                      {c.name}
                      {c.isRepeat ? <Chip tone="brand">Repeat</Chip> : null}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {c.phone || 'No phone'} · {c.jobCount} job{c.jobCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tnum text-sm font-semibold">{fmt(c.totalBilled, { decimals: false })}</p>
                    {c.outstanding > 0 ? (
                      <p className="tnum text-xs font-semibold text-bad">{fmt(c.outstanding)} owing</p>
                    ) : (
                      <p className="text-xs text-faint">Settled</p>
                    )}
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
