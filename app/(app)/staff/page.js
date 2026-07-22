'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, apiPatch } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import { Card, Chip, ErrorNote, Field, Loading, Modal, Spinner } from '@/components/ui';

export default function StaffPage() {
  const { toast, user } = useApp();
  const [users, setUsers] = useState(null);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    apiGet('/api/users').then((d) => setUsers(d.users)).catch(() => setUsers([]));
  }, []);

  useEffect(load, [load]);

  if (!users) return <Loading />;

  async function toggleActive(u) {
    try {
      await apiPatch(`/api/users/${u._id}`, { active: !u.active });
      toast(u.active ? 'Account disabled' : 'Account enabled');
      load();
    } catch (e) {
      toast(e.message, 'bad');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Staff</h1>
        <button onClick={() => setAdding(true)} className="btn-primary btn-sm">
          Add staff
        </button>
      </div>

      <Card className="p-4">
        <h2 className="text-sm font-semibold">What each role can do</h2>
        <dl className="mt-2 space-y-2 text-sm">
          <div>
            <dt className="font-medium">Owner</dt>
            <dd className="text-muted">
              Everything — cost prices, profit, reports, staff, cancelling jobs and refunds.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Cashier</dt>
            <dd className="text-muted">
              Records sales, takes payments, creates jobs and moves them along, logs stock movements. Cannot see cost
              prices or profit, cannot delete anything, cannot issue refunds.
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <ul className="divide-y divide-line">
          {users.map((u) => (
            <li key={u._id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate font-medium">
                  {u.name}
                  <Chip tone={u.role === 'owner' ? 'brand' : 'neutral'}>{u.role === 'owner' ? 'Owner' : 'Cashier'}</Chip>
                  {!u.active ? <Chip tone="bad">Disabled</Chip> : null}
                </p>
                <p className="truncate text-xs text-muted">
                  @{u.username}
                  {u.lastLoginAt
                    ? ` · last signed in ${new Date(u.lastLoginAt).toLocaleDateString('en-GB')}`
                    : ' · never signed in'}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button onClick={() => setEditing(u)} className="btn-ghost btn-sm">
                  Edit
                </button>
                {String(u._id) !== String(user?.id) && (
                  <button onClick={() => toggleActive(u)} className="btn-ghost btn-sm">
                    {u.active ? 'Disable' : 'Enable'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {(adding || editing) && (
        <StaffModal
          staff={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={() => {
            setAdding(false);
            setEditing(null);
            toast('Saved');
            load();
          }}
        />
      )}
    </div>
  );
}

function StaffModal({ staff, onClose, onSaved }) {
  const isEdit = !!staff;
  const [form, setForm] = useState({ role: 'cashier', ...(staff || {}), password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setBusy(true);
    setError('');
    try {
      if (isEdit) {
        const payload = { name: form.name, phone: form.phone, role: form.role };
        if (form.password) payload.password = form.password;
        await apiPatch(`/api/users/${staff._id}`, payload);
      } else {
        await apiPost(
          '/api/users',
          { name: form.name, username: form.username, password: form.password, role: form.role, phone: form.phone },
          { queue: false }
        );
      }
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
      title={isEdit ? `Edit ${staff.name}` : 'Add a staff member'}
      footer={
        <button onClick={save} disabled={busy} className="btn-primary w-full">
          {busy ? <Spinner /> : null}
          Save
        </button>
      }
    >
      <div className="space-y-3">
        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <Field label="Full name">
          <input className="field" value={form.name || ''} onChange={(e) => set({ name: e.target.value })} autoFocus />
        </Field>

        {!isEdit && (
          <Field label="Username" hint="What they type to sign in. Lowercase, no spaces.">
            <input
              className="field"
              value={form.username || ''}
              onChange={(e) => set({ username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') })}
              autoCapitalize="none"
            />
          </Field>
        )}

        <Field label="Phone">
          <input className="field" type="tel" value={form.phone || ''} onChange={(e) => set({ phone: e.target.value })} />
        </Field>

        <Field label="Role">
          <select className="field" value={form.role} onChange={(e) => set({ role: e.target.value })}>
            <option value="cashier">Cashier — sales and jobs only</option>
            <option value="owner">Owner — full access including profit</option>
          </select>
        </Field>

        <Field
          label={isEdit ? 'New password' : 'Password'}
          hint={isEdit ? 'Leave blank to keep the current password' : 'At least 6 characters'}
        >
          <input
            className="field"
            type="text"
            value={form.password || ''}
            onChange={(e) => set({ password: e.target.value })}
            autoComplete="new-password"
          />
        </Field>
      </div>
    </Modal>
  );
}
