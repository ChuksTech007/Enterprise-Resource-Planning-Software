'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiGet } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import DataTable from '@/components/DataTable';
import { Chip, EmptyState, Loading, Segmented, StatusChip, COLLECTION_META } from '@/components/ui';

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

  /* Overdue is worked out once here rather than inside a cell, because two
   * columns need it: the date turns red and the whole row is tinted. */
  const rows = (data?.jobs || []).map((j) => ({
    ...j,
    _overdue:
      j.deadline &&
      new Date(j.deadline) < new Date() &&
      !['done', 'delivered', 'cancelled'].includes(j.status),
    _tone:
      j.deadline &&
      new Date(j.deadline) < new Date() &&
      !['done', 'delivered', 'cancelled'].includes(j.status)
        ? 'bad'
        : undefined,
  }));

  const columns = [
    {
      key: 'jobNumber',
      label: 'Job',
      render: (j) => (
        <span className="whitespace-nowrap font-medium">
          {j.isRush ? <Chip tone="bad">Rush</Chip> : null} {j.jobNumber}
        </span>
      ),
    },
    {
      key: 'customerName',
      label: 'Customer',
      render: (j) => (
        <span className="block max-w-[16rem] truncate">{j.customerName}</span>
      ),
    },
    {
      key: 'specs.size',
      label: 'Size',
      hideOn: 'sm',
      /* The measurement is the first thing anyone at the bench asks for, so
       * it gets a column of its own rather than being buried in a
       * description. */
      render: (j) => j.specs?.size || <span className="text-faint">—</span>,
    },
    {
      key: 'description',
      label: 'What',
      hideOn: 'md',
      render: (j) => (
        <span className="block max-w-[18rem] truncate text-muted">
          {j.description || j.jobType}
        </span>
      ),
    },
    { key: 'quantity', label: 'Qty', align: 'right', tnum: true, hideOn: 'sm' },
    {
      key: 'status',
      label: 'Status',
      render: (j) => (
        <span className="flex flex-wrap items-center gap-1">
          <StatusChip status={j.status} />
          {j.collectionStatus !== 'not_ready' ? (
            <StatusChip status={j.collectionStatus} map={COLLECTION_META} />
          ) : null}
        </span>
      ),
    },
    {
      key: 'deadline',
      label: 'Due',
      hideOn: 'sm',
      render: (j) =>
        j.deadline ? (
          <span className={j._overdue ? 'font-semibold text-bad' : 'text-muted'}>
            {new Date(j.deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
          </span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    {
      key: 'price',
      label: 'Price',
      align: 'right',
      tnum: true,
      render: (j) => (
        <span className="font-semibold">{fmt(j.price - (j.discount || 0))}</span>
      ),
    },
    {
      key: 'owing',
      label: 'Owing',
      align: 'right',
      tnum: true,
      /* Kept apart from the price. "What it cost" and "what is still to be
       * collected" are different questions, and running an eye down this one
       * column is how the owner sees the money still out. */
      render: (j) =>
        j.sale?.balance > 0 ? (
          <span className="font-semibold text-bad">{fmt(j.sale.balance)}</span>
        ) : j.sale ? (
          <span className="text-xs text-good">Paid</span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Jobs &amp; quotes</h1>
        <Link href="/quote" className="btn-primary btn-sm">
          New invoice
        </Link>
      </div>

      <Segmented options={VIEWS} value={view} onChange={setView} />

      <input
        className="field"
        placeholder="Search job no., customer or description"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <DataTable
        columns={columns}
        rows={rows}
        loading={!data}
        hrefFor={(j) => `/jobs/${j._id}`}
        minWidth={880}
        empty={
          <EmptyState
            title="Nothing here"
            hint={
              view === 'quote'
                ? 'Quotes you save will sit here until the customer accepts them.'
                : 'No jobs match this view.'
            }
            action={
              <Link href="/quote" className="btn-primary btn-sm">
                Take an order
              </Link>
            }
          />
        }
      />
    </div>
  );
}
