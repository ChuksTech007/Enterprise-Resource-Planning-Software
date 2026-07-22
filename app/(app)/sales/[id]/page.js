'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiGet, apiPost, apiDelete } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import PaymentFields from '@/components/PaymentFields';
import ShareModal from '@/components/ShareModal';
import {
  Card,
  Chip,
  ErrorNote,
  Field,
  Loading,
  Modal,
  MoneyInput,
  PAY_STATUS_META,
  Spinner,
  StatusChip,
} from '@/components/ui';

const METHOD_LABELS = { cash: 'Cash', transfer: 'Transfer', pos: 'POS/Card', online: 'Online' };

export default function SaleDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { fmt, isOwner, toast, openRegister } = useApp();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [share, setShare] = useState(null);

  const load = useCallback(() => {
    apiGet(`/api/sales/${id}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(load, [load]);

  if (error) return <Card className="p-6 text-center text-bad">{error}</Card>;
  if (!data) return <Loading />;

  const { sale, payments, settings } = data;

  async function sendReminder() {
    try {
      setShare({ ...(await apiPost(`/api/sales/${id}/reminder`, {}, { queue: false })), title: 'Send a reminder' });
    } catch (e) {
      toast(e.message, 'bad');
    }
  }

  async function shareReceipt() {
    try {
      setShare({
        ...(await apiPost(`/api/sales/${id}/share`, {}, { queue: false })),
        title: sale.balance > 0 ? 'Send the invoice' : 'Send the receipt',
      });
    } catch (e) {
      toast(e.message, 'bad');
    }
  }

  async function cancelInvoice() {
    if (!confirm('Cancel this invoice? It stays in the records but stops counting as a sale.')) return;
    try {
      await apiDelete(`/api/sales/${id}`, { reason: 'Cancelled by owner' });
      toast('Invoice cancelled');
      load();
    } catch (e) {
      toast(e.message, 'bad');
    }
  }

  return (
    <div className="space-y-4">
      {/* ---------- actions (never printed) ---------- */}
      <div className="no-print flex flex-wrap items-center gap-2">
        <button onClick={() => router.back()} className="btn-ghost btn-sm">
          ← Back
        </button>
        <div className="flex-1" />
        {sale.balance > 0 && !sale.voided && (
          <>
            <button onClick={() => setPayOpen(true)} className="btn-primary btn-sm">
              Take payment
            </button>
            <button onClick={sendReminder} className="btn-secondary btn-sm">
              Remind customer
            </button>
          </>
        )}
        <button onClick={shareReceipt} className="btn-secondary btn-sm">
          Send receipt
        </button>
        <button onClick={() => window.print()} className="btn-secondary btn-sm">
          Print / PDF
        </button>
        {isOwner && sale.amountPaid > 0 && !sale.voided && (
          <button onClick={() => setRefundOpen(true)} className="btn-secondary btn-sm">
            Refund
          </button>
        )}
        {isOwner && sale.amountPaid === 0 && !sale.voided && (
          <button onClick={cancelInvoice} className="btn-ghost btn-sm text-bad">
            Cancel invoice
          </button>
        )}
      </div>

      {sale.voided && (
        <div className="rounded-card bg-bad-soft px-4 py-3 font-semibold text-bad">
          This invoice was cancelled. {sale.voidReason}
        </div>
      )}

      {/* ---------- the printable document ---------- */}
      <Card className="p-5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div>
            <h1 className="text-lg font-bold">{settings?.businessName || 'My Printing Press'}</h1>
            {settings?.address ? <p className="text-sm text-muted">{settings.address}</p> : null}
            {settings?.phone ? <p className="text-sm text-muted">{settings.phone}</p> : null}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-faint">
              {sale.balance > 0 ? 'Invoice' : 'Receipt'}
            </p>
            <p className="text-lg font-bold">{sale.invoiceNumber}</p>
            <p className="text-sm text-muted">
              {new Date(sale.createdAt).toLocaleString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
            <div className="mt-1 flex justify-end">
              <StatusChip status={sale.status} map={PAY_STATUS_META} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-between gap-4 py-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-faint">Billed to</p>
            <p className="font-semibold">{sale.customerName}</p>
            {sale.customerPhone ? <p className="text-sm text-muted">{sale.customerPhone}</p> : null}
            {sale.customer ? (
              <Link href={`/customers/${sale.customer}`} className="no-print text-xs font-semibold text-brand">
                View customer →
              </Link>
            ) : null}
          </div>
          {sale.jobNumber ? (
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-faint">Job</p>
              <p className="font-semibold">{sale.jobNumber}</p>
              {sale.job ? (
                <Link href={`/jobs/${sale.job}`} className="no-print text-xs font-semibold text-brand">
                  View job →
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="table-scroll">
          <table className="w-full min-w-[28rem] border-t border-line">
            <thead>
              <tr className="border-b border-line">
                <th className="th">Description</th>
                <th className="th text-right">Qty</th>
                <th className="th text-right">Price</th>
                <th className="th text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sale.items.map((it, i) => (
                <tr key={i}>
                  <td className="td">{it.description}</td>
                  <td className="td tnum text-right">{it.quantity}</td>
                  <td className="td tnum text-right">{fmt(it.unitPrice)}</td>
                  <td className="td tnum text-right font-medium">{fmt(it.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex justify-end">
          <dl className="w-full max-w-xs space-y-1.5 text-sm">
            <Row label="Subtotal" value={fmt(sale.subtotal)} />
            {sale.discount > 0 && <Row label="Discount" value={`− ${fmt(sale.discount)}`} />}
            <div className="border-t border-line pt-1.5">
              <Row label="Total" value={fmt(sale.total)} bold />
            </div>
            <Row label="Paid" value={fmt(sale.amountPaid)} />
            {sale.balance > 0 && (
              <div className="rounded-lg bg-warn-soft px-2 py-1.5">
                <Row label="Balance due" value={fmt(sale.balance)} bold tone="text-warn" />
              </div>
            )}
            {isOwner && sale.materialCost > 0 && (
              <div className="no-print border-t border-line pt-1.5 text-muted">
                <Row label="Material cost" value={fmt(sale.materialCost)} />
                <Row label="Est. profit" value={fmt(sale.total - sale.materialCost)} tone="text-good" />
              </div>
            )}
          </dl>
        </div>

        {payments.length > 0 && (
          <div className="mt-6 border-t border-line pt-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Payments</h3>
            <ul className="space-y-1.5 text-sm">
              {payments.map((p) => (
                <li key={p._id} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-muted">
                    {new Date(p.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ·{' '}
                    {METHOD_LABELS[p.method] || p.method}
                    {p.reference ? ` · ${p.reference}` : ''}
                    {p.isDeposit && !p.isRefund ? ' · deposit' : ''}
                    <span className="ml-1 text-faint">({p.receivedByName})</span>
                  </span>
                  <span className={`tnum font-semibold ${p.isRefund ? 'text-bad' : ''}`}>
                    {p.isRefund ? '−' : ''}
                    {fmt(Math.abs(p.amount))}
                  </span>
                  {p.tendered ? (
                    <span className="w-full text-right text-xs text-faint">
                      Cash given {fmt(p.tendered)} · change {fmt(p.changeGiven)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-6 border-t border-line pt-4 text-center text-xs text-muted">
          {settings?.receiptFooter || 'Thank you for your patronage.'}
        </p>
      </Card>

      <TakePaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        sale={sale}
        fmt={fmt}
        openRegister={openRegister}
        onDone={() => {
          setPayOpen(false);
          load();
        }}
      />

      <RefundModal
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        sale={sale}
        fmt={fmt}
        onDone={() => {
          setRefundOpen(false);
          load();
        }}
      />

      <ShareModal share={share} title={share?.title} onClose={() => setShare(null)} />
    </div>
  );
}

function Row({ label, value, bold, tone = '' }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className={bold ? 'font-semibold' : 'text-muted'}>{label}</dt>
      <dd className={`tnum ${bold ? 'font-bold' : ''} ${tone}`}>{value}</dd>
    </div>
  );
}

function TakePaymentModal({ open, onClose, sale, fmt, openRegister, onDone }) {
  const { toast } = useApp();
  const [payment, setPayment] = useState({ method: 'cash', amount: '', reference: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setPayment({ method: 'cash', amount: String(sale.balance), reference: '' });
  }, [open, sale.balance]);

  async function submit() {
    setError('');
    if (payment.method === 'cash' && !openRegister) {
      return setError('Open your till before taking cash. Go to Cash-up.');
    }
    setBusy(true);
    try {
      const res = await apiPost('/api/payments', {
        saleId: sale._id,
        amount: Number(payment.amount),
        method: payment.method,
        reference: payment.reference,
        tendered: Number(payment.tendered) || undefined,
      });
      toast(res.queued ? 'No network — payment saved on this device.' : 'Payment recorded', res.queued ? 'warn' : 'good');
      onDone();
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
      title={`Take payment · ${sale.invoiceNumber}`}
      footer={
        <button onClick={submit} disabled={busy} className="btn-primary w-full">
          {busy ? <Spinner /> : null}
          Record payment
        </button>
      }
    >
      <div className="space-y-3">
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <div className="rounded-lg bg-page p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Already paid</span>
            <span className="tnum font-medium">{fmt(sale.amountPaid)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Still owing</span>
            <span className="tnum">{fmt(sale.balance)}</span>
          </div>
        </div>
        <PaymentFields value={payment} onChange={setPayment} owed={sale.balance} fmt={fmt} />
      </div>
    </Modal>
  );
}

function RefundModal({ open, onClose, sale, fmt, onDone }) {
  const { toast } = useApp();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError('');
    setBusy(true);
    try {
      await apiPost(`/api/sales/${sale._id}/refund`, { amount: Number(amount), method, reason }, { queue: false });
      toast('Refund recorded');
      onDone();
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
      title="Refund the customer"
      footer={
        <button onClick={submit} disabled={busy} className="btn-danger w-full">
          {busy ? <Spinner /> : null}
          Record refund
        </button>
      }
    >
      <div className="space-y-3">
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <p className="text-sm text-muted">
          {fmt(sale.amountPaid)} has been paid on this invoice. A refund is recorded against it and shows in the
          activity log — it never edits the original payment.
        </p>
        <Field label="Refund amount">
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="Paid back by">
          <select className="field" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="transfer">Bank transfer</option>
            <option value="pos">POS / Card</option>
            <option value="online">Online</option>
          </select>
        </Field>
        <Field label="Reason" hint="Required — this is what you will read back in six months">
          <textarea className="field" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

