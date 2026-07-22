'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import MovementModal from '@/components/MovementModal';
import {
  Card,
  Chip,
  EmptyState,
  ErrorNote,
  Field,
  Loading,
  Modal,
  MoneyInput,
  Spinner,
  StatTile,
} from '@/components/ui';

export default function InventoryPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Inventory />
    </Suspense>
  );
}

function Inventory() {
  const { fmt, isOwner } = useApp();
  const params = useSearchParams();

  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('all');
  const [lowOnly, setLowOnly] = useState(params.get('low') === '1');
  const [addOpen, setAddOpen] = useState(false);
  const [moveFor, setMoveFor] = useState(null);

  const load = useCallback(() => {
    apiGet('/api/materials', { q, category, low: lowOnly ? '1' : '' })
      .then(setData)
      .catch(() => setData({ materials: [], categories: [] }));
  }, [q, category, lowOnly]);

  useEffect(load, [load]);

  if (!data) return <Loading />;

  const totalValue = isOwner
    ? data.materials.reduce((s, m) => s + (m.quantity || 0) * (m.unitCost || 0), 0)
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Stock</h1>
        <div className="flex gap-2">
          <Link href="/inventory/movements" className="btn-secondary btn-sm">
            Movement log
          </Link>
          {isOwner && (
            <button onClick={() => setAddOpen(true)} className="btn-primary btn-sm">
              Add item
            </button>
          )}
        </div>
      </div>

      <div className={`grid gap-3 ${isOwner ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <StatTile label="Items tracked" value={data.materials.length} />
        <StatTile
          label="Need reordering"
          value={data.lowCount}
          tone={data.lowCount > 0 ? 'bad' : 'good'}
          sub={data.lowCount > 0 ? 'At or below reorder level' : 'All above reorder level'}
        />
        {isOwner && <StatTile label="Stock value" value={fmt(totalValue, { decimals: false })} />}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="field flex-1"
          placeholder="Search paper, size, colour or shelf"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="field sm:w-48" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">All categories</option>
          {data.categories?.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          onClick={() => setLowOnly((v) => !v)}
          className={lowOnly ? 'btn-primary sm:w-40' : 'btn-secondary sm:w-40'}
        >
          {lowOnly ? 'Showing low only' : 'Low stock only'}
        </button>
      </div>

      <Card>
        {data.materials.length === 0 ? (
          <EmptyState
            title="Nothing here"
            hint={isOwner ? 'Add your paper, inks and consumables to start tracking them.' : 'No stock items match.'}
            action={isOwner ? <button onClick={() => setAddOpen(true)} className="btn-primary btn-sm">Add item</button> : null}
          />
        ) : (
          <ul className="divide-y divide-line">
            {data.materials.map((m) => {
              const low = m.reorderLevel > 0 && m.quantity <= m.reorderLevel;
              return (
                <li key={m._id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/inventory/${m._id}`} className="truncate font-medium hover:text-brand">
                        {m.name}
                      </Link>
                      <p className="truncate text-xs text-muted">
                        {[m.category, m.size, m.gsm && `${m.gsm}gsm`, m.colour, m.finish].filter(Boolean).join(' · ')}
                      </p>
                      <p className="truncate text-xs text-faint">
                        {m.shelfLocation ? `Shelf ${m.shelfLocation}` : 'No shelf set'}
                        {m.supplier?.name ? ` · ${m.supplier.name} (${m.supplier.leadTimeDays}d lead)` : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`tnum font-bold ${low ? 'text-bad' : ''}`}>
                        {m.quantity} <span className="text-xs font-normal text-muted">{m.unit}</span>
                      </p>
                      {m.reorderLevel > 0 ? (
                        <p className="text-xs text-faint">reorder at {m.reorderLevel}</p>
                      ) : null}
                      {isOwner ? <p className="tnum text-xs text-faint">{fmt(m.unitCost)} each</p> : null}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    {low ? <Chip tone="bad">Reorder now</Chip> : null}
                    <div className="flex-1" />
                    <button onClick={() => setMoveFor(m)} className="btn-secondary btn-sm">
                      Record movement
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <AddMaterialModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        categories={data.categories}
        units={data.units}
        onSaved={() => {
          setAddOpen(false);
          load();
        }}
      />

      <MovementModal
        material={moveFor}
        onClose={() => setMoveFor(null)}
        onSaved={() => {
          setMoveFor(null);
          load();
        }}
      />
    </div>
  );
}

function AddMaterialModal({ open, onClose, categories, units, onSaved }) {
  const { toast } = useApp();
  const [suppliers, setSuppliers] = useState([]);
  const [form, setForm] = useState({ unit: 'sheets', category: 'Paper' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm({ unit: 'sheets', category: 'Paper' });
      setError('');
      apiGet('/api/suppliers').then((d) => setSuppliers(d.suppliers || [])).catch(() => {});
    }
  }, [open]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setBusy(true);
    setError('');
    try {
      await apiPost('/api/materials', form, { queue: false });
      toast('Stock item added');
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a stock item"
      footer={
        <button onClick={save} disabled={busy} className="btn-primary w-full">
          {busy ? <Spinner /> : null}
          Add item
        </button>
      }
    >
      <div className="space-y-3">
        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <Field label="Name">
          <input
            className="field"
            value={form.name || ''}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="e.g. Matte art paper"
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <select className="field" value={form.category} onChange={(e) => set({ category: e.target.value })}>
              {categories?.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Counted in">
            <select className="field" value={form.unit} onChange={(e) => set({ unit: e.target.value })}>
              {units?.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </Field>
          <Field label="Size">
            <input className="field" value={form.size || ''} onChange={(e) => set({ size: e.target.value })} placeholder="SRA3" />
          </Field>
          <Field label="GSM">
            <input
              className="field tnum"
              inputMode="numeric"
              value={form.gsm || ''}
              onChange={(e) => set({ gsm: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
          <Field label="Colour">
            <input className="field" value={form.colour || ''} onChange={(e) => set({ colour: e.target.value })} />
          </Field>
          <Field label="Finish">
            <input className="field" value={form.finish || ''} onChange={(e) => set({ finish: e.target.value })} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Opening quantity" hint="Recorded as a stock-in">
            <input
              className="field tnum"
              inputMode="decimal"
              value={form.quantity || ''}
              onChange={(e) => set({ quantity: e.target.value.replace(/[^\d.]/g, '') })}
            />
          </Field>
          <Field label="Reorder level" hint="Warn me below this">
            <input
              className="field tnum"
              inputMode="decimal"
              value={form.reorderLevel || ''}
              onChange={(e) => set({ reorderLevel: e.target.value.replace(/[^\d.]/g, '') })}
            />
          </Field>
        </div>

        <Field label="Cost price per unit" hint="Only you can see this — cashiers never do">
          <MoneyInput value={form.unitCost || ''} onChange={(unitCost) => set({ unitCost })} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Supplier">
            <select className="field" value={form.supplier || ''} onChange={(e) => set({ supplier: e.target.value })}>
              <option value="">None</option>
              {suppliers.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Shelf location">
            <input
              className="field"
              value={form.shelfLocation || ''}
              onChange={(e) => set({ shelfLocation: e.target.value })}
              placeholder="Rack B2"
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

