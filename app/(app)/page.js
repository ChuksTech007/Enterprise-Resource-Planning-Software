'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import MethodBreakdown from '@/components/MethodBreakdown';
import { Card, Chip, EmptyState, Loading, SectionTitle, StatTile, StatusChip } from '@/components/ui';

export default function DashboardPage() {
  const { fmt, isOwner, user, openRegister } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiGet('/api/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Card className="p-6 text-center text-bad">{error}</Card>;
  if (!data) return <Loading />;

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">
          {greeting}, {user?.name?.split(' ')[0]}
        </h1>
        <p className="text-sm text-muted">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* The till nudge: a cashier who has not opened a till cannot take cash,
          so say so before they try, not after. */}
      {!openRegister && (
        <Link href="/register" className="block rounded-card bg-warn-soft p-4 text-warn">
          <p className="font-semibold">Your till is not open</p>
          <p className="text-sm">Open it with your starting cash before taking any cash payments. Tap here.</p>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={isOwner ? 'Taken today' : 'You took today'}
          value={fmt(data.today.collected, { decimals: false })}
          sub={`${data.today.paymentCount} payment${data.today.paymentCount === 1 ? '' : 's'}`}
          tone="brand"
        />
        <StatTile
          label="Owed to you"
          value={fmt(data.outstanding.total, { decimals: false })}
          sub={`${data.outstanding.count} unpaid invoice${data.outstanding.count === 1 ? '' : 's'}`}
          tone={data.outstanding.total > 0 ? 'warn' : 'default'}
        />
        <StatTile label="Jobs today" value={data.today.jobsCreated} sub={data.rushCount ? `${data.rushCount} rush job(s) open` : 'No rush jobs'} />
        {isOwner && data.moneyLeft !== undefined ? (
          <StatTile
            label="Money left"
            value={fmt(data.moneyLeft, { decimals: false })}
            sub="Everything in, less everything out"
            tone={data.moneyLeft >= 0 ? 'brand' : 'bad'}
          />
        ) : null}
        <StatTile
          label="Ready for pickup"
          value={data.readyForPickup.length}
          sub={data.lowStockCount ? `${data.lowStockCount} item(s) low on stock` : 'Stock levels fine'}
          tone={data.readyForPickup.length > 0 ? 'good' : 'default'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MethodBreakdown byMethod={data.today.byMethod} fmt={fmt} title={isOwner ? "Today's money in" : 'Your money in today'} />

        <Card className="p-4">
          <SectionTitle
            action={
              <Link href="/sales/new" className="text-sm font-semibold text-brand">
                New sale →
              </Link>
            }
          >
            Quick actions
          </SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/sales/new" className="btn-primary">
              Record a sale
            </Link>
            <Link href="/jobs/new" className="btn-secondary">
              New job / quote
            </Link>
            <Link href="/debts" className="btn-secondary">
              Collect a balance
            </Link>
            <Link href="/register" className="btn-secondary">
              Cash-up
            </Link>
            {isOwner && (
              <>
                <Link href="/reports" className="btn-secondary">
                  Reports
                </Link>
                <Link href="/reports?summary=1" className="btn-secondary">
                  Daily summary
                </Link>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* --------- work that needs attention --------- */}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">Ready for pickup</h2>
            <p className="text-xs text-muted">Finished work waiting to be collected</p>
          </div>
          {data.readyForPickup.length === 0 ? (
            <EmptyState title="Nothing waiting" hint="Finished jobs show up here until the customer collects them." />
          ) : (
            <ul className="divide-y divide-line">
              {data.readyForPickup.slice(0, 8).map((j) => (
                <li key={j._id}>
                  <Link href={`/jobs/${j._id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-page">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{j.customerName}</p>
                      <p className="truncate text-xs text-muted">
                        {j.jobNumber} · {j.jobType}
                      </p>
                    </div>
                    {j.isRush ? <Chip tone="bad">Rush</Chip> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">Running late</h2>
            <p className="text-xs text-muted">Past the deadline and not finished</p>
          </div>
          {data.overdueJobs.length === 0 ? (
            <EmptyState title="Nothing overdue" hint="Every job in production is still within its deadline." />
          ) : (
            <ul className="divide-y divide-line">
              {data.overdueJobs.slice(0, 8).map((j) => (
                <li key={j._id}>
                  <Link href={`/jobs/${j._id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-page">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{j.customerName}</p>
                      <p className="truncate text-xs text-muted">
                        {j.jobNumber} · due {new Date(j.deadline).toLocaleDateString('en-GB')}
                      </p>
                    </div>
                    <StatusChip status={j.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {data.lowStock.length > 0 && (
        <Card>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Reorder these</h2>
              <p className="text-xs text-muted">At or below the level you set</p>
            </div>
            <Link href="/inventory?low=1" className="text-sm font-semibold text-brand">
              See all →
            </Link>
          </div>
          <ul className="divide-y divide-line">
            {data.lowStock.slice(0, 6).map((m) => (
              <li key={m._id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{m.name}</p>
                  <p className="truncate text-xs text-muted">
                    {[m.size, m.gsm && `${m.gsm}gsm`, m.colour].filter(Boolean).join(' · ') || m.category}
                    {m.supplier?.name ? ` · ${m.supplier.name} (${m.supplier.leadTimeDays}d lead)` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tnum font-semibold text-bad">
                    {m.quantity} {m.unit}
                  </p>
                  <p className="text-xs text-faint">reorder at {m.reorderLevel}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {isOwner && data.openTills?.length > 0 && (
        <Card className="p-4">
          <SectionTitle>Tills still open</SectionTitle>
          <ul className="space-y-2">
            {data.openTills.map((t) => (
              <li key={t._id} className="flex items-center justify-between text-sm">
                <span className="font-medium">{t.userName}</span>
                <span className="text-muted">
                  since {new Date(t.openedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · float{' '}
                  {fmt(t.openingFloat, { decimals: false })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
