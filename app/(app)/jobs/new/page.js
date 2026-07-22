'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import CustomerPicker from '@/components/CustomerPicker';
import PaymentFields from '@/components/PaymentFields';
import { Card, Chip, ErrorNote, Field, Loading, MoneyInput, Modal, SectionTitle, Spinner } from '@/components/ui';

const newKey = () => Math.random().toString(36).slice(2);

const blankItem = () => ({
  key: newKey(),
  jobType: '',
  description: '',
  quantity: '1',
  size: '',
  paper: '',
  colour: 'Full colour',
  sides: 'Single sided',
  finishing: '',
  unitPrice: '',
  total: '',
});

export default function NewJobPage() {
  return (
    <Suspense fallback={<Loading />}>
      <NewJob />
    </Suspense>
  );
}

function NewJob() {
  const router = useRouter();
  const params = useSearchParams();
  const { fmt, toast, openRegister } = useApp();

  const repeatOf = params.get('repeat');

  const [meta, setMeta] = useState(null);
  const [priceItems, setPriceItems] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [staff, setStaff] = useState([]);

  const [customer, setCustomer] = useState({ customerId: null, customerName: '', customerPhone: '' });
  const [items, setItems] = useState([blankItem()]);
  const [openItem, setOpenItem] = useState(null);
  const [jobMaterials, setJobMaterials] = useState([]);
  const [form, setForm] = useState({ discount: '', deadline: '', isRush: false, assignedTo: '', notes: '' });
  const [deposit, setDeposit] = useState({ method: 'cash', amount: '', reference: '' });
  const [takeDeposit, setTakeDeposit] = useState(false);
  const [repeatedFrom, setRepeatedFrom] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      apiGet('/api/jobs', { limit: 1 }),
      apiGet('/api/pricelist'),
      apiGet('/api/materials'),
      apiGet('/api/users'),
    ])
      .then(([j, p, m, u]) => {
        setMeta({ jobTypes: j.jobTypes, finishes: j.finishes });
        setPriceItems(p.items || []);
        setMaterials(m.materials || []);
        setStaff((u.users || []).filter((x) => x.active));
      })
      .catch((e) => setError(e.message));
  }, []);

  // "Same as last time" — the single most common request in a print shop.
  useEffect(() => {
    if (!repeatOf) return;
    apiGet(`/api/jobs/${repeatOf}`)
      .then(({ job }) => {
        setRepeatedFrom(job);
        setCustomer({
          customerId: job.customer || null,
          customerName: job.customerName || '',
          customerPhone: '',
        });
        const source = job.items?.length
          ? job.items
          : [{ jobType: job.jobType, description: job.description, quantity: job.quantity, specs: job.specs, unitPrice: job.unitPrice, total: job.price }];
        setItems(
          source.map((i) => ({
            key: newKey(),
            jobType: i.jobType || '',
            description: i.description || '',
            quantity: String(i.quantity ?? 1),
            size: i.specs?.size || '',
            paper: i.specs?.paper || '',
            colour: i.specs?.colour || 'Full colour',
            sides: i.specs?.sides || 'Single sided',
            finishing: i.specs?.finishing || '',
            unitPrice: i.unitPrice ? String(i.unitPrice) : '',
            total: i.total ? String(i.total) : '',
          }))
        );
        setJobMaterials(
          (job.materials || []).map((m) => ({
            key: newKey(),
            materialId: m.material,
            quantity: String(m.quantity),
          }))
        );
        // Deadline and rush deliberately NOT copied — they belong to the old order.
      })
      .catch(() => toast('Could not load the job to repeat', 'bad'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeatOf]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const updateItem = (key, patch) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const itemTotal = (i) =>
    i.total !== '' ? Number(i.total) || 0 : (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0);

  const subtotal = useMemo(() => items.reduce((s, i) => s + itemTotal(i), 0), [items]);
  const total = Math.max(0, subtotal - (Number(form.discount) || 0));

  function applyPreset(preset, key) {
    updateItem(key, {
      jobType: preset.jobType,
      description: preset.name,
      unitPrice: String(preset.price),
      quantity: String(preset.minQuantity || 1),
      total: '',
    });
  }

  async function submit(asQuote) {
    setError('');
    if (!customer.customerName?.trim() && !customer.customerId) return setError("Enter the customer's name.");
    const usable = items.filter((i) => i.jobType);
    if (!usable.length) return setError('Every item needs a job type.');
    if (!asQuote && takeDeposit && deposit.method === 'cash' && !openRegister) {
      return setError('Open your till before taking cash. Go to Cash-up.');
    }

    setBusy(true);
    try {
      const res = await apiPost('/api/jobs', {
        customerId: customer.customerId,
        customerName: customer.customerName,
        customerPhone: customer.customerPhone,
        items: usable.map((i) => ({
          jobType: i.jobType,
          description: i.description,
          quantity: Number(i.quantity) || 1,
          unitPrice: Number(i.unitPrice) || 0,
          total: i.total !== '' ? Number(i.total) : undefined,
          specs: {
            size: i.size,
            paper: i.paper,
            colour: i.colour,
            sides: i.sides,
            finishing: i.finishing,
          },
        })),
        discount: Number(form.discount) || 0,
        deadline: form.deadline || undefined,
        isRush: form.isRush,
        assignedTo: form.assignedTo || undefined,
        assignedToName: staff.find((s) => s._id === form.assignedTo)?.name,
        notes: form.notes,
        status: asQuote ? 'quote' : 'approved',
        materials: jobMaterials
          .filter((m) => m.materialId && Number(m.quantity) > 0)
          .map((m) => ({ materialId: m.materialId, quantity: Number(m.quantity) })),
        deposit:
          !asQuote && takeDeposit && Number(deposit.amount) > 0
            ? { amount: Number(deposit.amount), method: deposit.method, reference: deposit.reference }
            : undefined,
      });

      if (res.queued) {
        toast('No network — job saved on this device and will sync automatically.', 'warn');
        router.push('/jobs');
        return;
      }

      toast(asQuote ? 'Quote saved' : 'Job created');
      router.push(`/jobs/${res.job._id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  if (!meta) return <Loading />;

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{repeatedFrom ? 'Repeat order' : 'New job'}</h1>
        <button onClick={() => router.back()} className="btn-ghost btn-sm">
          Cancel
        </button>
      </div>

      {repeatedFrom ? (
        <p className="rounded-card bg-info-soft px-4 py-2.5 text-sm text-info-ink">
          Copied from <span className="font-semibold">{repeatedFrom.jobNumber}</span>. Check the quantities and price,
          and set a new deadline.
        </p>
      ) : null}

      <Card className="p-4">
        <CustomerPicker value={customer} onChange={setCustomer} allowWalkIn={false} />
      </Card>

      {/* ---------------- items ---------------- */}
      <Card>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">What are we printing?</h2>
            <p className="text-xs text-muted">Add a line for each product on this order</p>
          </div>
          <button onClick={() => setItems((l) => [...l, blankItem()])} className="btn-secondary btn-sm">
            + Item
          </button>
        </div>

        <ul className="divide-y divide-line">
          {items.map((item, index) => (
            <li key={item.key} className="p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-faint">Item {index + 1}</span>
                {items.length > 1 && (
                  <button
                    onClick={() => setItems((l) => l.filter((i) => i.key !== item.key))}
                    className="btn-ghost btn-sm text-bad"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Job type">
                  <select
                    className="field"
                    value={item.jobType}
                    onChange={(e) => updateItem(item.key, { jobType: e.target.value })}
                  >
                    <option value="">Choose…</option>
                    {meta.jobTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Quantity">
                  <input
                    className="field tnum"
                    inputMode="numeric"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.key, { quantity: e.target.value.replace(/[^\d]/g, '') })}
                  />
                </Field>
              </div>

              <Field label="Description" className="mt-3">
                <input
                  className="field"
                  value={item.description}
                  onChange={(e) => updateItem(item.key, { description: e.target.value })}
                  placeholder="e.g. complimentary cards, matte finish"
                />
              </Field>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Unit price">
                  <MoneyInput
                    value={item.unitPrice}
                    onChange={(unitPrice) => updateItem(item.key, { unitPrice, total: '' })}
                  />
                </Field>
                <Field label="Or total for this item">
                  <MoneyInput value={item.total} onChange={(t) => updateItem(item.key, { total: t })} />
                </Field>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <button onClick={() => setOpenItem(item.key)} className="text-sm font-semibold text-brand">
                  {item.size || item.paper || item.finishing ? 'Edit specs' : '+ Add specs'}
                </button>
                <span className="tnum text-sm font-bold">{fmt(itemTotal(item))}</span>
              </div>

              {(item.size || item.paper || item.finishing) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[item.size, item.paper, item.colour, item.sides, item.finishing]
                    .filter(Boolean)
                    .map((s, i) => (
                      <Chip key={i}>{s}</Chip>
                    ))}
                </div>
              )}

              {priceItems.length > 0 && !item.jobType && (
                <div className="mt-3">
                  <p className="mb-1.5 text-xs text-muted">Or pick a standard price:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {priceItems.slice(0, 8).map((p) => (
                      <button
                        key={p._id}
                        onClick={() => applyPreset(p, item.key)}
                        className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium hover:border-brand hover:bg-brand-soft"
                      >
                        {p.name} · {fmt(p.price)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {/* ---------------- materials ---------------- */}
      <Card className="p-4">
        <SectionTitle
          action={
            <button
              onClick={() => setJobMaterials((m) => [...m, { key: newKey(), materialId: '', quantity: '' }])}
              className="text-sm font-semibold text-brand"
            >
              + Add material
            </button>
          }
        >
          Materials this order will use
        </SectionTitle>
        <p className="mb-3 text-xs text-muted">
          Stock comes off automatically when the job is marked done. Leave blank to record it by hand instead.
        </p>

        {jobMaterials.length === 0 ? (
          <p className="py-2 text-sm text-muted">No materials listed.</p>
        ) : (
          <ul className="space-y-2">
            {jobMaterials.map((m) => (
              <li key={m.key} className="flex items-end gap-2">
                <Field label="Material" className="flex-1">
                  <select
                    className="field"
                    value={m.materialId}
                    onChange={(e) =>
                      setJobMaterials((list) =>
                        list.map((x) => (x.key === m.key ? { ...x, materialId: e.target.value } : x))
                      )
                    }
                  >
                    <option value="">Choose…</option>
                    {materials.map((mat) => (
                      <option key={mat._id} value={mat._id}>
                        {mat.name} {mat.size ? `(${mat.size})` : ''} — {mat.quantity} {mat.unit} left
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Qty used" className="w-28">
                  <input
                    className="field tnum text-center"
                    inputMode="decimal"
                    value={m.quantity}
                    onChange={(e) =>
                      setJobMaterials((list) =>
                        list.map((x) => (x.key === m.key ? { ...x, quantity: e.target.value.replace(/[^\d.]/g, '') } : x))
                      )
                    }
                  />
                </Field>
                <button
                  onClick={() => setJobMaterials((list) => list.filter((x) => x.key !== m.key))}
                  className="btn-ghost btn-sm mb-0.5 text-bad"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ---------------- when & who ---------------- */}
      <Card className="space-y-3 p-4">
        <SectionTitle>Deadline & staff</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Deadline">
            <input className="field" type="date" value={form.deadline} onChange={(e) => set({ deadline: e.target.value })} />
          </Field>
          <Field label="Assign to">
            <select className="field" value={form.assignedTo} onChange={(e) => set({ assignedTo: e.target.value })}>
              <option value="">Nobody yet</option>
              {staff.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-2.5 rounded-lg bg-page px-3 py-2.5">
          <input type="checkbox" className="h-5 w-5" checked={form.isRush} onChange={(e) => set({ isRush: e.target.checked })} />
          <span className="text-sm font-medium">Rush job — push to the front of the queue</span>
        </label>
        <Field label="Notes">
          <textarea className="field" rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </Card>

      {/* ---------------- price ---------------- */}
      <Card className="space-y-3 p-4">
        <SectionTitle>Price</SectionTitle>
        <div className="space-y-1.5 text-sm">
          {items.filter((i) => i.jobType).map((i, n) => (
            <div key={i.key} className="flex justify-between text-muted">
              <span className="truncate pr-3">
                {i.quantity} × {i.description || i.jobType}
              </span>
              <span className="tnum">{fmt(itemTotal(i))}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-line pt-1.5 text-muted">
            <span>Subtotal</span>
            <span className="tnum">{fmt(subtotal)}</span>
          </div>
        </div>

        <Field label="Discount">
          <MoneyInput value={form.discount} onChange={(discount) => set({ discount })} />
        </Field>

        <div className="flex items-center justify-between rounded-lg bg-page px-3 py-2.5">
          <span className="font-semibold">Total</span>
          <span className="tnum text-lg font-bold">{fmt(total)}</span>
        </div>

        <label className="flex items-center gap-2.5">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={takeDeposit}
            onChange={(e) => {
              setTakeDeposit(e.target.checked);
              if (e.target.checked) setDeposit((d) => ({ ...d, amount: String(Math.round((total / 2) * 100) / 100) }));
            }}
          />
          <span className="text-sm font-medium">Taking a deposit now</span>
        </label>

        {takeDeposit && (
          <div className="rounded-lg border border-line p-3">
            <PaymentFields value={deposit} onChange={setDeposit} owed={total} fmt={fmt} />
            {Number(deposit.amount) > 0 && (
              <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-sm font-semibold text-warn">
                Balance to collect on delivery: {fmt(Math.max(0, total - Number(deposit.amount)))}
              </p>
            )}
          </div>
        )}
      </Card>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div className="no-print sticky bottom-20 z-20 grid grid-cols-2 gap-2 lg:bottom-4">
        <button onClick={() => submit(true)} disabled={busy} className="btn-secondary shadow-lg">
          Save as quote
        </button>
        <button onClick={() => submit(false)} disabled={busy} className="btn-primary shadow-lg">
          {busy ? <Spinner /> : null}
          Create job · {fmt(total)}
        </button>
      </div>

      <SpecsModal
        item={items.find((i) => i.key === openItem)}
        finishes={meta.finishes}
        onChange={(patch) => updateItem(openItem, patch)}
        onClose={() => setOpenItem(null)}
      />
    </div>
  );
}

function SpecsModal({ item, finishes, onChange, onClose }) {
  if (!item) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title="Specification"
      footer={
        <button onClick={onClose} className="btn-primary w-full">
          Done
        </button>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Size">
            <input className="field" value={item.size} onChange={(e) => onChange({ size: e.target.value })} placeholder="A5, 3x2ft…" />
          </Field>
          <Field label="Paper / material">
            <input className="field" value={item.paper} onChange={(e) => onChange({ paper: e.target.value })} placeholder="300gsm matte…" />
          </Field>
          <Field label="Colour">
            <select className="field" value={item.colour} onChange={(e) => onChange({ colour: e.target.value })}>
              <option>Full colour</option>
              <option>Black only</option>
              <option>2 colour</option>
              <option>Spot colour</option>
            </select>
          </Field>
          <Field label="Sides">
            <select className="field" value={item.sides} onChange={(e) => onChange({ sides: e.target.value })}>
              <option>Single sided</option>
              <option>Double sided</option>
            </select>
          </Field>
        </div>
        <Field label="Finishing">
          <select className="field" value={item.finishing} onChange={(e) => onChange({ finishing: e.target.value })}>
            <option value="">None</option>
            {finishes.filter((f) => f !== 'None').map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  );
}
