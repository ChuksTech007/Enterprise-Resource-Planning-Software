'use client';

import { useEffect, useRef, useState } from 'react';
import { apiGet } from '@/lib/client';
import { Chip, Field } from './ui';

/**
 * Find a customer, or just type a new name.
 *
 * Cashiers must never be forced to "create a customer" before they can serve
 * someone. Typing a name is enough — the server matches on phone first, then
 * name, and only creates a record if there is genuinely no match. That is what
 * stops one person becoming three records with their debt split between them.
 */
export default function CustomerPicker({ value, onChange, allowWalkIn = true, label = 'Customer' }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }
    // Debounced so a slow connection is not hit on every keystroke.
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await apiGet('/api/customers', { q: query, limit: 8 });
        setResults(data.customers || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  function pick(customer) {
    onChange({ customerId: customer._id, customerName: customer.name, customerPhone: customer.phone });
    setQuery('');
    setOpen(false);
  }

  function clear() {
    onChange({ customerId: null, customerName: '', customerPhone: '' });
    setQuery('');
  }

  // A customer is already chosen — show it as a removable card.
  if (value?.customerId) {
    return (
      <Field label={label}>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-page px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate font-medium">{value.customerName}</p>
            {value.customerPhone ? <p className="truncate text-xs text-muted">{value.customerPhone}</p> : null}
          </div>
          <button type="button" onClick={clear} className="btn-ghost btn-sm shrink-0">
            Change
          </button>
        </div>
      </Field>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <Field label={label} hint={allowWalkIn ? 'Leave blank for a walk-in customer' : 'Type a name, or search an existing customer'}>
        <input
          className="field"
          value={value?.customerName || query}
          placeholder="Search or type a name"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            onChange({ customerId: null, customerName: e.target.value, customerPhone: value?.customerPhone || '' });
          }}
          onFocus={() => setOpen(true)}
        />
      </Field>

      {open && (query.length >= 2 || results.length > 0) && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-surface shadow-lg">
          {loading && <p className="px-3 py-3 text-sm text-muted">Searching…</p>}

          {!loading && results.length === 0 && (
            <p className="px-3 py-3 text-sm text-muted">
              No match. Keep typing — <span className="font-medium text-ink">{query}</span> will be added as a new
              customer.
            </p>
          )}

          {results.map((c) => (
            <button
              key={c._id}
              type="button"
              onClick={() => pick(c)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-page"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{c.name}</span>
                <span className="block truncate text-xs text-muted">{c.phone || 'No phone'}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {c.isRepeat ? <Chip tone="brand">Repeat</Chip> : null}
                {c.outstanding > 0 ? <Chip tone="bad">Owes</Chip> : null}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* A phone number is what makes a customer findable later, and what makes
          a balance reminder possible at all. Asked for, never demanded. */}
      {!value?.customerId && (value?.customerName || '').trim().length > 0 && (
        <Field label="Phone number" className="mt-3" hint="Needed to send a balance reminder later">
          <input
            className="field"
            type="tel"
            inputMode="tel"
            placeholder="0803 000 0000"
            value={value?.customerPhone || ''}
            onChange={(e) => onChange({ ...value, customerPhone: e.target.value })}
          />
        </Field>
      )}
    </div>
  );
}
