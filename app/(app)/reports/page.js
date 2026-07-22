'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiGet } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import MethodBreakdown from '@/components/MethodBreakdown';
import { Card, EmptyState, Loading, Modal, SectionTitle, Segmented, StatTile } from '@/components/ui';

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
];

const EXPORTS = [
  { type: 'summary', label: 'Summary' },
  { type: 'sales', label: 'Sales' },
  { type: 'payments', label: 'Payments' },
  { type: 'jobs', label: 'Jobs' },
  { type: 'stock', label: 'Stock movements' },
  { type: 'expenses', label: 'Expenses' },
  { type: 'debtors', label: 'Debtors' },
  { type: 'customers', label: 'Customers' },
];

export default function ReportsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Reports />
    </Suspense>
  );
}

function Reports() {
  const { fmt } = useApp();
  const params = useSearchParams();

  const [period, setPeriod] = useState('today');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);

  const usingCustom = custom.from && custom.to;
  const query = usingCustom ? { from: custom.from, to: custom.to } : { period };

  useEffect(() => {
    setData(null);
    apiGet('/api/reports', query)
      .then(setData)
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, custom.from, custom.to]);

  // Deep link from the dashboard's "Daily summary" button.
  useEffect(() => {
    if (params.get('summary') === '1') openSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openSummary() {
    try {
      const res = await apiGet('/api/summary/daily', { period: 'today' });
      setSummary(res);
    } catch (e) {
      setError(e.message);
    }
  }

  function exportUrl(type) {
    const qs = new URLSearchParams({ type, ...query });
    return `/api/reports/export?${qs}`;
  }

  if (error) return <Card className="p-6 text-center text-bad">{error}</Card>;

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Reports</h1>
        <div className="flex gap-2">
          <button onClick={openSummary} className="btn-secondary btn-sm">
            Daily summary
          </button>
          <button onClick={() => window.print()} className="btn-secondary btn-sm">
            Print / PDF
          </button>
        </div>
      </div>

      <div className="no-print space-y-2">
        <Segmented
          options={PERIODS}
          value={usingCustom ? '' : period}
          onChange={(v) => {
            setCustom({ from: '', to: '' });
            setPeriod(v);
          }}
        />
        <div className="flex items-end gap-2">
          <label className="flex-1">
            <span className="label">From</span>
            <input
              className="field"
              type="date"
              value={custom.from}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
            />
          </label>
          <label className="flex-1">
            <span className="label">To</span>
            <input
              className="field"
              type="date"
              value={custom.to}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
            />
          </label>
          {usingCustom ? (
            <button onClick={() => setCustom({ from: '', to: '' })} className="btn-ghost btn-sm mb-0.5">
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {!data ? (
        <Loading />
      ) : (
        <>
          <p className="text-sm font-medium text-muted">
            Showing: <span className="text-ink">{data.label}</span>
          </p>

          {/* ---------------- headline ---------------- */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Money collected"
              value={fmt(data.summary.collected, { decimals: false })}
              sub="Cash actually received"
              tone="brand"
            />
            <StatTile
              label="Work invoiced"
              value={fmt(data.summary.billed, { decimals: false })}
              sub={`${data.summary.invoiceCount} invoice(s)`}
            />
            <StatTile
              label="Net profit"
              value={fmt(data.summary.netProfit, { decimals: false })}
              sub={`After materials and ${fmt(data.summary.expenses, { decimals: false })} running costs`}
              tone={data.summary.netProfit >= 0 ? 'good' : 'bad'}
            />
            <StatTile
              label="Owed to you"
              value={fmt(data.summary.outstanding, { decimals: false })}
              sub={`${data.summary.outstandingCount} unpaid (all time)`}
              tone={data.summary.outstanding > 0 ? 'warn' : 'default'}
            />
          </div>

          {/* Invoiced and collected differ whenever someone pays a deposit.
              Saying so once, here, prevents a lot of mistrust. */}
          <p className="rounded-lg bg-info-soft px-3 py-2 text-xs text-info-ink">
            <strong>Collected</strong> is money that actually came in during this period. <strong>Invoiced</strong> is
            the value of work sold. They differ when a customer pays a deposit now and the balance later — which is
            normal in printing.
          </p>

          <div className="grid gap-4 lg:grid-cols-2">
            <MethodBreakdown byMethod={data.byMethod} fmt={fmt} />

            <Card className="p-4">
              <SectionTitle>Also worth knowing</SectionTitle>
              <dl className="space-y-2 text-sm">
                <Row label="Jobs created" value={data.summary.jobsCreated} />
                <Row label="Jobs completed" value={data.summary.jobsCompleted} />
                <Row label="Discounts given" value={fmt(data.summary.discount)} />
                <Row label="Refunds" value={fmt(data.summary.refunds)} tone={data.summary.refunds > 0 ? 'text-bad' : ''} />
                <Row label="Material cost" value={fmt(data.summary.materialCost)} />
                <Row
                  label="Wastage & damage"
                  value={fmt(data.summary.wastageValue)}
                  tone={data.summary.wastageValue > 0 ? 'text-bad' : ''}
                />
                <Row
                  label="Till shortfalls"
                  value={fmt(data.register.shortfall)}
                  tone={data.register.shortfall > 0 ? 'text-bad' : ''}
                />
              </dl>
            </Card>
          </div>

          {/* The two figures spelled out, because an owner who mistakes one
              for the other will over-estimate what the business earned. */}
          <Card className="p-4">
            <SectionTitle
              action={
                <Link href="/expenses" className="text-sm font-semibold text-brand">
                  Manage expenses →
                </Link>
              }
            >
              How the profit is worked out
            </SectionTitle>

            <dl className="space-y-2 text-sm">
              <Row label="Work invoiced" value={fmt(data.summary.billed)} />
              <Row label="less materials used" value={`− ${fmt(data.summary.materialCost)}`} />
              <Row label="less wastage & damage" value={`− ${fmt(data.summary.wastageValue)}`} />
              <div className="border-t border-line pt-2">
                <Row label="Gross margin" value={fmt(data.summary.grossMargin)} tone="font-bold" />
              </div>
              <Row label="less running costs" value={`− ${fmt(data.summary.expenses)}`} />
              <div className="border-t border-line pt-2">
                <Row
                  label="Net profit"
                  value={fmt(data.summary.netProfit)}
                  tone={`font-bold ${data.summary.netProfit >= 0 ? 'text-good' : 'text-bad'}`}
                />
              </div>
            </dl>

            {data.expensesByCategory?.length > 0 ? (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-faint">Running costs</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {data.expensesByCategory.map((e) => (
                    <li key={e.category} className="flex justify-between">
                      <span className="text-muted">{e.category}</span>
                      <span className="tnum">{fmt(e.total)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-4 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
                No running costs recorded for this period, so “net profit” is the same as gross margin. Log diesel,
                rent, salaries and transport under <Link href="/expenses" className="font-semibold underline">Expenses</Link> to
                make this figure real.
              </p>
            )}
          </Card>

          {/* ---------------- best sellers ---------------- */}
          <Card>
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold">Best-selling job types</h2>
            </div>
            {data.jobTypes.length === 0 ? (
              <EmptyState title="No jobs in this period" />
            ) : (
              <div className="table-scroll">
                <table className="w-full min-w-[26rem]">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="th">Job type</th>
                      <th className="th text-right">Times ordered</th>
                      <th className="th text-right">Pieces</th>
                      <th className="th text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.jobTypes.map((j) => (
                      <tr key={j.jobType}>
                        <td className="td font-medium">{j.jobType}</td>
                        <td className="td tnum text-right">{j.count}</td>
                        <td className="td tnum text-right">{j.units}</td>
                        <td className="td tnum text-right font-semibold">{fmt(j.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <ListCard
              title="Top customers"
              hint="By money received in this period"
              rows={data.topCustomers}
              render={(c) => [c.name, fmt(c.total)]}
              empty="Nobody paid anything in this period."
            />
            <ListCard
              title="Staff performance"
              hint="Money taken and jobs handled"
              rows={data.staff}
              render={(s) => [`${s.name} · ${s.jobs} job(s)`, fmt(s.collected)]}
              empty="No staff activity in this period."
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ListCard
              title="Stock used"
              hint="Consumed on completed jobs"
              rows={data.stockUsed}
              render={(s) => [`${s.name} · ${s.quantity} ${s.unit}`, fmt(s.totalCost)]}
              empty="No stock was recorded against jobs in this period."
            />
            <ListCard
              title="Wastage & damage"
              hint="Where money leaked"
              rows={data.wastage}
              render={(w) => [`${w.name} · ${w.quantity} ${w.unit} (${w.type})`, fmt(w.totalCost)]}
              empty="No wastage logged. Either a good period, or nobody is logging it."
              tone="text-bad"
            />
          </div>

          {/* ---------------- exports ---------------- */}
          <Card className="no-print p-4">
            <SectionTitle>Export</SectionTitle>
            <p className="mb-3 text-xs text-muted">
              CSV files open straight in Excel. For a PDF, use “Print / PDF” above and choose “Save as PDF”.
            </p>
            <div className="flex flex-wrap gap-2">
              {EXPORTS.map((e) => (
                <a key={e.type} href={exportUrl(e.type)} className="btn-secondary btn-sm">
                  {e.label}
                </a>
              ))}
            </div>
          </Card>
        </>
      )}

      {summary ? <SummaryModal summary={summary} onClose={() => setSummary(null)} /> : null}
    </div>
  );
}

function Row({ label, value, tone = '' }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className={`tnum font-semibold ${tone}`}>{value}</dd>
    </div>
  );
}

function ListCard({ title, hint, rows, render, empty, tone = '' }) {
  return (
    <Card>
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      {!rows?.length ? (
        <p className="px-4 py-6 text-center text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.slice(0, 10).map((r, i) => {
            const [left, right] = render(r);
            return (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 truncate">{left}</span>
                <span className={`tnum shrink-0 font-semibold ${tone}`}>{right}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/**
 * The end-of-day message. WhatsApp Business API needs template approval and a
 * paid number, so rather than pretend to send, this hands over a link that
 * opens WhatsApp with the message already written. One tap, and it is sent.
 */
function SummaryModal({ summary, onClose }) {
  const [emailState, setEmailState] = useState(null);

  async function emailIt() {
    setEmailState('sending');
    try {
      const res = await apiGet('/api/summary/daily', { period: 'today', email: '1' });
      setEmailState(res.email?.sent ? 'sent' : res.email?.reason || 'Could not send');
    } catch (e) {
      setEmailState(e.message);
    }
  }

  return (
    <Modal open onClose={onClose} title="Today's takings">
      <div className="space-y-3">
        <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-page p-3 text-sm">
          {summary.text}
        </pre>

        <div className="grid gap-2">
          {summary.whatsappUrl ? (
            <a href={summary.whatsappUrl} target="_blank" rel="noreferrer" className="btn-good w-full">
              Send on WhatsApp
            </a>
          ) : (
            <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
              Add your WhatsApp number under Settings to send this with one tap.
            </p>
          )}

          <button onClick={emailIt} disabled={emailState === 'sending'} className="btn-secondary w-full">
            {emailState === 'sending' ? 'Sending…' : 'Email it to me'}
          </button>
          {emailState && emailState !== 'sending' ? (
            <p className={`text-center text-xs ${emailState === 'sent' ? 'text-good' : 'text-bad'}`}>
              {emailState === 'sent' ? 'Sent.' : emailState}
            </p>
          ) : null}

          <button onClick={() => navigator.clipboard?.writeText(summary.text)} className="btn-ghost w-full">
            Copy
          </button>
        </div>

        <p className="text-xs text-faint">
          This can also be sent automatically at closing time every day — see “Daily summary” in the README.
        </p>
      </div>
    </Modal>
  );
}
