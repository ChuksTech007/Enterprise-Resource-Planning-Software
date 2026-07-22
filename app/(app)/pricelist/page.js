'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import { Card, EmptyState, ErrorNote, Field, Loading, Modal, MoneyInput, Spinner } from '@/components/ui';

/**
 * Preset prices for standard work.
 *
 * The point is consistency: two cashiers quoting the same job on the same day
 * should give the same number. Cashiers can read the list; only the owner can
 * change a price.
 */
export default function PriceListPage() {
  const { fmt, isOwner, toast } = useApp();
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    apiGet('/api/pricelist').then(setData).catch(() => setData({ items: [] }));
  }, []);

  useEffect(load, [load]);

  if (!data) return <Loading />;

  const grouped = data.items.reduce((acc, i) => {
    (acc[i.jobType] ||= []).push(i);
    return acc;
  }, {});

  async function remove(item) {
    if (!confirm(`Remove "${item.name}" from the price list?`)) return;
    await apiDelete(`/api/pricelist/${item._id}`);
    toast('Removed');
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Price list</h1>
        {isOwner && (
          <button onClick={() => setEditing({})} className="btn-primary btn-sm">
            Add price
          </button>
        )}
      </div>

      <p className="text-sm text-muted">
        These appear as tap-to-add buttons on the sale and job screens, so quotes stay consistent.
      </p>

      {data.items.length === 0 ? (
        <Card>
          <EmptyState
            title="No prices set yet"
            hint={
              isOwner
                ? 'Add your standard jobs — 100 complimentary cards, a 3x2ft banner — so staff quote the same price every time.'
                : 'The owner has not set up the price list yet.'
            }
            action={isOwner ? <button onClick={() => setEditing({})} className="btn-primary btn-sm">Add price</button> : null}
          />
        </Card>
      ) : (
        Object.entries(grouped).map(([type, items]) => (
          <Card key={type}>
            <div className="border-b border-line px-4 py-2.5">
              <h2 className="text-sm font-semibold">{type}</h2>
            </div>
            <ul className="divide-y divide-line">
              {items.map((i) => (
                <li key={i._id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{i.name}</p>
                    <p className="truncate text-xs text-muted">
                      {i.unitLabel}
                      {i.minQuantity > 1 ? ` · minimum ${i.minQuantity}` : ''}
                      {isOwner && i.estimatedCost > 0 ? ` · costs about ${fmt(i.estimatedCost)}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="tnum font-bold">{fmt(i.price)}</span>
                    {isOwner && (
                      <>
                        <button onClick={() => setEditing(i)} className="btn-ghost btn-sm">
                          Edit
                        </button>
                        <button onClick={() => remove(i)} className="btn-ghost btn-sm text-bad">
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}

      {editing && (
        <PriceModal
          item={editing}
          jobTypes={data.jobTypes}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast('Price saved');
            load();
          }}
        />
      )}
    </div>
  );
}

function PriceModal({ item, jobTypes, onClose, onSaved }) {
  const [form, setForm] = useState({ unitLabel: 'per unit', jobType: 'Other', minQuantity: 1, ...item });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setBusy(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        jobType: form.jobType,
        unitLabel: form.unitLabel,
        price: Number(form.price) || 0,
        estimatedCost: Number(form.estimatedCost) || 0,
        minQuantity: Number(form.minQuantity) || 1,
      };
      if (item._id) await apiPatch(`/api/pricelist/${item._id}`, payload);
      else await apiPost('/api/pricelist', payload, { queue: false });
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
      title={item._id ? 'Edit price' : 'Add a price'}
      footer={
        <button onClick={save} disabled={busy} className="btn-primary w-full">
          {busy ? <Spinner /> : null}
          Save
        </button>
      }
    >
      <div className="space-y-3">
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <Field label="Name" hint="What staff will see on the button">
          <input
            className="field"
            value={form.name || ''}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="e.g. 100 complimentary cards"
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Job type">
            <select className="field" value={form.jobType} onChange={(e) => set({ jobType: e.target.value })}>
              {jobTypes?.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Priced">
            <input
              className="field"
              value={form.unitLabel || ''}
              onChange={(e) => set({ unitLabel: e.target.value })}
              placeholder="per 100, per sqm…"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price">
            <MoneyInput value={form.price ?? ''} onChange={(price) => set({ price })} />
          </Field>
          <Field label="Your cost" hint="Only you see this. Feeds the profit estimate.">
            <MoneyInput value={form.estimatedCost ?? ''} onChange={(estimatedCost) => set({ estimatedCost })} />
          </Field>
        </div>
        <Field label="Default quantity" hint="How many get added when a cashier taps this">
          <input
            className="field tnum"
            inputMode="numeric"
            value={form.minQuantity ?? 1}
            onChange={(e) => set({ minQuantity: e.target.value.replace(/\D/g, '') })}
          />
        </Field>
      </div>
    </Modal>
  );
}
