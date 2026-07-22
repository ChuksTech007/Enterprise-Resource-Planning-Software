'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import MethodBreakdown from '@/components/MethodBreakdown';
import { Card, ErrorNote, Field, Loading, MoneyInput, SectionTitle, Spinner, StatTile } from '@/components/ui';

/**
 * End-of-day cash reconciliation.
 *
 * The shape of this screen is the point: the cashier enters what is physically
 * in the drawer BEFORE seeing what the system expects. Showing the expected
 * figure first turns a count into a copy, and a shortfall would never surface.
 */
export default function RegisterPage() {
  const { fmt, refresh, toast, isOwner } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    apiGet('/api/register')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  if (error) return <Card className="p-6 text-center text-bad">{error}</Card>;
  if (!data) return <Loading />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Cash-up</h1>

      {data.open ? (
        <OpenTill data={data} fmt={fmt} onClosed={() => { load(); refresh(); toast('Till closed'); }} />
      ) : (
        <OpenTillForm onOpened={() => { load(); refresh(); toast('Till opened'); }} />
      )}

      <Card>
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{isOwner ? 'All closed shifts' : 'Your past shifts'}</h2>
        </div>
        {data.history.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">No shifts closed yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.history.map((s) => (
              <li key={s._id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{s.userName}</p>
                    <p className="text-xs text-muted">
                      {new Date(s.closedAt).toLocaleString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      · {s.salesCount} payment(s)
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tnum text-sm">
                      counted <span className="font-semibold">{fmt(s.countedCash)}</span>
                    </p>
                    <p
                      className={`tnum text-xs font-semibold ${
                        s.variance === 0 ? 'text-good' : s.variance < 0 ? 'text-bad' : 'text-warn'
                      }`}
                    >
                      {s.variance === 0
                        ? 'Balanced'
                        : `${s.variance < 0 ? 'Short' : 'Over'} ${fmt(Math.abs(s.variance))}`}
                    </p>
                  </div>
                </div>
                {s.notes ? <p className="mt-1 text-xs text-muted">“{s.notes}”</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function OpenTillForm({ onOpened }) {
  const [float, setFloat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function open() {
    setBusy(true);
    setError('');
    try {
      await apiPost('/api/register', { openingFloat: Number(float) || 0 }, { queue: false });
      onOpened();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <SectionTitle>Open your till</SectionTitle>
      <p className="mb-4 text-sm text-muted">
        Count the cash you are starting with and enter it. You cannot take cash payments until the till is open — that
        is what makes the end-of-day count mean something.
      </p>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Field label="Opening cash (float)" className="mt-3">
        <MoneyInput value={float} onChange={setFloat} />
      </Field>
      <button onClick={open} disabled={busy} className="btn-primary mt-4 w-full">
        {busy ? <Spinner /> : null}
        Open till
      </button>
    </Card>
  );
}

function OpenTill({ data, fmt, onClosed }) {
  const { open, live } = data;
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const countedNum = Number(counted) || 0;
  const variance = revealed ? Math.round((countedNum - live.expectedCash) * 100) / 100 : null;

  async function close() {
    setBusy(true);
    setError('');
    try {
      await apiPut('/api/register', { countedCash: countedNum, notes });
      onClosed();
    } catch (e) {
      setError(e.message);
      // A shortfall needs a note; reveal the numbers so they can explain it.
      setRevealed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Till opened"
          value={new Date(open.openedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          sub={`Float ${fmt(open.openingFloat)}`}
        />
        <StatTile
          label="Payments taken"
          value={live.salesCount}
          sub={live.totals.cashOut > 0 ? `${fmt(live.totals.cashOut, { decimals: false })} paid out of till` : undefined}
        />
        <StatTile label="Non-cash today" value={fmt(live.totals.transfer + live.totals.pos + live.totals.online, { decimals: false })} sub="Transfer, POS, online" />
        <StatTile label="Refunds" value={fmt(live.totals.refunds, { decimals: false })} tone={live.totals.refunds > 0 ? 'warn' : 'default'} />
      </div>

      <MethodBreakdown byMethod={live.totals} fmt={fmt} title="This shift, by method" />

      <Card className="p-5">
        <SectionTitle>Close the till</SectionTitle>
        <p className="mb-4 text-sm text-muted">
          Count the physical cash in the drawer — including the float you started with — and enter the total.
        </p>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <Field label="Cash counted in the drawer" className="mt-3">
          <MoneyInput value={counted} onChange={setCounted} />
        </Field>

        {!revealed ? (
          <button
            onClick={() => setRevealed(true)}
            disabled={!counted}
            className="btn-secondary mt-3 w-full"
          >
            Check against the system
          </button>
        ) : (
          <div className="mt-4 space-y-2 rounded-lg bg-page p-4 text-sm">
            <Row label="Opening float" value={fmt(open.openingFloat)} />
            <Row label="Cash taken this shift" value={fmt(live.totals.cash)} />
            {live.totals.cashOut > 0 ? (
              <Row label="less cash paid out (expenses)" value={`− ${fmt(live.totals.cashOut)}`} />
            ) : null}
            <div className="border-t border-line pt-2">
              <Row label="Should be in drawer" value={fmt(live.expectedCash)} bold />
            </div>
            <Row label="You counted" value={fmt(countedNum)} />
            <div
              className={`mt-2 rounded-lg px-3 py-2 font-bold ${
                variance === 0 ? 'bg-good-soft text-good' : variance < 0 ? 'bg-bad-soft text-bad' : 'bg-warn-soft text-warn'
              }`}
            >
              <div className="flex justify-between">
                <span>{variance === 0 ? 'Balanced' : variance < 0 ? 'Short by' : 'Over by'}</span>
                <span className="tnum">{variance === 0 ? '✓' : fmt(Math.abs(variance))}</span>
              </div>
            </div>
          </div>
        )}

        {revealed && (
          <>
            <Field
              label="Notes"
              className="mt-3"
              hint={
                variance !== 0
                  ? 'Required — explain the difference before closing.'
                  : 'Optional'
              }
            >
              <textarea
                className="field"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={variance !== 0 ? 'e.g. gave ₦500 change from own pocket, customer returned later' : ''}
              />
            </Field>

            <button onClick={close} disabled={busy} className="btn-primary mt-4 w-full">
              {busy ? <Spinner /> : null}
              Close till
            </button>
          </>
        )}
      </Card>
    </>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className="flex justify-between gap-4">
      <span className={bold ? 'font-semibold' : 'text-muted'}>{label}</span>
      <span className={`tnum ${bold ? 'font-bold' : ''}`}>{value}</span>
    </div>
  );
}
