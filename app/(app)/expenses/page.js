'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, apiDelete } from '@/lib/client';
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
  Segmented,
  Spinner,
  StatTile,
} from '@/components/ui';

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'lastmonth', label: 'Last month' },
];

/**
 * Running costs — the half of profit that stock tracking cannot see.
 *
 * Without this the reports show gross margin and call it profit, which in a
 * shop running a generator most of the day is badly optimistic.
 */
export default function ExpensesPage() {
  const { fmt, toast } = useApp();
  const [period, setPeriod] = useState('month');
  const [data, setData] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    setData(null);
    apiGet('/api/expenses', { period })
      .then(setData)
      .catch(() => setData({ expenses: [], byCategory: [], total: 0 }));
  }, [period]);

  useEffect(load, [load]);

  async function remove(expense) {
    if (!confirm(`Delete "${expense.description}"?`)) return;
    try {
      await apiDelete(`/api/expenses/${expense._id}`);
      toast('Expense deleted');
      load();
    } catch (e) {
      toast(e.message, 'bad');
    }
  }

  const expenseColumns = [
    {
      key: 'date',
      label: 'Date',
      render: (e) =>
        new Date(e.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    },
    {
      key: 'description',
      label: 'What for',
      render: (e) => <span className="block max-w-[20rem] truncate font-medium">{e.description}</span>,
    },
    { key: 'category', label: 'Category', hideOn: 'sm' },
    { key: 'recordedByName', label: 'Recorded by', hideOn: 'md' },
    {
      key: 'paidFromTill',
      label: 'From till',
      hideOn: 'sm',
      /* Money out of the drawer has to be visible here, because it is what
       * makes the till short at cash-up. */
      render: (e) => (e.paidFromTill ? <Chip tone="warn">Yes</Chip> : <span className="text-faint">—</span>),
    },
    {
      key: 'amount',
      label: 'Amount',
      align: 'right',
      tnum: true,
      render: (e) => <span className="font-semibold">{fmt(e.amount)}</span>,
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (e) => (
        <button onClick={() => remove(e)} className="btn-ghost btn-sm text-bad" title="Remove">
          ✕
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Expenses</h1>
        <button onClick={() => setAdding(true)} className="btn-primary btn-sm">
          Add expense
        </button>
      </div>

      <p className="text-sm text-muted">
        Diesel, rent, salaries, transport — everything it costs to run the place that is not paper and ink. These are
        subtracted from gross margin to give the net profit in your reports.
      </p>

      <Segmented options={PERIODS} value={period} onChange={setPeriod} />

      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              label={`Spent (${data.label || period})`}
              value={fmt(data.total, { decimals: false })}
              sub={`${data.expenses.length} entr${data.expenses.length === 1 ? 'y' : 'ies'}`}
              tone={data.total > 0 ? 'warn' : 'default'}
            />
            <StatTile
              label="Biggest cost"
              value={data.byCategory[0]?.category || '—'}
              sub={data.byCategory[0] ? fmt(data.byCategory[0].total) : 'Nothing recorded'}
            />
          </div>

          {data.byCategory.length > 0 && (
            <Card className="p-4">
              <SectionTitle>By category</SectionTitle>
              <ul className="space-y-2">
                {data.byCategory.map((c) => {
                  const share = data.total > 0 ? (c.total / data.total) * 100 : 0;
                  return (
                    <li key={c.category}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="text-muted">{c.category}</span>
                        <span className="tnum font-semibold">
                          {fmt(c.total)}
                          <span className="ml-1.5 font-normal text-faint">{share.toFixed(0)}%</span>
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-page">
                        <div className="h-full rounded-full bg-warn" style={{ width: `${share}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <Card>
            {data.expenses.length === 0 ? (
              <EmptyState
                title="Nothing recorded"
                hint="Start with the obvious ones — diesel, rent, salaries. Even a rough figure beats none."
                action={
                  <button onClick={() => setAdding(true)} className="btn-primary btn-sm">
                    Add expense
                  </button>
                }
              />
            ) : (
              <DataTable
                columns={expenseColumns}
                rows={data.expenses || []}
                minWidth={760}
                empty={<EmptyState title="Nothing spent in this period" />}
              />
            )}
          </Card>
        </>
      )}

      {adding && (
        <ExpenseModal
          categories={data?.categories}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            toast('Expense recorded');
            load();
          }}
        />
      )}
    </div>
  );
}

function ExpenseModal({ categories, onClose, onSaved }) {
  const { openRegister } = useApp();
  const [form, setForm] = useState({
    category: 'Diesel / Fuel',
    paymentMethod: 'cash',
    date: new Date().toISOString().slice(0, 10),
    paidFromTill: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setBusy(true);
    setError('');
    try {
      await apiPost('/api/expenses', {
        ...form,
        amount: Number(form.amount) || 0,
      });
      onSaved();
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
      title="Record an expense"
      footer={
        <button onClick={save} disabled={busy} className="btn-primary w-full">
          {busy ? <Spinner /> : null}
          Save expense
        </button>
      }
    >
      <div className="space-y-3">
        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <Field label="What was it for?">
          <input
            className="field"
            value={form.description || ''}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="e.g. 20 litres diesel for the generator"
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
          <Field label="Amount">
            <MoneyInput value={form.amount ?? ''} onChange={(amount) => set({ amount })} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input className="field" type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
          </Field>
          <Field label="Paid by">
            <select
              className="field"
              value={form.paymentMethod}
              onChange={(e) => set({ paymentMethod: e.target.value, paidFromTill: e.target.value === 'cash' && form.paidFromTill })}
            >
              <option value="cash">Cash</option>
              <option value="transfer">Bank transfer</option>
              <option value="pos">POS / Card</option>
              <option value="online">Online</option>
            </select>
          </Field>
        </div>

        {form.paymentMethod === 'cash' && (
          <label
            className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 ${
              openRegister ? 'bg-page' : 'bg-warn-soft'
            }`}
          >
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5"
              disabled={!openRegister}
              checked={form.paidFromTill}
              onChange={(e) => set({ paidFromTill: e.target.checked })}
            />
            <span className="text-sm">
              <span className="font-medium">This money came out of the till</span>
              <span className="block text-xs text-muted">
                {openRegister
                  ? 'The drawer will be expected to be lower by this amount at cash-up, so it does not show up as a shortfall.'
                  : 'Your till is not open, so this cannot be tied to a shift.'}
              </span>
            </span>
          </label>
        )}

        <Field label="Notes">
          <textarea className="field" rows={2} value={form.notes || ''} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
