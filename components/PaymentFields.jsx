'use client';

import { Field, MoneyInput } from './ui';

const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'pos', label: 'POS / Card' },
  { value: 'online', label: 'Online' },
];

/**
 * How the customer paid.
 *
 * The reference field appears for everything except cash and is required
 * there, because a transfer or a Paystack payment with no reference cannot be
 * reconciled against the bank later — which is exactly how money goes missing.
 */
export default function PaymentFields({ value, onChange, owed, fmt, showAmount = true }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const needsReference = value.method && value.method !== 'cash';

  return (
    <div className="space-y-3">
      <Field label="Payment method">
        <div className="grid grid-cols-4 gap-1.5">
          {METHODS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => set({ method: m.value })}
              className={`rounded-lg border px-2 py-2.5 text-xs font-semibold transition ${
                value.method === m.value
                  ? 'border-brand bg-brand-soft text-brand-ink'
                  : 'border-line text-muted hover:text-ink'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </Field>

      {showAmount && (
        <Field
          label="Amount received"
          hint={owed !== undefined ? `${fmt(owed)} is owed. Enter less for a part-payment.` : undefined}
        >
          <MoneyInput value={value.amount ?? ''} onChange={(amount) => set({ amount })} />
          {owed !== undefined && owed > 0 && (
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => set({ amount: String(owed) })} className="btn-secondary btn-sm flex-1">
                Pay in full
              </button>
              <button
                type="button"
                onClick={() => set({ amount: String(Math.round(owed / 2 * 100) / 100) })}
                className="btn-secondary btn-sm flex-1"
              >
                Half deposit
              </button>
            </div>
          )}
        </Field>
      )}

      {/* Change calculation. The payment amount stays what is owed — this is
          only what the customer handed over, so the till total never inflates.
          Cashiers do this arithmetic in their heads all day; getting it wrong
          costs real money. */}
      {showAmount && value.method === 'cash' && Number(value.amount) > 0 && (
        <Field label="Cash given by customer" hint="Optional — fill in to work out the change">
          <MoneyInput value={value.tendered ?? ''} onChange={(tendered) => set({ tendered })} placeholder="0.00" />
          {Number(value.tendered) > 0 && (
            <div
              className={`mt-2 flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-bold ${
                Number(value.tendered) < Number(value.amount) ? 'bg-bad-soft text-bad' : 'bg-good-soft text-good'
              }`}
            >
              <span>
                {Number(value.tendered) < Number(value.amount) ? 'Short by' : 'Change to give'}
              </span>
              <span className="tnum text-lg">
                {fmt(Math.abs(Number(value.tendered) - Number(value.amount)))}
              </span>
            </div>
          )}
        </Field>
      )}

      {needsReference && (
        <Field
          label="Payment reference"
          hint={
            value.method === 'online'
              ? 'The Paystack reference, so this payment can be matched to the job later'
              : value.method === 'transfer'
                ? 'The narration or transaction ID on the alert'
                : 'The POS terminal receipt number'
          }
        >
          <input
            className="field"
            value={value.reference || ''}
            onChange={(e) => set({ reference: e.target.value })}
            placeholder="e.g. TRF/2024/889201"
          />
        </Field>
      )}
    </div>
  );
}
