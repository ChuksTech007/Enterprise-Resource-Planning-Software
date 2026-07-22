'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet, apiPost } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import { Card, EmptyState, ErrorNote, Field, Loading, Modal, MoneyInput, Spinner, StatTile } from '@/components/ui';

/**
 * What you owe suppliers — the mirror image of "Who owes me".
 *
 * Between the two, the owner can see the whole cash position: money coming in
 * and money going out, rather than only half of it.
 */
export default function PayablesPage() {
  const { fmt, toast } = useApp();
  const [data, setData] = useState(null);
  const [orders, setOrders] = useState([]);
  const [paying, setPaying] = useState(null);

  const load = useCallback(() => {
    Promise.all([apiGet('/api/supplier-payments'), apiGet('/api/purchase-orders', { owing: '1' })])
      .then(([p, o]) => {
        setData(p);
        setOrders(o.orders || []);
      })
      .catch(() => setData({ payments: [], owing: [], totalOwed: 0 }));
  }, []);

  useEffect(load, [load]);

  if (!data) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">What I owe</h1>
        <Link href="/purchases" className="btn-secondary btn-sm">
          Purchase orders
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Owed to suppliers"
          value={fmt(data.totalOwed, { decimals: false })}
          sub={`${data.owing.length} supplier(s)`}
          tone={data.totalOwed > 0 ? 'bad' : 'good'}
        />
        <StatTile label="Unpaid orders" value={orders.length} />
      </div>

      <Card>
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">By supplier</h2>
        </div>
        {data.owing.length === 0 ? (
          <EmptyState title="You owe nobody" hint="Every delivery has been paid for." />
        ) : (
          <ul className="divide-y divide-line">
            {data.owing.map((s) => (
              <li key={s.supplier} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.name}</p>
                  <p className="text-xs text-muted">
                    {s.orders} unpaid order{s.orders === 1 ? '' : 's'}
                  </p>
                </div>
                <span className="tnum shrink-0 font-bold text-bad">{fmt(s.owed)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Unpaid orders</h2>
          <p className="text-xs text-muted">Only what has actually been delivered counts as owed</p>
        </div>
        {orders.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">Nothing outstanding.</p>
        ) : (
          <ul className="divide-y divide-line">
            {orders.map((o) => (
              <li key={o._id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{o.supplierName}</p>
                  <p className="truncate text-xs text-muted">
                    {o.poNumber} · received {fmt(o.total)} · paid {fmt(o.amountPaid)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="tnum font-semibold text-bad">{fmt(o.balance)}</span>
                  <button onClick={() => setPaying(o)} className="btn-primary btn-sm">
                    Pay
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Recent payments out</h2>
        </div>
        {data.payments.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">No supplier payments yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.payments.slice(0, 20).map((p) => (
              <li key={p._id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 truncate text-muted">
                  {new Date(p.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ·{' '}
                  {p.supplierName}
                  {p.poNumber ? ` · ${p.poNumber}` : ''} · {p.method}
                </span>
                <span className="tnum shrink-0 font-semibold">{fmt(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {paying && (
        <PayModal
          order={paying}
          onClose={() => setPaying(null)}
          onPaid={() => {
            setPaying(null);
            toast('Payment recorded');
            load();
          }}
        />
      )}
    </div>
  );
}

function PayModal({ order, onClose, onPaid }) {
  const { fmt } = useApp();
  const [amount, setAmount] = useState(String(order.balance));
  const [method, setMethod] = useState('transfer');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function pay() {
    setError('');
    setBusy(true);
    try {
      await apiPost(
        '/api/supplier-payments',
        { purchaseOrder: order._id, amount: Number(amount), method, reference },
        { queue: false }
      );
      onPaid();
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
      title={`Pay ${order.supplierName}`}
      footer={
        <button onClick={pay} disabled={busy} className="btn-primary w-full">
          {busy ? <Spinner /> : null}
          Record payment
        </button>
      }
    >
      <div className="space-y-3">
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <p className="rounded-lg bg-page px-3 py-2 text-sm">
          {order.poNumber} — <span className="tnum font-semibold">{fmt(order.balance)}</span> outstanding
        </p>
        <Field label="Amount">
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="Paid by">
          <select className="field" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="transfer">Bank transfer</option>
            <option value="cash">Cash</option>
            <option value="pos">POS / Card</option>
            <option value="online">Online</option>
          </select>
        </Field>
        <Field label="Reference" hint="Transfer narration or receipt number">
          <input className="field" value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
