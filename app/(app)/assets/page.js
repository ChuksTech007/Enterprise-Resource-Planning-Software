'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import DataTable from '@/components/DataTable';
import {
  Card,
  Chip,
  EmptyState,
  ErrorNote,
  Field,
  Loading,
  Modal,
  MoneyInput,
  SectionTitle,
  Spinner,
  StatTile,
} from '@/components/ui';

/**
 * The equipment register.
 *
 * Buying a press is not a cost — it swaps money for a machine worth the same.
 * The cost appears month by month as the machine wears out. Without this,
 * profit looks huge in the month you buy a press and falsely healthy for the
 * five years afterwards.
 */
export default function AssetsPage() {
  const { fmt, toast } = useApp();
  const [data, setData] = useState(null);
  const [runs, setRuns] = useState(null);
  const [adding, setAdding] = useState(false);
  const [depreciating, setDepreciating] = useState(false);

  const load = useCallback(() => {
    Promise.all([apiGet('/api/assets'), apiGet('/api/assets/depreciate')])
      .then(([a, d]) => {
        setData(a);
        setRuns(d);
      })
      .catch(() => setData({ assets: [], totals: {} }));
  }, []);

  useEffect(load, [load]);

  if (!data) return <Loading />;

  const assetColumns = [
    {
      key: 'name',
      label: 'Equipment',
      render: (a) => <span className="block max-w-[16rem] truncate font-medium">{a.name}</span>,
    },
    { key: 'category', label: 'Category', hideOn: 'sm' },
    {
      key: 'purchaseDate',
      label: 'Bought',
      hideOn: 'sm',
      render: (a) =>
        new Date(a.purchaseDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
    },
    {
      key: 'cost',
      label: 'Cost',
      align: 'right',
      tnum: true,
      hideOn: 'md',
      render: (a) => fmt(a.cost, { decimals: false }),
    },
    {
      key: 'bookValue',
      label: 'Worth now',
      align: 'right',
      tnum: true,
      render: (a) => <span className="font-semibold">{fmt(a.bookValue)}</span>,
    },
    {
      key: 'life',
      label: 'Life left',
      /* The bar earns its place: the figure alone does not say whether a
       * machine is nearly worn out, and that is what decides replacing it. */
      render: (a) => (
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-page">
            <span
              className={'block h-full rounded-full ' + (a.fullyDepreciated ? 'bg-faint' : 'bg-brand')}
              style={{ width: Math.min(100, Math.max(0, (a.bookValue / a.cost) * 100)) + '%' }}
            />
          </span>
          {a.fullyDepreciated ? <Chip tone="neutral">Written off</Chip> : null}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Equipment</h1>
        <button onClick={() => setAdding(true)} className="btn-primary btn-sm">
          Add equipment
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Cost when bought" value={fmt(data.totals.cost, { decimals: false })} />
        <StatTile label="Written off so far" value={fmt(data.totals.accumulated, { decimals: false })} />
        <StatTile label="Worth today" value={fmt(data.totals.bookValue, { decimals: false })} tone="brand" />
        <StatTile label="Monthly depreciation" value={fmt(data.totals.monthly, { decimals: false })} sub="Charged to profit" />
      </div>

      <Card className="p-4">
        <SectionTitle
          action={
            <button onClick={() => setDepreciating(true)} className="btn-primary btn-sm">
              Run depreciation
            </button>
          }
        >
          Monthly depreciation
        </SectionTitle>
        <p className="text-xs text-muted">
          Run this once a month. It writes down every machine and charges the amount to profit. Running it twice for the
          same month is refused, so you cannot depreciate the same machine twice.
        </p>

        {runs?.runs?.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {runs.runs.slice(0, 6).map((r) => (
              <li key={r.period} className="flex justify-between">
                <span className="text-muted">
                  {r.period} · {r.lines.length} item(s)
                </span>
                <span className="tnum font-medium">{fmt(r.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        {data.assets.length === 0 ? (
          <EmptyState
            title="No equipment recorded"
            hint="Add your presses, cutters, laminators and generator. Without them the balance sheet does not show what the business owns."
            action={
              <button onClick={() => setAdding(true)} className="btn-primary btn-sm">
                Add equipment
              </button>
            }
          />
        ) : (
          <DataTable
            columns={assetColumns}
            rows={data.assets || []}
            minWidth={860}
            empty={<EmptyState title="No equipment recorded" />}
          />
        )}
      </Card>

      {adding && (
        <AssetModal
          categories={data.categories}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            toast('Equipment added');
            load();
          }}
        />
      )}

      {depreciating && (
        <DepreciateModal
          suggested={runs?.suggestedPeriod}
          onClose={() => setDepreciating(false)}
          onDone={() => {
            setDepreciating(false);
            toast('Depreciation posted');
            load();
          }}
        />
      )}
    </div>
  );
}

function AssetModal({ categories, onClose, onSaved }) {
  const [form, setForm] = useState({
    category: 'Printing press',
    usefulLifeMonths: '60',
    paidBy: 'transfer',
    purchaseDate: new Date().toISOString().slice(0, 10),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setBusy(true);
    setError('');
    try {
      await apiPost(
        '/api/assets',
        {
          ...form,
          cost: Number(form.cost) || 0,
          residualValue: Number(form.residualValue) || 0,
          usefulLifeMonths: Number(form.usefulLifeMonths) || 60,
        },
        { queue: false }
      );
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const years = Math.round(((Number(form.usefulLifeMonths) || 0) / 12) * 10) / 10;

  return (
    <Modal
      open
      onClose={onClose}
      title="Add equipment"
      footer={
        <button onClick={save} disabled={busy} className="btn-primary w-full">
          {busy ? <Spinner /> : null}
          Add
        </button>
      }
    >
      <div className="space-y-3">
        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <Field label="What is it?">
          <input
            className="field"
            value={form.name || ''}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="e.g. Heidelberg GTO 52"
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <select className="field" value={form.category} onChange={(e) => set({ category: e.target.value })}>
              {(categories || []).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="What it cost">
            <MoneyInput value={form.cost ?? ''} onChange={(cost) => set({ cost })} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date bought">
            <input
              className="field"
              type="date"
              value={form.purchaseDate}
              onChange={(e) => set({ purchaseDate: e.target.value })}
            />
          </Field>
          <Field label="Paid by">
            <select className="field" value={form.paidBy} onChange={(e) => set({ paidBy: e.target.value })}>
              <option value="transfer">Bank transfer</option>
              <option value="cash">Cash</option>
              <option value="pos">POS / Card</option>
              <option value="online">Online</option>
            </select>
          </Field>
        </div>

        <Field label="How long will it last?" hint={`${years} year(s) — the cost is spread evenly over this`}>
          <select
            className="field"
            value={form.usefulLifeMonths}
            onChange={(e) => set({ usefulLifeMonths: e.target.value })}
          >
            <option value="36">3 years — computers, small tools</option>
            <option value="60">5 years — most machines</option>
            <option value="84">7 years — heavy presses</option>
            <option value="120">10 years — buildings, heavy plant</option>
          </select>
        </Field>

        <Field
          label="Value at the end"
          hint="What you could still sell it for once worn out. Leave at zero if unsure."
        >
          <MoneyInput value={form.residualValue ?? ''} onChange={(residualValue) => set({ residualValue })} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Serial number">
            <input className="field" value={form.serialNumber || ''} onChange={(e) => set({ serialNumber: e.target.value })} />
          </Field>
          <Field label="Where it is">
            <input className="field" value={form.location || ''} onChange={(e) => set({ location: e.target.value })} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function DepreciateModal({ suggested, onClose, onDone }) {
  const [period, setPeriod] = useState(suggested || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    setBusy(true);
    setError('');
    try {
      await apiPost('/api/assets/depreciate', { period }, { queue: false });
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Run monthly depreciation"
      footer={
        <button onClick={run} disabled={busy} className="btn-primary w-full">
          {busy ? <Spinner /> : null}
          Run for {period}
        </button>
      }
    >
      <div className="space-y-3">
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <p className="text-sm text-muted">
          This charges one month of wear on every machine to profit, and reduces what the equipment is worth on the
          balance sheet.
        </p>
        <Field label="Month" hint="Format: 2026-07">
          <input className="field tnum" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-07" />
        </Field>
      </div>
    </Modal>
  );
}
