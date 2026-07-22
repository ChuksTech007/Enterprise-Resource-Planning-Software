'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiGet } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import { Card, Chip, EmptyState, Loading, Segmented, StatusChip, COLLECTION_META } from '@/components/ui';

const VIEWS = [
  { value: 'open', label: 'In progress' },
  { value: 'quote', label: 'Quotes' },
  { value: 'ready', label: 'Ready' },
  { value: 'all', label: 'All' },
];

export default function JobsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <JobsList />
    </Suspense>
  );
}

function JobsList() {
  const { fmt } = useApp();
  const params = useSearchParams();
  const [view, setView] = useState(params.get('view') || 'open');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    const query = { q, limit: 200 };
    if (view === 'open') query.open = '1';
    else if (view === 'quote') query.status = 'quote';
    else if (view === 'ready') query.collection = 'ready';

    apiGet('/api/jobs', query)
      .then(setData)
      .catch(() => setData({ jobs: [], counts: {} }));
  }, [view, q]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Jobs & quotes</h1>
        <Link href="/jobs/new" className="btn-primary btn-sm">
          New job
        </Link>
      </div>

      <Segmented options={VIEWS} value={view} onChange={setView} />

      <input
        className="field"
        placeholder="Search job no., customer or description"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <Card>
        {!data ? (
          <Loading />
        ) : data.jobs.length === 0 ? (
          <EmptyState
            title="Nothing here"
            hint={view === 'quote' ? 'Quotes you create will appear here until they are approved.' : 'No jobs match this view.'}
            action={
              <Link href="/jobs/new" className="btn-primary btn-sm">
                Create a job
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {data.jobs.map((j) => {
              const overdue =
                j.deadline && new Date(j.deadline) < new Date() && !['done', 'delivered', 'cancelled'].includes(j.status);
              return (
                <li key={j._id}>
                  <Link href={`/jobs/${j._id}`} className="block px-4 py-3 hover:bg-page">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate font-medium">
                          {j.isRush ? <Chip tone="bad">Rush</Chip> : null}
                          {j.customerName}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {j.jobNumber} · {j.jobType} · {j.quantity} pc
                          {j.description ? ` · ${j.description}` : ''}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tnum font-semibold">{fmt(j.price - (j.discount || 0))}</p>
                        {j.sale?.balance > 0 ? (
                          <p className="tnum text-xs text-bad">{fmt(j.sale.balance)} owing</p>
                        ) : j.sale ? (
                          <p className="text-xs text-good">Paid</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <StatusChip status={j.status} />
                      {j.collectionStatus !== 'not_ready' ? (
                        <StatusChip status={j.collectionStatus} map={COLLECTION_META} />
                      ) : null}
                      {j.deadline ? (
                        <span className={`text-xs ${overdue ? 'font-semibold text-bad' : 'text-faint'}`}>
                          {overdue ? 'Overdue · ' : 'Due '}
                          {new Date(j.deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
