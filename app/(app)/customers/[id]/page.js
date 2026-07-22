'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiGet, apiPatch } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import {
  Card,
  Chip,
  Field,
  Loading,
  Modal,
  PAY_STATUS_META,
  SectionTitle,
  StatTile,
  StatusChip,
} from '@/components/ui';

export default function CustomerDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { fmt, toast } = useApp();
  const [data, setData] = useState(null);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(() => {
    apiGet(`/api/customers/${id}`).then(setData).catch(() => setData(null));
  }, [id]);

  useEffect(load, [load]);

  if (!data) return <Loading />;
  const { customer, jobs, sales } = data;

  const waLink = customer.phone
    ? `https://wa.me/${normalise(customer.phone)}`
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => router.back()} className="btn-ghost btn-sm">
          ← Back
        </button>
        <div className="flex-1" />
        <button onClick={() => setEditOpen(true)} className="btn-secondary btn-sm">
          Edit
        </button>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold">
              {customer.name}
              {customer.isRepeat ? <Chip tone="brand">Repeat customer</Chip> : null}
            </h1>
            <p className="text-sm text-muted">{customer.phone || 'No phone number'}</p>
            {customer.company ? <p className="text-sm text-muted">{customer.company}</p> : null}
          </div>
          <div className="flex gap-2">
            {customer.phone ? (
              <a href={`tel:${customer.phone}`} className="btn-secondary btn-sm">
                Call
              </a>
            ) : null}
            {waLink ? (
              <a href={waLink} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
                WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Jobs" value={customer.jobCount} />
        <StatTile label="Total billed" value={fmt(customer.totalBilled, { decimals: false })} />
        <StatTile
          label="Owing"
          value={fmt(customer.outstanding, { decimals: false })}
          tone={customer.outstanding > 0 ? 'bad' : 'good'}
        />
      </div>

      <Card>
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Jobs</h2>
        </div>
        {jobs.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">No jobs yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {jobs.map((j) => (
              <li key={j._id}>
                <Link href={`/jobs/${j._id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-page">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{j.jobType}</p>
                    <p className="truncate text-xs text-muted">
                      {j.jobNumber} · {new Date(j.createdAt).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="tnum text-sm font-semibold">{fmt(j.price - (j.discount || 0))}</span>
                    <StatusChip status={j.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Invoices</h2>
        </div>
        {sales.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">No invoices yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {sales.map((s) => (
              <li key={s._id}>
                <Link href={`/sales/${s._id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-page">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.invoiceNumber}</p>
                    <p className="truncate text-xs text-muted">{new Date(s.createdAt).toLocaleDateString('en-GB')}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tnum text-sm font-semibold">{fmt(s.total)}</p>
                    <StatusChip status={s.status} map={PAY_STATUS_META} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <EditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        customer={customer}
        onSaved={() => {
          setEditOpen(false);
          toast('Customer updated');
          load();
        }}
      />
    </div>
  );
}

function EditModal({ open, onClose, customer, onSaved }) {
  const [form, setForm] = useState(customer);
  const [busy, setBusy] = useState(false);

  useEffect(() => setForm(customer), [customer, open]);

  async function save() {
    setBusy(true);
    try {
      await apiPatch(`/api/customers/${customer._id}`, {
        name: form.name,
        phone: form.phone,
        email: form.email,
        company: form.company,
        address: form.address,
        notes: form.notes,
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit customer"
      footer={
        <button onClick={save} disabled={busy} className="btn-primary w-full">
          Save
        </button>
      }
    >
      <div className="space-y-3">
        {['name', 'phone', 'company', 'email', 'address'].map((f) => (
          <Field key={f} label={f[0].toUpperCase() + f.slice(1)}>
            <input className="field" value={form[f] || ''} onChange={(e) => setForm({ ...form, [f]: e.target.value })} />
          </Field>
        ))}
        <Field label="Notes">
          <textarea
            className="field"
            rows={2}
            value={form.notes || ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>
      </div>
    </Modal>
  );
}

function normalise(phone) {
  const d = String(phone).replace(/\D/g, '');
  if (d.startsWith('234')) return d;
  if (d.startsWith('0')) return '234' + d.slice(1);
  return d;
}
