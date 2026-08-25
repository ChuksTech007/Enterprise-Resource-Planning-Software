'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '@/lib/client';
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

const STATUS_META = {
  draft: { label: 'Draft', tone: 'neutral' },
  sent: { label: 'Ordered', tone: 'info' },
  part_received: { label: 'Part received', tone: 'warn' },
  received: { label: 'Received', tone: 'good' },
  cancelled: { label: 'Cancelled', tone: 'bad' },
};

const VIEWS = [
  { value: 'open', label: 'Outstanding' },
  { value: 'all', label: 'All' },
  { value: 'owing', label: 'Unpaid' },
];

/**
 * Purchase orders.
 *
 * This is what closes the loop on stock: before it existed, paper appeared on
 * the shelf from nowhere and the ledger had to credit the owner's capital for
 * it. Now a delivery creates both the stock and the debt to the supplier.
 */
export default function PurchasesPage() {
  const { fmt, toast } = useApp();
  const [view, setView] = useState('open');
  const [data, setData] = useState(null);
  const [creating, setCreating] = useState(false);
  const [openOrder, setOpenOrder] = useState(null);

  const load = useCallback(() => {
    setData(null);
    const q = { limit: 200 };
    if (view === 'open') q.open = '1';
    if (view === 'owing') q.owing = '1';
    apiGet('/api/purchase-orders', q)
      .then(setData)
      .catch(() => setData({ orders: [], totals: {} }));
  }, [view]);

  useEffect(load, [load]);

  const orderColumns = [
    { key: 'poNumber', label: 'Order', render: (o) => <span className="whitespace-nowrap">{o.poNumber}</span> },
    {
      key: 'supplierName',
      label: 'Supplier',
      render: (o) => <span className="block max-w-[14rem] truncate font-medium">{o.supplierName}</span>,
    },
    {
      key: 'createdAt',
      label: 'Raised',
      hideOn: 'sm',
      render: (o) => new Date(o.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    },
    {
      key: 'items',
      label: 'Items',
      align: 'right',
      tnum: true,
      hideOn: 'md',
      render: (o) => o.items.length,
    },
    {
      key: 'status',
      label: 'Status',
      render: (o) => {
        const meta = STATUS_META[o.status] || { label: o.status, tone: 'neutral' };
        return (
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <Chip tone={meta.tone}>{meta.label}</Chip>
            {o.expectedDate && o.status !== 'received' ? (
              <span className="text-xs text-faint">
                due {new Date(o.expectedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: 'total',
      label: 'Total',
      align: 'right',
      tnum: true,
      render: (o) => <span className="font-semibold">{fmt(o.total || o.subtotal)}</span>,
    },
    {
      key: 'balance',
      label: 'Unpaid',
      align: 'right',
      tnum: true,
      render: (o) =>
        o.balance > 0 ? (
          <span className="font-semibold text-bad">{fmt(o.balance)}</span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Purchase orders</h1>
        <button onClick={() => setCreating(true)} className="btn-primary btn-sm">
          New order
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Ordered (all time)" value={fmt(data?.totals?.ordered || 0, { decimals: false })} />
        <StatTile
          label="Owed to suppliers"
          value={fmt(data?.totals?.owed || 0, { decimals: false })}
          tone={data?.totals?.owed > 0 ? 'warn' : 'good'}
        />
      </div>

      <Segmented options={VIEWS} value={view} onChange={setView} />

      <Card>
        {!data ? (
          <Loading />
        ) : data.orders.length === 0 ? (
          <EmptyState
            title="No purchase orders"
            hint="Raise one when you order paper or consumables. Receiving it puts the stock on the shelf and records what you owe."
            action={
              <button onClick={() => setCreating(true)} className="btn-primary btn-sm">
                New order
              </button>
            }
          />
        ) : (
          <DataTable
            columns={orderColumns}
            rows={data.orders || []}
            minWidth={860}
            empty={<EmptyState title="No orders yet" />}
          />
        )}
      </Card>

      {creating && (
        <NewOrderModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            toast('Purchase order raised');
            load();
          }}
        />
      )}

      {openOrder && (
        <OrderModal
          order={openOrder}
          onClose={() => setOpenOrder(null)}
          onChanged={() => {
            setOpenOrder(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function NewOrderModal({ onClose, onSaved }) {
  const { fmt, toast } = useApp();
  const [suppliers, setSuppliers] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [supplier, setSupplier] = useState('');
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([apiGet('/api/suppliers'), apiGet('/api/materials')])
      .then(([s, m]) => {
        setSuppliers(s.suppliers || []);
        setMaterials(m.materials || []);
      })
      .catch(() => {});
  }, []);

  // Suggest what is at or below its reorder level for the chosen supplier.
  const suggestions = useMemo(
    () =>
      materials.filter(
        (m) =>
          m.reorderLevel > 0 &&
          m.quantity <= m.reorderLevel &&
          (!supplier || String(m.supplier?._id || m.supplier) === supplier)
      ),
    [materials, supplier]
  );

  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);

  const add = (materialId = '') =>
    setLines((l) => {
      const mat = materials.find((m) => m._id === materialId);
      return [
        ...l,
        {
          key: Math.random().toString(36).slice(2),
          material: materialId,
          quantity: mat?.reorderLevel ? String(mat.reorderLevel * 2) : '',
          unitCost: mat ? String(mat.unitCost) : '',
        },
      ];
    });

  async function save(send) {
    setError('');
    if (!supplier) return setError('Choose a supplier');
    const usable = lines.filter((l) => l.material && Number(l.quantity) > 0);
    if (!usable.length) return setError('Add at least one item');

    setBusy(true);
    try {
      await apiPost(
        '/api/purchase-orders',
        {
          supplier,
          status: send ? 'sent' : 'draft',
          items: usable.map((l) => ({
            material: l.material,
            quantity: Number(l.quantity),
            unitCost: Number(l.unitCost) || 0,
          })),
        },
        { queue: false }
      );
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
      wide
      title="New purchase order"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => save(false)} disabled={busy} className="btn-secondary">
            Save draft
          </button>
          <button onClick={() => save(true)} disabled={busy} className="btn-primary">
            {busy ? <Spinner /> : null}
            Place order · {fmt(total)}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <Field label="Supplier">
          <select className="field" value={supplier} onChange={(e) => setSupplier(e.target.value)}>
            <option value="">Choose…</option>
            {suppliers.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name} — {s.leadTimeDays} day(s)
              </option>
            ))}
          </select>
        </Field>

        {suggestions.length > 0 && (
          <div className="rounded-lg bg-warn-soft p-3">
            <p className="mb-1.5 text-xs font-semibold text-warn">Below reorder level — tap to add</p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((m) => (
                <button
                  key={m._id}
                  onClick={() => add(m._id)}
                  disabled={lines.some((l) => l.material === m._id)}
                  className="rounded-lg border border-warn/30 bg-surface px-2.5 py-1.5 text-xs font-medium disabled:opacity-40"
                >
                  {m.name} ({m.quantity} left)
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Items</span>
          <button onClick={() => add()} className="text-sm font-semibold text-brand">
            + Add item
          </button>
        </div>

        {lines.length === 0 ? (
          <p className="py-2 text-sm text-muted">Nothing added yet.</p>
        ) : (
          <ul className="space-y-2">
            {lines.map((l) => (
              <li key={l.key} className="rounded-lg border border-line p-3">
                <Field label="Material">
                  <select
                    className="field"
                    value={l.material}
                    onChange={(e) => {
                      const mat = materials.find((m) => m._id === e.target.value);
                      setLines((list) =>
                        list.map((x) =>
                          x.key === l.key
                            ? { ...x, material: e.target.value, unitCost: mat ? String(mat.unitCost) : x.unitCost }
                            : x
                        )
                      );
                    }}
                  >
                    <option value="">Choose…</option>
                    {materials.map((m) => (
                      <option key={m._id} value={m._id}>
                        {m.name} — {m.quantity} {m.unit} in stock
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="mt-2 flex items-end gap-2">
                  <Field label="Quantity" className="flex-1">
                    <input
                      className="field tnum text-center"
                      inputMode="decimal"
                      value={l.quantity}
                      onChange={(e) =>
                        setLines((list) =>
                          list.map((x) => (x.key === l.key ? { ...x, quantity: e.target.value.replace(/[^\d.]/g, '') } : x))
                        )
                      }
                    />
                  </Field>
                  <Field label="Unit cost" className="flex-1">
                    <MoneyInput
                      value={l.unitCost}
                      onChange={(unitCost) =>
                        setLines((list) => list.map((x) => (x.key === l.key ? { ...x, unitCost } : x)))
                      }
                    />
                  </Field>
                  <button
                    onClick={() => setLines((list) => list.filter((x) => x.key !== l.key))}
                    className="btn-ghost btn-sm mb-0.5 text-bad"
                  >
                    ✕
                  </button>
                </div>
                <p className="mt-1 text-right text-sm font-semibold">
                  {fmt((Number(l.quantity) || 0) * (Number(l.unitCost) || 0))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

function OrderModal({ order, onClose, onChanged }) {
  const { fmt, toast } = useApp();
  const [full, setFull] = useState(null);
  const [receiving, setReceiving] = useState({});
  const [invoiceNo, setInvoiceNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiGet(`/api/purchase-orders/${order._id}`)
      .then((d) => {
        setFull(d);
        const init = {};
        for (const i of d.order.items) {
          const outstanding = i.quantity - i.received;
          if (outstanding > 0) init[String(i.material)] = String(outstanding);
        }
        setReceiving(init);
        setInvoiceNo(d.order.supplierInvoiceNo || '');
      })
      .catch((e) => setError(e.message));
  }, [order._id]);

  async function receive() {
    setError('');
    setBusy(true);
    try {
      const lines = Object.entries(receiving)
        .filter(([, q]) => Number(q) > 0)
        .map(([material, quantity]) => ({ material, quantity: Number(quantity) }));

      if (!lines.length) throw new Error('Enter what actually arrived');

      await apiPost(`/api/purchase-orders/${order._id}/receive`, { lines, supplierInvoiceNo: invoiceNo }, { queue: false });
      toast('Goods received — stock updated');
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !full) return <Modal open onClose={onClose} title="Purchase order"><ErrorNote>{error}</ErrorNote></Modal>;
  if (!full) return <Modal open onClose={onClose} title="Purchase order"><Loading /></Modal>;

  const o = full.order;
  const canReceive = !['received', 'cancelled'].includes(o.status);

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={`${o.poNumber} — ${o.supplierName}`}
      footer={
        canReceive ? (
          <button onClick={receive} disabled={busy} className="btn-primary w-full">
            {busy ? <Spinner /> : null}
            Receive goods
          </button>
        ) : null
      }
    >
      <div className="space-y-3">
        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <div className="rounded-lg bg-page p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Received so far</span>
            <span className="tnum font-medium">{fmt(o.total)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Paid</span>
            <span className="tnum font-medium">{fmt(o.amountPaid)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Outstanding</span>
            <span className="tnum">{fmt(o.balance)}</span>
          </div>
        </div>

        <SectionTitle>Items</SectionTitle>
        <ul className="space-y-2">
          {o.items.map((i) => {
            const outstanding = i.quantity - i.received;
            return (
              <li key={String(i.material)} className="rounded-lg border border-line p-3">
                <div className="flex justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">{i.name}</span>
                  <span className="tnum shrink-0 text-sm">{fmt(i.total)}</span>
                </div>
                <p className="text-xs text-muted">
                  Ordered {i.quantity} {i.unit} · received {i.received} · {outstanding > 0 ? `${outstanding} due` : 'complete'}
                </p>
                {canReceive && outstanding > 0 && (
                  <Field label={`Arriving now (${i.unit})`} className="mt-2">
                    <input
                      className="field tnum text-center"
                      inputMode="decimal"
                      value={receiving[String(i.material)] ?? ''}
                      onChange={(e) =>
                        setReceiving((r) => ({ ...r, [String(i.material)]: e.target.value.replace(/[^\d.]/g, '') }))
                      }
                    />
                  </Field>
                )}
              </li>
            );
          })}
        </ul>

        {canReceive && (
          <Field label="Supplier invoice number" hint="Optional, but useful when reconciling their statement">
            <input className="field" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
          </Field>
        )}

        {o.receipts?.length > 0 && (
          <>
            <SectionTitle>Deliveries</SectionTitle>
            <ul className="space-y-1 text-sm">
              {o.receipts.map((r, i) => (
                <li key={i} className="flex justify-between text-muted">
                  <span>
                    {new Date(r.at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} · {r.by}
                  </span>
                  <span className="tnum">{fmt(r.value)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}
