'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, apiPatch } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import { Card, Chip, EmptyState, ErrorNote, Field, Loading, Modal, Spinner } from '@/components/ui';

/**
 * Suppliers, and what each one currently owes you a delivery of.
 *
 * Lead time is the useful bit: paper that takes five days to arrive has to be
 * ordered five days before it runs out, not on the morning it does.
 */
export default function SuppliersPage() {
  const { toast } = useApp();
  const [suppliers, setSuppliers] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    apiGet('/api/suppliers').then((d) => setSuppliers(d.suppliers)).catch(() => setSuppliers([]));
  }, []);

  useEffect(load, [load]);

  if (!suppliers) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Suppliers</h1>
        <button onClick={() => setEditing({})} className="btn-primary btn-sm">
          Add supplier
        </button>
      </div>

      {suppliers.length === 0 ? (
        <Card>
          <EmptyState
            title="No suppliers yet"
            hint="Add who you buy paper and consumables from, with how long delivery usually takes."
            action={<button onClick={() => setEditing({})} className="btn-primary btn-sm">Add supplier</button>}
          />
        </Card>
      ) : (
        suppliers.map((s) => (
          <Card key={s._id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{s.name}</p>
                <p className="text-sm text-muted">
                  {s.phone || 'No phone'} · usually {s.leadTimeDays} day{s.leadTimeDays === 1 ? '' : 's'} to deliver
                </p>
                {s.address ? <p className="text-xs text-faint">{s.address}</p> : null}
              </div>
              <div className="flex shrink-0 gap-2">
                {s.phone ? (
                  <a href={`tel:${s.phone}`} className="btn-secondary btn-sm">
                    Call
                  </a>
                ) : null}
                <button onClick={() => setEditing(s)} className="btn-ghost btn-sm">
                  Edit
                </button>
              </div>
            </div>

            {s.lowItems?.length > 0 && (
              <div className="mt-3 rounded-lg bg-bad-soft p-3">
                <p className="mb-1.5 text-xs font-semibold text-bad">
                  Order from them now — {s.lowItems.length} item(s) at or below reorder level
                </p>
                <ul className="space-y-1">
                  {s.lowItems.map((m) => (
                    <li key={m._id} className="flex justify-between text-sm text-bad">
                      <span>{m.name}</span>
                      <span className="tnum">
                        {m.quantity} {m.unit} left
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        ))
      )}

      {editing && (
        <SupplierModal
          supplier={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast('Supplier saved');
            load();
          }}
        />
      )}
    </div>
  );
}

function SupplierModal({ supplier, onClose, onSaved }) {
  const [form, setForm] = useState({ leadTimeDays: 3, ...supplier });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setBusy(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        phone: form.phone,
        email: form.email,
        address: form.address,
        leadTimeDays: Number(form.leadTimeDays) || 0,
        notes: form.notes,
      };
      if (supplier._id) await apiPatch(`/api/suppliers/${supplier._id}`, payload);
      else await apiPost('/api/suppliers', payload, { queue: false });
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
      title={supplier._id ? 'Edit supplier' : 'Add a supplier'}
      footer={
        <button onClick={save} disabled={busy} className="btn-primary w-full">
          {busy ? <Spinner /> : null}
          Save
        </button>
      }
    >
      <div className="space-y-3">
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <Field label="Name">
          <input className="field" value={form.name || ''} onChange={(e) => set({ name: e.target.value })} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <input className="field" type="tel" value={form.phone || ''} onChange={(e) => set({ phone: e.target.value })} />
          </Field>
          <Field label="Delivery time (days)" hint="Order this many days early">
            <input
              className="field tnum"
              inputMode="numeric"
              value={form.leadTimeDays ?? ''}
              onChange={(e) => set({ leadTimeDays: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
        </div>
        <Field label="Email">
          <input className="field" value={form.email || ''} onChange={(e) => set({ email: e.target.value })} />
        </Field>
        <Field label="Address">
          <textarea className="field" rows={2} value={form.address || ''} onChange={(e) => set({ address: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
