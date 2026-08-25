'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, apiPatch } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import DataTable from '@/components/DataTable';
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

  const columns = [
    {
      key: 'name',
      label: 'Supplier',
      render: (s) => <span className="block max-w-[14rem] truncate font-semibold">{s.name}</span>,
    },
    {
      key: 'phone',
      label: 'Phone',
      render: (s) => s.phone || <span className="text-faint">—</span>,
    },
    {
      key: 'leadTimeDays',
      label: 'Lead time',
      align: 'right',
      tnum: true,
      hideOn: 'sm',
      /* How long they take to deliver is what decides whether "order now"
       * is soon enough, so it sits beside what is running out. */
      render: (s) => s.leadTimeDays + 'd',
    },
    {
      key: 'lowItems',
      label: 'Order from them',
      /* The reason to open this screen at all: which supplier to ring
       * today. Named items rather than a count, because the call is about
       * particular things. */
      render: (s) =>
        s.lowItems?.length ? (
          <span className="block max-w-[20rem] truncate font-medium text-bad">
            {s.lowItems.length} low — {s.lowItems.map((m) => m.name).join(', ')}
          </span>
        ) : (
          <span className="text-faint">nothing low</span>
        ),
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (s) => (
        <span className="flex justify-end gap-1 whitespace-nowrap">
          {s.phone ? (
            <a href={`tel:${s.phone}`} className="btn-secondary btn-sm">
              Call
            </a>
          ) : null}
          <button onClick={() => setEditing(s)} className="btn-ghost btn-sm">
            Edit
          </button>
        </span>
      ),
    },
  ];

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
        <DataTable
          columns={columns}
          rows={suppliers}
          minWidth={820}
        />
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
