'use client';

import { useEffect, useState } from 'react';
import { apiPost } from '@/lib/client';
import { useApp } from './AppProvider';
import { ErrorNote, Field, Modal, Spinner } from './ui';

const MOVEMENT_OPTIONS = [
  { value: 'in', label: 'Stock in (delivery)' },
  { value: 'wastage', label: 'Wastage / misprint' },
  { value: 'damage', label: 'Damaged' },
  { value: 'return', label: 'Returned to stock' },
  { value: 'adjustment', label: 'Stock count correction' },
];

/**
 * Record a stock movement by hand.
 *
 * Any signed-in user can log wastage. A cashier who has to fetch the owner to
 * report a misprint will simply not report it, and misprints are exactly the
 * leak the owner wants to see.
 */
export default function MovementModal({ material, onClose, onSaved }) {
  const { toast } = useApp();
  const [type, setType] = useState('in');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (material) {
      setType('in');
      setQuantity('');
      setReason('');
      setError('');
    }
  }, [material]);

  if (!material) return null;

  const needsReason = type === 'wastage' || type === 'damage';

  async function save() {
    setBusy(true);
    setError('');
    try {
      await apiPost('/api/movements', {
        materialId: material._id,
        type,
        quantity: Number(quantity) || 0,
        reason,
      });
      toast('Movement recorded');
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
      title={material.name}
      footer={
        <button onClick={save} disabled={busy} className="btn-primary w-full">
          {busy ? <Spinner /> : null}
          Record movement
        </button>
      }
    >
      <div className="space-y-3">
        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <p className="rounded-lg bg-page px-3 py-2 text-sm">
          Currently <span className="tnum font-bold">{material.quantity}</span> {material.unit} in stock
        </p>

        <Field label="What happened?">
          <select className="field" value={type} onChange={(e) => setType(e.target.value)}>
            {MOVEMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label={type === 'adjustment' ? `Actual counted quantity (${material.unit})` : `Quantity (${material.unit})`}
          hint={
            type === 'adjustment'
              ? 'Enter what you physically counted — the difference is worked out and logged for you.'
              : undefined
          }
        >
          <input
            className="field tnum text-center text-lg font-semibold"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value.replace(/[^\d.]/g, ''))}
            autoFocus
          />
        </Field>

        <Field
          label="Reason"
          hint={needsReason ? 'Required — wastage costs real money, so it must be explained' : 'Optional'}
        >
          <input
            className="field"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={needsReason ? 'e.g. wrong colour profile, had to reprint' : 'e.g. delivery from supplier'}
          />
        </Field>
      </div>
    </Modal>
  );
}
