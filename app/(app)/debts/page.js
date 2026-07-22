'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet, apiPost } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import ShareModal from '@/components/ShareModal';
import { Card, Chip, EmptyState, Loading, StatTile } from '@/components/ui';

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

      <Card>
        {data.invoices.length === 0 ? (
          <EmptyState title="Nobody owes you anything" hint="Every invoice has been settled in full. Rare and excellent." />
        ) : (
          <ul className="divide-y divide-line">
            {data.invoices.map((s) => (
              <li key={s._id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.customerName}</p>
                    <p className="truncate text-xs text-muted">
                      {s.invoiceNumber}
                      {s.jobNumber ? ` · ${s.jobNumber}` : ''} · {fmt(s.amountPaid)} of {fmt(s.total)} paid
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tnum font-bold text-bad">{fmt(s.balance)}</p>
                    <p className="text-xs text-faint">{s.ageDays} day{s.ageDays === 1 ? '' : 's'} old</p>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {s.ageDays >= 30 ? (
                    <Chip tone="bad">Over a month</Chip>
                  ) : s.ageDays >= 14 ? (
                    <Chip tone="warn">Over two weeks</Chip>
                  ) : null}
                  {s.overdue ? <Chip tone="bad">Past due date</Chip> : null}
                  {s.reminderCount > 0 ? (
                    <Chip tone="neutral">
                      Reminded {s.reminderCount}×
                    </Chip>
                  ) : null}

                  <div className="flex-1" />
                  <button onClick={() => remind(s)} className="btn-secondary btn-sm">
                    Remind
                  </button>
                  <Link href={`/sales/${s._id}`} className="btn-primary btn-sm">
                    Collect
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ShareModal share={reminder} title="Send a reminder" onClose={() => setReminder(null)} />
    </div>
  );
}
