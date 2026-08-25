'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { apiGet, apiPost } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import { Card, EmptyState, Loading, Modal, SectionTitle, Segmented, Spinner, StatTile } from '@/components/ui';

const VIEWS = [
  { value: 'overview', label: 'Overview' },
  { value: 'profit-loss', label: 'Profit & loss' },
  { value: 'balance-sheet', label: 'Balance sheet' },
  { value: 'trial-balance', label: 'Trial balance' },
  { value: 'journal', label: 'Journal' },
];

const PERIODS = [
  { value: 'month', label: 'This month' },
  { value: 'lastmonth', label: 'Last month' },
  { value: 'year', label: 'This year' },
  { value: 'today', label: 'Today' },
];

export default function AccountingPage() {
  const { fmt, toast } = useApp();
  const [view, setView] = useState('overview');
  const [period, setPeriod] = useState('month');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [rebuild, setRebuild] = useState(null);

  /* Only the newest request may write to state.
   *
   * Each tab returns a differently shaped payload, and switching tabs on a
   * slow connection let an older reply land after the view had moved on —
   * the journal tab would then be handed a profit-and-loss payload, read
   * `entries` off it, find nothing there and take the whole page down with
   * a client-side exception. Tagging each request and ignoring stale
   * replies is what stops that. */
  const request = useRef(0);

  const load = useCallback(() => {
    const id = ++request.current;
    setData(null);
    setError('');
    apiGet('/api/accounting', { report: view, period })
      .then((d) => request.current === id && setData(d))
      .catch((e) => request.current === id && setError(e.message));
  }, [view, period]);

  useEffect(load, [load]);

  async function doRebuild() {
    setRebuild({ running: true });
    try {
      const res = await apiPost('/api/accounting', { action: 'rebuild' }, { queue: false });
      setRebuild(res);
      toast(res.balanced ? 'Ledger rebuilt and balanced' : 'Rebuilt, but the books do not balance', res.balanced ? 'good' : 'bad');
      load();
    } catch (e) {
      setRebuild(null);
      toast(e.message, 'bad');
    }
  }

  if (error) {
    return (
      <Card className="space-y-3 p-6 text-center">
        <p className="text-bad">{error}</p>
        <button onClick={load} className="btn-secondary btn-sm">
          Try again
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Accounts</h1>
        <div className="flex gap-2">
          <button onClick={doRebuild} className="btn-secondary btn-sm">
            Rebuild ledger
          </button>
          <button onClick={() => window.print()} className="btn-secondary btn-sm">
            Print / PDF
          </button>
        </div>
      </div>

      <div className="no-print space-y-2">
        <Segmented options={VIEWS} value={view} onChange={setView} />
        <Segmented options={PERIODS} value={period} onChange={setPeriod} />
      </div>

      {!data ? (
        <Loading />
      ) : (
        <>
          <p className="text-sm text-muted">
            Period: <span className="font-medium text-ink">{data.label}</span>
          </p>

          {/* Each tab needs a differently shaped payload, so each one is
              only rendered once the field it depends on is actually there.
              The guard above should mean a mismatch never arrives — this is
              the second line of defence, because the cost of being wrong is
              the whole page going blank on the owner rather than a tab
              taking an extra moment to fill in. */}
          {view === 'overview' && data.trialBalance && <Overview data={data} fmt={fmt} />}
          {view === 'profit-loss' && data.income && <ProfitLoss pl={data} fmt={fmt} />}
          {view === 'balance-sheet' && data.assets && <BalanceSheet bs={data} fmt={fmt} />}
          {view === 'trial-balance' && data.rows && <TrialBalance tb={data} fmt={fmt} />}
          {view === 'journal' && data.entries && <Journal data={data} fmt={fmt} />}
        </>
      )}

      {rebuild && (
        <Modal open onClose={() => setRebuild(null)} title="Rebuilding the ledger">
          {rebuild.running ? (
            <div className="flex items-center gap-2 py-6 text-muted">
              <Spinner /> Replaying every transaction…
            </div>
          ) : (
            <div className="space-y-3">
              <div
                className={`rounded-lg px-3 py-2.5 font-semibold ${
                  rebuild.balanced ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad'
                }`}
              >
                {rebuild.balanced
                  ? 'The books balance.'
                  : `Out of balance by ${fmt(rebuild.difference)} — do not trust these figures.`}
              </div>
              <ul className="space-y-1 text-sm text-muted">
                {rebuild.log?.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Overview({ data, fmt }) {
  const pl = data.profitLoss;
  const bs = data.balanceSheet;

  return (
    <div className="space-y-4">
      {!data.trialBalance.balanced && (
        <div className="rounded-card bg-bad-soft px-4 py-3 font-semibold text-bad">
          The ledger is out of balance by {fmt(data.trialBalance.difference)}. Use “Rebuild ledger” above.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Revenue" value={fmt(pl.revenue, { decimals: false })} tone="brand" />
        <StatTile
          label="Gross profit"
          value={fmt(pl.grossProfit, { decimals: false })}
          sub={`${pl.grossMarginPct}% margin`}
        />
        <StatTile
          label="Net profit"
          value={fmt(pl.netProfit, { decimals: false })}
          sub={`${pl.netMarginPct}% margin`}
          tone={pl.netProfit >= 0 ? 'good' : 'bad'}
        />
        <StatTile
          label="What the business is worth"
          value={fmt(bs.totalEquity, { decimals: false })}
          sub="Assets less what you owe"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ProfitLoss pl={pl} fmt={fmt} compact />
        <BalanceSheet bs={bs} fmt={fmt} compact />
      </div>
    </div>
  );
}

function Rows({ rows, fmt }) {
  return rows.map((r) => (
    <div key={r.code} className="flex justify-between gap-4 py-1 text-sm">
      <span className="min-w-0 truncate text-muted">
        <span className="mr-2 text-faint">{r.code}</span>
        {r.name}
      </span>
      <span className="tnum shrink-0">{fmt(r.balance)}</span>
    </div>
  ));
}

function ProfitLoss({ pl, fmt, compact }) {
  return (
    <Card className="p-4">
      <SectionTitle>Profit &amp; loss</SectionTitle>
      {!compact && (
        <p className="mb-3 text-xs text-muted">
          This counts work <strong>sold</strong> in the period, whether or not the customer has paid yet. It will not
          match the cash figure on the takings report, and both are correct.
        </p>
      )}

      <div className="space-y-0.5">
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-faint">Income</p>
        <Rows rows={pl.income} fmt={fmt} />
        <Total label="Revenue" value={fmt(pl.revenue)} />

        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-faint">Cost of sales</p>
        <Rows rows={pl.costOfSales} fmt={fmt} />
        <Total label="Gross profit" value={fmt(pl.grossProfit)} sub={`${pl.grossMarginPct}%`} />

        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-faint">Running costs</p>
        {pl.expenses.length ? <Rows rows={pl.expenses} fmt={fmt} /> : <p className="py-1 text-sm text-faint">None recorded</p>}
        <Total
          label="Net profit"
          value={fmt(pl.netProfit)}
          sub={`${pl.netMarginPct}%`}
          tone={pl.netProfit >= 0 ? 'text-good' : 'text-bad'}
        />
      </div>
    </Card>
  );
}

function BalanceSheet({ bs, fmt, compact }) {
  return (
    <Card className="p-4">
      <SectionTitle>Balance sheet</SectionTitle>
      {!compact && (
        <p className="mb-3 text-xs text-muted">
          What the business owns, what it owes, and the difference — which is what it is worth to you.
        </p>
      )}

      <div className="space-y-0.5">
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-faint">Assets</p>
        <Rows rows={bs.assets} fmt={fmt} />
        <Total label="Total assets" value={fmt(bs.totalAssets)} />

        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-faint">Liabilities</p>
        {bs.liabilities.length ? (
          <Rows rows={bs.liabilities} fmt={fmt} />
        ) : (
          <p className="py-1 text-sm text-faint">You owe nobody</p>
        )}
        <Total label="Total liabilities" value={fmt(bs.totalLiabilities)} />

        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-faint">Equity</p>
        <Rows rows={bs.equity} fmt={fmt} />
        <div className="flex justify-between gap-4 py-1 text-sm">
          <span className="text-muted">Profit earned to date</span>
          <span className="tnum">{fmt(bs.earnings)}</span>
        </div>
        <Total label="Total equity" value={fmt(bs.totalEquity)} />
      </div>

      <div
        className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${
          bs.balanced ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad'
        }`}
      >
        {bs.balanced
          ? 'Assets = liabilities + equity ✓'
          : `Out of balance by ${fmt(bs.difference)} — rebuild the ledger`}
      </div>
    </Card>
  );
}

function TrialBalance({ tb, fmt }) {
  return (
    <Card>
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">Trial balance</h2>
        <p className="text-xs text-muted">Every account. If the two columns disagree, nothing else can be trusted.</p>
      </div>

      {tb.rows.length === 0 ? (
        <EmptyState title="Nothing posted yet" hint="Record a sale or an expense and it will appear here." />
      ) : (
        <div className="table-scroll">
          <table className="w-full min-w-[30rem]">
            <thead>
              <tr className="border-b border-line">
                <th className="th">Code</th>
                <th className="th">Account</th>
                <th className="th text-right">Debit</th>
                <th className="th text-right">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tb.rows.map((r) => (
                <tr key={r.code}>
                  <td className="td tnum text-faint">{r.code}</td>
                  <td className="td">{r.name}</td>
                  <td className="td tnum text-right">{r.debit ? fmt(r.debit) : ''}</td>
                  <td className="td tnum text-right">{r.credit ? fmt(r.credit) : ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line font-bold">
                <td className="td" colSpan={2}>
                  Total
                </td>
                <td className="td tnum text-right">{fmt(tb.totalDebit)}</td>
                <td className="td tnum text-right">{fmt(tb.totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div
        className={`m-4 rounded-lg px-3 py-2 text-sm font-semibold ${
          tb.balanced ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad'
        }`}
      >
        {tb.balanced ? 'Debits equal credits ✓' : `Out of balance by ${fmt(tb.difference)}`}
      </div>
    </Card>
  );
}

function Journal({ data, fmt }) {
  return (
    <Card>
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">Journal</h2>
        <p className="text-xs text-muted">Every entry, and the transaction it came from.</p>
      </div>

      {data.entries.length === 0 ? (
        <EmptyState title="No entries in this period" />
      ) : (
        <ul className="divide-y divide-line">
          {data.entries.map((e) => (
            <li key={e._id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{e.memo}</p>
                  <p className="text-xs text-faint">
                    {e.entryNumber} · {new Date(e.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {e.sourceType ? ` · ${e.sourceType}` : ''}
                    {e.manual ? ' · manual' : ''}
                  </p>
                </div>
                <span className="tnum shrink-0 text-sm font-semibold">{fmt(e.total)}</span>
              </div>
              <div className="mt-1.5 space-y-0.5">
                {e.lines.map((l, i) => (
                  <div key={i} className="flex justify-between gap-3 text-xs">
                    <span className={l.credit ? 'pl-6 text-muted' : 'text-muted'}>
                      <span className="mr-1.5 text-faint">{l.code}</span>
                      {l.name}
                    </span>
                    <span className="tnum shrink-0">
                      {l.debit ? `Dr ${fmt(l.debit)}` : `Cr ${fmt(l.credit)}`}
                    </span>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Total({ label, value, sub, tone = '' }) {
  return (
    <div className={`mt-1 flex justify-between gap-4 border-t border-line pt-1.5 text-sm font-bold ${tone}`}>
      <span>
        {label}
        {sub ? <span className="ml-1.5 font-normal text-faint">{sub}</span> : null}
      </span>
      <span className="tnum">{value}</span>
    </div>
  );
}
