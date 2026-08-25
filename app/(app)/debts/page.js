'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet, apiPost } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import ShareModal from '@/components/ShareModal';
import DataTable from '@/components/DataTable';
import { Chip, EmptyState, Loading, StatTile } from '@/components/ui';

/**
 * Who owes money, worst first.
 *
 * Half-upfront is normal in printing, so this list is not an exception report —
 * it is a daily working list. Age is shown in days because "three weeks old"
 * is what makes an owner pick up the phone, not the invoice date.
 */
export default function DebtsPage() {
  const { fmt, toast } = useApp();
  const [data, setData] = useState(null);
  const [reminder, setReminder] = useState(null);

  useEffect(() => {
    apiGet('/api/debts')
      .then(setData)
      .catch(() => setData({ invoices: [], total: 0 }));
  }, []);

  async function remind(invoice) {
    try {
      const res = await apiPost(`/api/sales/${invoice._id}/reminder`, {}, { queue: false });
      setReminder(res);
    } catch (e) {
      toast(e.message, 'bad');
    }
  }

  if (!data) return <Loading />;

  const oldest = data.invoices.filter((i) => i.ageDays >= 14);

  const columns = [
    {
      key: 'customerName',
      label: 'Customer',
      render: (s) => (
        <span className="block max-w-[14rem] truncate font-medium">{s.customerName}</span>
      ),
    },
    {
      key: 'invoiceNumber',
      label: 'Invoice',
      hideOn: 'sm',
      render: (s) => (
        <span className="whitespace-nowrap">
          {s.invoiceNumber}
          {s.jobNumber ? <span className="ml-1 text-xs text-faint">{s.jobNumber}</span> : null}
        </span>
      ),
    },
    {
      key: 'paid',
      label: 'Paid',
      align: 'right',
      tnum: true,
      hideOn: 'md',
      render: (s) => (
        <span className="text-muted">
          {fmt(s.amountPaid)} of {fmt(s.total)}
        </span>
      ),
    },
    {
      key: 'balance',
      label: 'Owing',
      align: 'right',
      tnum: true,
      render: (s) => <span className="font-bold text-bad">{fmt(s.balance)}</span>,
    },
    {
      key: 'ageDays',
      label: 'Age',
      align: 'right',
      /* How old a debt is decides what the shop does about it, so it is a
       * column to sort an eye down rather than a note under the amount. */
      render: (s) => (
        <span className="whitespace-nowrap">
          <span className={s.ageDays >= 30 ? 'font-semibold text-bad' : ''}>{s.ageDays}d</span>
          {s.overdue ? <Chip tone="bad">Past due</Chip> : null}
        </span>
      ),
    },
    {
      key: 'reminderCount',
      label: 'Reminded',
      align: 'right',
      hideOn: 'md',
      render: (s) =>
        s.reminderCount > 0 ? s.reminderCount + '×' : <span className="text-faint">—</span>,
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      /* The row is not a link here, because there are two different things a
       * person wants to do with a debt and neither is "look at it". */
      render: (s) => (
        <span className="flex justify-end gap-1 whitespace-nowrap">
          <button onClick={() => remind(s)} className="btn-secondary btn-sm">
            Remind
          </button>
          <Link href={`/sales/${s._id}`} className="btn-primary btn-sm">
            Collect
          </Link>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Who owes me</h1>

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Total owed"
          value={fmt(data.total, { decimals: false })}
          sub={`${data.invoices.length} invoice(s)`}
          tone={data.total > 0 ? 'bad' : 'good'}
        />
        <StatTile
          label="Over two weeks old"
          value={fmt(oldest.reduce((s, i) => s + i.balance, 0), { decimals: false })}
          sub={`${oldest.length} invoice(s)`}
          tone={oldest.length > 0 ? 'warn' : 'default'}
        />
      </div>

      <DataTable
        columns={columns}
        rows={data?.invoices || []}
        loading={!data}
        minWidth={880}
        empty={<EmptyState title="Nobody owes you anything" hint="Every invoice is settled." />}
      />

      <ShareModal share={reminder} title="Send a reminder" onClose={() => setReminder(null)} />
    </div>
  );
}
