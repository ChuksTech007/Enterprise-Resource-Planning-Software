'use client';

import { useEffect, useRef } from 'react';

/* ------------------------------------------------------------------ *
 * Shared building blocks. Everything here is deliberately plain — the
 * people using this app care that the number is right and the button is
 * big enough, not that anything is clever.
 * ------------------------------------------------------------------ */

export function Card({ className = '', children, ...rest }) {
  return (
    <div className={`card ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="text-base font-semibold text-ink">{children}</h2>
      {action}
    </div>
  );
}

/**
 * A stat tile is a hero number, not a chart. Proportional figures (not
 * tabular) because it stands alone; tabular is for columns that must align.
 */
export function StatTile({ label, value, sub, tone = 'default', icon }) {
  const tones = {
    default: 'text-ink',
    good: 'text-good',
    warn: 'text-warn',
    bad: 'text-bad',
    brand: 'text-brand',
  };
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 text-sm font-medium text-muted">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`mt-1 text-2xl font-bold leading-tight ${tones[tone]}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-faint">{sub}</div> : null}
    </div>
  );
}

const CHIP_TONES = {
  neutral: 'bg-page text-muted',
  brand: 'bg-brand-soft text-brand-ink',
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-info-soft text-info-ink',
};

export function Chip({ tone = 'neutral', children, className = '' }) {
  return <span className={`chip ${CHIP_TONES[tone]} ${className}`}>{children}</span>;
}

/* Status vocabularies shared across every screen, so a job in "printing"
 * looks the same on the dashboard, the job list and the job page. */

export const JOB_STATUS_META = {
  quote: { label: 'Quote', tone: 'neutral' },
  approved: { label: 'Approved', tone: 'info' },
  printing: { label: 'Printing', tone: 'brand' },
  finishing: { label: 'Finishing', tone: 'brand' },
  done: { label: 'Done', tone: 'good' },
  delivered: { label: 'Delivered', tone: 'good' },
  cancelled: { label: 'Cancelled', tone: 'bad' },
};

export const PAY_STATUS_META = {
  unpaid: { label: 'Unpaid', tone: 'bad' },
  partial: { label: 'Part paid', tone: 'warn' },
  paid: { label: 'Paid', tone: 'good' },
  refunded: { label: 'Refunded', tone: 'neutral' },
};

export const COLLECTION_META = {
  not_ready: { label: 'Not ready', tone: 'neutral' },
  ready: { label: 'Ready for pickup', tone: 'warn' },
  collected: { label: 'Collected', tone: 'good' },
};

export function StatusChip({ status, map = JOB_STATUS_META }) {
  const meta = map[status] || { label: status, tone: 'neutral' };
  return <Chip tone={meta.tone}>{meta.label}</Chip>;
}

/* ---------------------------- feedback ----------------------------- */

export function Spinner({ className = '' }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
      aria-hidden="true"
    />
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-muted">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, hint, action }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="font-medium text-ink">{title}</p>
      {hint ? <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{hint}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return (
    <div role="alert" className="rounded-lg bg-bad-soft px-3 py-2.5 text-sm font-medium text-bad">
      {children}
    </div>
  );
}

/* ------------------------------ modal ------------------------------ */

/**
 * Full-screen sheet on a phone, centred dialog on a desktop. Closes on
 * Escape and on a backdrop tap.
 */
export function Modal({ open, onClose, title, children, footer, wide = false }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === ref.current && onClose?.()}
      ref={ref}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-surface shadow-xl sm:rounded-2xl ${
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'
        }`}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="btn-ghost btn-sm -mr-2" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer ? <div className="border-t border-line p-4">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------ forms ------------------------------ */

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <div className={className}>
      {label ? <label className="label">{label}</label> : null}
      {children}
      {hint && !error ? <p className="mt-1 text-xs text-faint">{hint}</p> : null}
      {error ? <p className="mt-1 text-xs font-medium text-bad">{error}</p> : null}
    </div>
  );
}

/** Numeric entry that opens the number pad on a phone. */
export function MoneyInput({ value, onChange, placeholder = '0.00', ...rest }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      className="field tnum text-right text-lg font-semibold"
      value={value}
      placeholder={placeholder}
      onChange={(e) => {
        const v = e.target.value;
        // Let the field hold a partially typed number without fighting the user.
        if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) onChange(v);
      }}
      {...rest}
    />
  );
}

export function Segmented({ options, value, onChange, className = '' }) {
  return (
    <div className={`flex gap-1 overflow-x-auto rounded-lg bg-page p-1 ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition ${
            value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
