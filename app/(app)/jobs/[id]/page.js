'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiGet, apiPatch, apiPost } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import ShareModal from '@/components/ShareModal';
import {
  Card,
  Chip,
  COLLECTION_META,
  ErrorNote,
  Field,
  Loading,
  Modal,
  PAY_STATUS_META,
  SectionTitle,
  Spinner,
  StatusChip,
} from '@/components/ui';

const FLOW = ['quote', 'approved', 'printing', 'finishing', 'done', 'delivered'];
const NEXT_LABEL = {
  quote: 'Approve this quote',
  approved: 'Start printing',
  printing: 'Move to finishing',
  finishing: 'Mark as done',
  done: 'Mark as delivered',
};

export default function JobDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { fmt, isOwner, toast } = useApp();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [collectOpen, setCollectOpen] = useState(false);
  const [share, setShare] = useState(null);

  const load = useCallback(() => {
    apiGet(`/api/jobs/${id}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(load, [load]);

  if (error) return <Card className="p-6 text-center text-bad">{error}</Card>;
  if (!data) return <Loading />;

  const { job, sale, payments, movements } = data;
  const currentIndex = FLOW.indexOf(job.status);
  const nextStatus = currentIndex >= 0 && currentIndex < FLOW.length - 1 ? FLOW[currentIndex + 1] : null;

  async function advance(status, extra = {}) {
    setBusy(true);
    try {
      const res = await apiPatch(`/api/jobs/${id}`, { status, ...extra });
      if (res.stockDeducted && !res.stockDeducted.skipped) {
        toast('Job done — materials taken off stock');
      } else {
        toast('Job updated');
      }
      load();
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function setCollection(collectionStatus, collectedBy) {
    setBusy(true);
    try {
      await apiPatch(`/api/jobs/${id}`, { collectionStatus, collectedBy });
      toast(collectionStatus === 'collected' ? 'Marked as collected' : 'Updated');
      setCollectOpen(false);
      load();
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function shareJob() {
    try {
      setShare(await apiPost(`/api/jobs/${id}/share`, {}, { queue: false }));
    } catch (e) {
      toast(e.message, 'bad');
    }
  }

  async function cancelJob() {
    const reason = prompt('Why is this job being cancelled?');
    if (!reason) return;
    try {
      await apiPatch(`/api/jobs/${id}`, { status: 'cancelled', cancelReason: reason });
      toast('Job cancelled');
      load();
    } catch (e) {
      toast(e.message, 'bad');
    }
  }

  const overdue =
    job.deadline && new Date(job.deadline) < new Date() && !['done', 'delivered', 'cancelled'].includes(job.status);

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center gap-2">
        <button onClick={() => router.back()} className="btn-ghost btn-sm">
          ← Back
        </button>
        <div className="flex-1" />
        <button onClick={() => router.push(`/jobs/new?repeat=${id}`)} className="btn-secondary btn-sm">
          Repeat this job
        </button>
        <button onClick={shareJob} className="btn-secondary btn-sm">
          Send to customer
        </button>
        <button onClick={() => window.print()} className="btn-secondary btn-sm">
          Print job ticket
        </button>
        {isOwner && job.status !== 'cancelled' && (
          <button onClick={cancelJob} className="btn-ghost btn-sm text-bad">
            Cancel job
          </button>
        )}
      </div>

      {/* ---------------- header ---------------- */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <StatusChip status={job.status} />
              <StatusChip status={job.collectionStatus} map={COLLECTION_META} />
              {job.isRush ? <Chip tone="bad">Rush</Chip> : null}
            </div>
            <h1 className="text-xl font-bold">{job.customerName}</h1>
            <p className="text-sm text-muted">
              {job.jobNumber} · {job.jobType} · {job.quantity} pc
            </p>
            {job.customer ? (
              <Link href={`/customers/${job.customer}`} className="no-print text-xs font-semibold text-brand">
                Customer history →
              </Link>
            ) : null}
          </div>
          <div className="text-right">
            <p className="tnum text-2xl font-bold">{fmt(job.price - (job.discount || 0))}</p>
            {sale ? (
              <>
                <div className="mt-1 flex justify-end">
                  <StatusChip status={sale.status} map={PAY_STATUS_META} />
                </div>
                {sale.balance > 0 ? (
                  <p className="tnum mt-1 text-sm font-semibold text-bad">{fmt(sale.balance)} owing</p>
                ) : null}
              </>
            ) : (
              <p className="mt-1 text-xs text-faint">No invoice yet (still a quote)</p>
            )}
          </div>
        </div>

        {job.deadline ? (
          <p className={`mt-3 text-sm ${overdue ? 'font-semibold text-bad' : 'text-muted'}`}>
            {overdue ? '⚠ Overdue — was due ' : 'Deadline: '}
            {new Date(job.deadline).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })}
          </p>
        ) : null}
      </Card>

      {/* ---------------- move it forward ---------------- */}
      {job.status !== 'cancelled' && (
        <Card className="no-print p-4">
          <SectionTitle>Where is it now?</SectionTitle>

          <ol className="mb-4 flex items-center gap-1">
            {FLOW.map((s, i) => (
              <li key={s} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={`h-1.5 w-full rounded-full ${
                    i <= currentIndex ? 'bg-brand' : 'bg-line'
                  }`}
                />
                <span className={`text-[10px] capitalize ${i <= currentIndex ? 'font-semibold text-brand' : 'text-faint'}`}>
                  {s}
                </span>
              </li>
            ))}
          </ol>

          <div className="grid gap-2 sm:grid-cols-2">
            {nextStatus && (
              <button onClick={() => advance(nextStatus)} disabled={busy} className="btn-primary">
                {busy ? <Spinner /> : null}
                {NEXT_LABEL[job.status]}
              </button>
            )}

            {job.collectionStatus === 'ready' && (
              <button onClick={() => setCollectOpen(true)} disabled={busy} className="btn-good">
                Customer is collecting it
              </button>
            )}

            {sale && sale.balance > 0 && (
              <Link href={`/sales/${sale._id}`} className="btn-secondary">
                Take payment · {fmt(sale.balance)}
              </Link>
            )}
            {sale && sale.balance <= 0 && (
              <Link href={`/sales/${sale._id}`} className="btn-secondary">
                View receipt
              </Link>
            )}
          </div>

          {job.collectionStatus === 'ready' && sale?.balance > 0 && (
            <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-sm font-semibold text-warn">
              This job is ready but {fmt(sale.balance)} is still owed. Collect the balance before handing it over.
            </p>
          )}
        </Card>
      )}

      {/* ---------------- the job ticket ---------------- */}
      <Card className="p-5">
        <SectionTitle>What to print</SectionTitle>

        {(job.items?.length ? job.items : [legacyItem(job)]).map((item, i, arr) => (
          <div key={i} className={i < arr.length - 1 ? 'mb-4 border-b border-line pb-4' : ''}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <p className="font-semibold">
                {item.quantity} × {item.description || item.jobType}
              </p>
              <span className="tnum shrink-0 text-sm font-semibold">{fmt(item.total)}</span>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <Spec label="Job type" value={item.jobType} />
              <Spec label="Size" value={item.specs?.size} />
              <Spec label="Paper" value={item.specs?.paper} />
              <Spec label="Colour" value={item.specs?.colour} />
              <Spec label="Sides" value={item.specs?.sides} />
              <Spec label="Finishing" value={item.specs?.finishing} />
            </dl>
          </div>
        ))}

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-line pt-3 text-sm sm:grid-cols-3">
          <Spec label="Assigned to" value={job.assignedToName} />
          <Spec label="Taken by" value={job.createdByName} />
          <Spec label="Total pieces" value={job.quantity} />
        </dl>

        {job.notes ? <p className="mt-2 text-sm text-muted">Note: {job.notes}</p> : null}
      </Card>

      {/* ---------------- materials ---------------- */}
      {job.materials?.length > 0 && (
        <Card>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">Materials</h2>
            <Chip tone={job.stockDeducted ? 'good' : 'neutral'}>
              {job.stockDeducted ? 'Taken off stock' : 'Not yet deducted'}
            </Chip>
          </div>
          <ul className="divide-y divide-line">
            {job.materials.map((m, i) => (
              <li key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span>{m.name}</span>
                <span className="tnum text-muted">
                  {m.quantity} {m.unit}
                  {isOwner && m.unitCost ? (
                    <span className="ml-2 text-faint">{fmt(m.quantity * m.unitCost)}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {!job.stockDeducted && (
            <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
              These come off stock automatically when the job is marked done.
            </p>
          )}
        </Card>
      )}

      {/* ---------------- money ---------------- */}
      {payments?.length > 0 && (
        <Card>
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">Payments received</h2>
          </div>
          <ul className="divide-y divide-line">
            {payments.map((p) => (
              <li key={p._id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-muted">
                  {new Date(p.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ·{' '}
                  {p.method}
                  {p.isDeposit && !p.isRefund ? ' · deposit' : ''}
                  {p.isRefund ? ' · refund' : ''}
                </span>
                <span className={`tnum font-semibold ${p.isRefund ? 'text-bad' : ''}`}>
                  {p.isRefund ? '−' : ''}
                  {fmt(Math.abs(p.amount))}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ---------------- history ---------------- */}
      <Card className="no-print p-4">
        <SectionTitle>History</SectionTitle>
        <ul className="space-y-2 text-sm">
          {job.statusHistory?.map((h, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="capitalize text-muted">{h.status}</span>
              <span className="text-right text-xs text-faint">
                {new Date(h.at).toLocaleString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                · {h.by}
              </span>
            </li>
          ))}
          {job.collectedAt ? (
            <li className="flex justify-between gap-3 border-t border-line pt-2">
              <span className="text-good">Collected by {job.collectedBy}</span>
              <span className="text-xs text-faint">
                {new Date(job.collectedAt).toLocaleString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </li>
          ) : null}
        </ul>
        {movements?.length > 0 && (
          <>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-faint">Stock movements</p>
            <ul className="mt-1 space-y-1 text-sm text-muted">
              {movements.map((m) => (
                <li key={m._id} className="flex justify-between">
                  <span>
                    {m.type} · {m.materialName}
                  </span>
                  <span className="tnum">
                    {m.delta > 0 ? '+' : ''}
                    {m.delta} {m.unit}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <CollectModal
        open={collectOpen}
        onClose={() => setCollectOpen(false)}
        job={job}
        sale={sale}
        fmt={fmt}
        busy={busy}
        onConfirm={(name) => setCollection('collected', name)}
      />

      <ShareModal
        share={share}
        title={job.status === 'quote' ? 'Send the quote' : 'Send job details'}
        onClose={() => setShare(null)}
      />
    </div>
  );
}

/** Render a job saved before orders could hold several products. */
function legacyItem(job) {
  return {
    jobType: job.jobType,
    description: job.description,
    quantity: job.quantity,
    specs: job.specs,
    total: (job.price || 0) - (job.discount || 0),
  };
}

function Spec({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

/**
 * Handing the work over. Asking who collected it — and warning about an unpaid
 * balance first — is what stops a job being given out twice or given away free.
 */
function CollectModal({ open, onClose, job, sale, fmt, busy, onConfirm }) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) setName(job.customerName || '');
  }, [open, job.customerName]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Hand over the job"
      footer={
        <button onClick={() => onConfirm(name)} disabled={busy} className="btn-good w-full">
          {busy ? <Spinner /> : null}
          Confirm collected
        </button>
      }
    >
      <div className="space-y-3">
        {sale?.balance > 0 && (
          <ErrorNote>
            {fmt(sale.balance)} is still owed on this job. Collect it before handing over, or record that the customer
            is taking it on credit.
          </ErrorNote>
        )}
        <p className="text-sm text-muted">
          {job.jobNumber} · {job.jobType} · {job.quantity} pc
        </p>
        <Field label="Who is collecting it?" hint="Useful when a driver or staff member picks up on the customer's behalf">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
