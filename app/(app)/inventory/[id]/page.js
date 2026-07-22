'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiGet, apiPatch } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import MovementModal from '@/components/MovementModal';
import { Card, Chip, Field, Loading, Modal, MoneyInput, SectionTitle, StatTile } from '@/components/ui';

export default function MaterialDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { fmt, isOwner, toast } = useApp();

  const [data, setData] = useState(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(() => {
    apiGet(`/api/materials/${id}`).then(setData).catch(() => setData(null));
  }, [id]);

  useEffect(load, [load]);

  if (!data) return <Loading />;
  const { material, movements } = data;
  const low = material.reorderLevel > 0 && material.quantity <= material.reorderLevel;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => router.back()} className="btn-ghost btn-sm">
          ← Back
        </button>
        <div className="flex-1" />
        {isOwner && (
          <button onClick={() => setEditOpen(true)} className="btn-secondary btn-sm">
            Edit
          </button>
        )}
        <button onClick={() => setMoveOpen(true)} className="btn-primary btn-sm">
          Record movement
        </button>
      </div>

      <Card className="p-5">
        <h1 className="text-xl font-bold">{material.name}</h1>
        <p className="text-sm text-muted">
          {[material.category, material.size, material.gsm && `${material.gsm}gsm`, material.colour, material.finish]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {low ? (
          <div className="mt-3">
            <Chip tone="bad">Reorder now</Chip>
            {material.supplier ? (
              <span className="ml-2 text-sm text-muted">
                {material.supplier.name}
                {material.supplier.phone ? ` · ${material.supplier.phone}` : ''} · about{' '}
                {material.supplier.leadTimeDays} day(s) to arrive
              </span>
            ) : null}
          </div>
        ) : null}
      </Card>

      <div className={`grid gap-3 ${isOwner ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2'}`}>
        <StatTile label="In stock" value={`${material.quantity} ${material.unit}`} tone={low ? 'bad' : 'default'} />
        <StatTile label="Reorder level" value={material.reorderLevel || '—'} />
        {isOwner && <StatTile label="Cost per unit" value={fmt(material.unitCost)} />}
        {isOwner && <StatTile label="Stock value" value={fmt(material.quantity * material.unitCost, { decimals: false })} />}
      </div>

      {material.shelfLocation ? (
        <Card className="p-4">
          <p className="text-sm text-muted">
            Kept on shelf <span className="font-semibold text-ink">{material.shelfLocation}</span>
          </p>
        </Card>
      ) : null}

      <Card>
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Movement history</h2>
        </div>
        {movements.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">No movements recorded yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {movements.map((m) => (
              <li key={m._id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium capitalize">{m.type.replace('_', ' ')}</p>
                  <p className="truncate text-xs text-muted">
                    {new Date(m.createdAt).toLocaleString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    · {m.userName}
                    {m.jobNumber ? ` · ${m.jobNumber}` : ''}
                  </p>
                  {m.reason ? <p className="truncate text-xs text-faint">{m.reason}</p> : null}
                </div>
                <div className="shrink-0 text-right">
                  <p className={`tnum font-semibold ${m.delta < 0 ? 'text-bad' : 'text-good'}`}>
                    {m.delta > 0 ? '+' : ''}
                    {m.delta}
                  </p>
                  <p className="tnum text-xs text-faint">→ {m.balanceAfter}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {moveOpen && (
        <MovementModal
          material={material}
          onClose={() => setMoveOpen(false)}
          onSaved={() => {
            setMoveOpen(false);
            load();
          }}
        />
      )}

      <EditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        material={material}
        onSaved={() => {
          setEditOpen(false);
          toast('Stock item updated');
          load();
        }}
      />
    </div>
  );
}

function EditModal({ open, onClose, material, onSaved }) {
  const [form, setForm] = useState(material);
  const [busy, setBusy] = useState(false);

  useEffect(() => setForm(material), [material, open]);

  async function save() {
    setBusy(true);
    try {
      await apiPatch(`/api/materials/${material._id}`, {
        name: form.name,
        size: form.size,
        gsm: form.gsm,
        colour: form.colour,
        finish: form.finish,
        shelfLocation: form.shelfLocation,
        reorderLevel: form.reorderLevel,
        unitCost: form.unitCost,
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
      title="Edit stock item"
      footer={
        <button onClick={save} disabled={busy} className="btn-primary w-full">
          Save
        </button>
      }
    >
      <div className="space-y-3">
        <p className="rounded-lg bg-page px-3 py-2 text-xs text-muted">
          Quantity is not editable here — it only moves through a logged movement, so the log always adds up to the
          balance. Use “Stock count correction” if the physical count differs.
        </p>
        <Field label="Name">
          <input className="field" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Size">
            <input className="field" value={form.size || ''} onChange={(e) => setForm({ ...form, size: e.target.value })} />
          </Field>
          <Field label="GSM">
            <input
              className="field tnum"
              inputMode="numeric"
              value={form.gsm || ''}
              onChange={(e) => setForm({ ...form, gsm: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
          <Field label="Colour">
            <input className="field" value={form.colour || ''} onChange={(e) => setForm({ ...form, colour: e.target.value })} />
          </Field>
          <Field label="Finish">
            <input className="field" value={form.finish || ''} onChange={(e) => setForm({ ...form, finish: e.target.value })} />
          </Field>
          <Field label="Reorder level">
            <input
              className="field tnum"
              inputMode="decimal"
              value={form.reorderLevel ?? ''}
              onChange={(e) => setForm({ ...form, reorderLevel: e.target.value.replace(/[^\d.]/g, '') })}
            />
          </Field>
          <Field label="Shelf">
            <input
              className="field"
              value={form.shelfLocation || ''}
              onChange={(e) => setForm({ ...form, shelfLocation: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Cost price per unit">
          <MoneyInput value={form.unitCost ?? ''} onChange={(unitCost) => setForm({ ...form, unitCost })} />
        </Field>
      </div>
    </Modal>
  );
}
