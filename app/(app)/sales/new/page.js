'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import CustomerPicker from '@/components/CustomerPicker';
import PaymentFields from '@/components/PaymentFields';
import { Card, ErrorNote, Field, Loading, MoneyInput, Modal, SectionTitle, Spinner } from '@/components/ui';

export default function NewSalePage() {
  const router = useRouter();
  const { fmt, toast, openRegister } = useApp();

  const [priceItems, setPriceItems] = useState(null);
  const [lines, setLines] = useState([]);
  const [customer, setCustomer] = useState({ customerId: null, customerName: '', customerPhone: '' });
  const [discount, setDiscount] = useState('');
  const [payment, setPayment] = useState({ method: 'cash', amount: '', reference: '' });
  const [takePayment, setTakePayment] = useState(true);
  const [customOpen, setCustomOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet('/api/pricelist')
      .then((d) => setPriceItems(d.items || []))
      .catch(() => setPriceItems([]));
  }, []);

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0),
    [lines]
  );
  const total = Math.max(0, subtotal - (Number(discount) || 0));

  // Default the payment to the full amount — most counter sales are paid in
  // full, so the common case needs no typing.
  useEffect(() => {
    if (takePayment) setPayment((p) => ({ ...p, amount: total > 0 ? String(total) : '' }));
  }, [total, takePayment]);

  function addPreset(item) {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.priceItemId === item._id);
      if (i >= 0) {
        const copy = [...ls];
        copy[i] = { ...copy[i], quantity: Number(copy[i].quantity || 0) + (item.minQuantity || 1) };
        return copy;
      }
      return [
        ...ls,
        {
          key: Math.random().toString(36).slice(2),
          priceItemId: item._id,
          description: item.name,
          jobType: item.jobType,
          quantity: item.minQuantity || 1,
          unitPrice: item.price,
        },
      ];
    });
  }

  function addCustom(line) {
    setLines((ls) => [...ls, { key: Math.random().toString(36).slice(2), ...line }]);
    setCustomOpen(false);
  }

  const update = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key) => setLines((ls) => ls.filter((l) => l.key !== key));

  async function submit() {
    setError('');
    if (!lines.length) return setError('Add at least one item.');
    if (takePayment && payment.method === 'cash' && !openRegister) {
      return setError('Open your till before taking cash. Go to Cash-up.');
    }

    setBusy(true);
    try {
      const res = await apiPost('/api/sales', {
        items: lines.map((l) => ({
          priceItemId: l.priceItemId,
          description: l.description,
          jobType: l.jobType,
          quantity: Number(l.quantity) || 0,
          unitPrice: Number(l.unitPrice) || 0,
        })),
        discount: Number(discount) || 0,
        customerId: customer.customerId,
        customerName: customer.customerName,
        customerPhone: customer.customerPhone,
        payment:
          takePayment && Number(payment.amount) > 0
            ? {
                amount: Number(payment.amount),
                method: payment.method,
                reference: payment.reference,
                tendered: Number(payment.tendered) || undefined,
              }
            : undefined,
      });

      if (res.queued) {
        toast('No network — sale saved on this device and will sync automatically.', 'warn');
        router.push('/sales');
        return;
      }

      toast('Sale recorded');
      router.push(`/sales/${res.sale._id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (priceItems === null) return <Loading />;

  const owed = total - (takePayment ? Number(payment.amount) || 0 : 0);

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">New sale</h1>
        <button onClick={() => router.back()} className="btn-ghost btn-sm">
          Cancel
        </button>
      </div>

      <p className="text-sm text-muted">
        For a printing job with specs and a deadline, use{' '}
        <a href="/jobs/new" className="font-semibold text-brand">
          New job
        </a>{' '}
        instead — that one tracks production and materials.
      </p>

      {/* ---------------- price list ---------------- */}
      <Card className="p-4">
        <SectionTitle
          action={
            <button onClick={() => setCustomOpen(true)} className="text-sm font-semibold text-brand">
              + Other item
            </button>
          }
        >
          Tap what they are buying
        </SectionTitle>

        {priceItems.length === 0 ? (
          <p className="py-3 text-sm text-muted">
            No price list yet. Use <span className="font-medium">+ Other item</span>, or ask the owner to set up the
            price list so quotes stay consistent.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {priceItems.map((p) => (
              <button
                key={p._id}
                onClick={() => addPreset(p)}
                className="rounded-lg border border-line p-3 text-left transition hover:border-brand hover:bg-brand-soft"
              >
                <p className="truncate text-sm font-semibold">{p.name}</p>
                <p className="truncate text-xs text-muted">{p.jobType}</p>
                <p className="tnum mt-1 text-sm font-bold text-brand">
                  {fmt(p.price)} <span className="text-xs font-normal text-faint">{p.unitLabel}</span>
                </p>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* ---------------- basket ---------------- */}
      <Card>
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">This sale</h2>
        </div>

        {lines.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">Nothing added yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {lines.map((l) => (
              <li key={l.key} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 flex-1 truncate font-medium">{l.description}</p>
                  <button onClick={() => remove(l.key)} className="btn-ghost btn-sm -mr-2 shrink-0 text-bad">
                    Remove
                  </button>
                </div>
                <div className="mt-2 flex items-end gap-2">
                  <Field label="Qty" className="w-24">
                    <input
                      className="field tnum text-center"
                      type="text"
                      inputMode="numeric"
                      value={l.quantity}
                      onChange={(e) => update(l.key, { quantity: e.target.value.replace(/[^\d.]/g, '') })}
                    />
                  </Field>
                  <span className="pb-3 text-muted">×</span>
                  <Field label="Unit price" className="flex-1">
                    <MoneyInput value={l.unitPrice} onChange={(unitPrice) => update(l.key, { unitPrice })} />
                  </Field>
                  <div className="pb-2.5 text-right">
                    <p className="tnum text-sm font-bold">
                      {fmt((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0))}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {lines.length > 0 && (
          <div className="space-y-2 border-t border-line px-4 py-3 text-sm">
            <div className="flex justify-between text-muted">
              <span>Subtotal</span>
              <span className="tnum">{fmt(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Discount</span>
              <div className="w-32">
                <MoneyInput value={discount} onChange={setDiscount} placeholder="0" />
              </div>
            </div>
            <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
              <span>Total</span>
              <span className="tnum">{fmt(total)}</span>
            </div>
          </div>
        )}
      </Card>

      {/* ---------------- customer ---------------- */}
      <Card className="p-4">
        <CustomerPicker value={customer} onChange={setCustomer} />
        {owed > 0 && !customer.customerName && (
          <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-xs font-medium text-warn">
            This sale will leave a balance owing. Add the customer's name and phone number, or you will not know who
            owes it.
          </p>
        )}
      </Card>

      {/* ---------------- payment ---------------- */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Payment</h2>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={takePayment}
              onChange={(e) => setTakePayment(e.target.checked)}
            />
            Taking money now
          </label>
        </div>

        {takePayment ? (
          <PaymentFields value={payment} onChange={setPayment} owed={total} fmt={fmt} />
        ) : (
          <p className="text-sm text-muted">
            The full {fmt(total)} will be recorded as owing. You can collect it later from “Who owes me”.
          </p>
        )}

        {takePayment && owed > 0.009 && (
          <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-sm font-semibold text-warn">
            Balance still owing: {fmt(owed)}
          </p>
        )}
      </Card>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {/* Sticky so the total and the save button are always in thumb reach. */}
      <div className="no-print sticky bottom-20 z-20 lg:bottom-4">
        <button onClick={submit} disabled={busy || !lines.length} className="btn-primary w-full shadow-lg">
          {busy ? <Spinner /> : null}
          {busy ? 'Saving…' : `Record sale · ${fmt(total)}`}
        </button>
      </div>

      <CustomItemModal open={customOpen} onClose={() => setCustomOpen(false)} onAdd={addCustom} />
    </div>
  );
}

function CustomItemModal({ open, onClose, onAdd }) {
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');

  function add() {
    if (!description.trim()) return;
    onAdd({ description: description.trim(), quantity: Number(quantity) || 1, unitPrice: Number(unitPrice) || 0 });
    setDescription('');
    setQuantity('1');
    setUnitPrice('');
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add another item"
      footer={
        <button onClick={add} className="btn-primary w-full">
          Add to sale
        </button>
      }
    >
      <div className="space-y-3">
        <Field label="What is it?">
          <input
            className="field"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Lamination of 20 documents"
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity">
            <input
              className="field tnum text-center"
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value.replace(/[^\d.]/g, ''))}
            />
          </Field>
          <Field label="Unit price">
            <MoneyInput value={unitPrice} onChange={setUnitPrice} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
