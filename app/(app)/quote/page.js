'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import CustomerPicker from '@/components/CustomerPicker';
import InvoiceGrid from '@/components/InvoiceGrid';
import { Card, ErrorNote, Field, SectionTitle, Spinner } from '@/components/ui';

/**
 * The counter.
 *
 * This is the screen that replaces the pad of paper invoices, so it keeps the
 * pad's shape: a customer's name at the top, a line per picture, and a total
 * at the bottom. What it adds is the part the pad cannot do — the rate for a
 * size appears when the size is picked, the arithmetic is done, the customer
 * is remembered, and the job carries through to the workshop and the books.
 *
 * Nothing is written until it is saved, so a price can be given, argued over
 * and changed as many times as the conversation needs.
 */
export default function QuotePage() {
  const router = useRouter();
  const { fmt, toast } = useApp();

  const [order, setOrder] = useState({ lines: [], total: 0 });
  const [customer, setCustomer] = useState({ customerId: null, customerName: '', customerPhone: '' });
  const [deadline, setDeadline] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  /* Stable, or InvoiceGrid's effect re-runs on every render of this page. */
  const onChange = useCallback((next) => setOrder(next), []);

  /* A row counts if anything at all has been put on it. The shop often
   * does not know a price when the picture is handed over — it is measured,
   * written down, and priced when the work is looked at properly. Insisting
   * on a figure here is what sends staff back to the paper pad. */
  const usable = order.lines.filter(
    (l) => l.total > 0 || l.size || Object.values(l.cells || {}).some((v) => String(v).trim())
  );

  async function save(status) {
    setError('');
    if (!usable.length) return setError('Add a row first — a size or a price is enough.');

    setBusy(true);
    try {
      const res = await apiPost('/api/jobs', {
        customerId: customer.customerId,
        customerName: customer.customerName,
        customerPhone: customer.customerPhone,
        deadline: deadline || undefined,
        notes: notes.trim() || undefined,
        status,
        items: usable.map((l) => ({
          jobType: jobTypeFor(l),
          description: describe(l),
          quantity: l.quantity,
          unitPrice: l.unit,
          total: l.total,
          specs: { size: l.size, grade: charged(l, 'frame') ? l.grade : undefined },
        })),
        /* What each part of each line cost, frozen as quoted. Prices move;
         * a quote given today must still explain itself when the customer
         * comes back for it next month. */
        priceBreakdown: usable.flatMap((l) =>
          Object.entries(l.cells)
            .map(([part, value]) => ({ part, amount: Number(String(value).replace(/,/g, '')) || 0 }))
            .filter((x) => x.amount > 0)
            .map((x) => ({
              part: x.part,
              name: labelFor(x.part, l),
              detail: l.size + (l.quantity > 1 ? ' x' + l.quantity : ''),
              amount: x.amount,
            }))
        ),
      });

      toast(status === 'quote' ? 'Quote saved' : 'Job created');
      router.push('/jobs/' + res.job._id);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">New invoice</h1>
        <a href="/jobs" className="btn-ghost btn-sm">
          Jobs
        </a>
      </div>

      <Card className="p-4">
        <SectionTitle>Who is it for?</SectionTitle>
        <CustomerPicker value={customer} onChange={setCustomer} />
      </Card>

      <InvoiceGrid onChange={onChange} />

      <Card className="p-4">
        <SectionTitle>Before you save</SectionTitle>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Field label="Ready by" hint="Leave blank if no day has been promised">
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full rounded-lg border border-line bg-card px-3 py-2"
            />
          </Field>
          <Field label="Note" hint="Anything the workshop needs to know">
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-line bg-card px-3 py-2"
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {/* Two buttons, because they are two different conversations. Most
              people ask the price and leave; a quote costs the shop nothing
              and is not work anybody has agreed to do. */}
          <button onClick={() => save('quote')} disabled={busy} className="btn-secondary">
            {busy ? <Spinner /> : null}
            Save as quote
          </button>
          <button onClick={() => save('approved')} disabled={busy} className="btn-primary">
            {busy ? <Spinner /> : null}
            They said yes — {fmt(order.total)}
          </button>
        </div>
      </Card>
    </div>
  );
}

/* A frame makes it a framing job; without one it is a print or a canvas. The
 * headline type is what the jobs list groups by, so it should say what the
 * workshop will actually be doing. */
function jobTypeFor(line) {
  if (charged(line, 'frame')) return 'Custom frame';
  if (charged(line, 'board')) return 'Ready-made frame';
  if (charged(line, 'canvas')) return 'Canvas stretch';
  return 'Other';
}

/** Was anything actually written in that column? */
function charged(line, product) {
  return (Number(String(line.cells?.[product] ?? '').replace(/,/g, '')) || 0) > 0;
}

function labelFor(part, line) {
  const names = { print: 'Print', canvas: 'Canvas', frame: 'Frame', glass: 'Acrylic glass', board: 'Frameless board' };
  const base = names[part] || part;
  return part === 'frame' && line.grade ? base + ' (' + line.grade + ')' : base;
}

/** What goes on the claim ticket. */
function describe(line) {
  const names = { print: 'print', canvas: 'canvas', frame: 'frame', glass: 'acrylic', board: 'board' };
  const bits = [line.size];
  for (const part of Object.keys(names)) {
    if (!charged(line, part)) continue;
    bits.push(part === 'frame' && line.grade ? line.grade + ' frame' : names[part]);
  }
  return bits.join(', ');
}
