'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPut } from '@/lib/client';
import { useApp } from '@/components/AppProvider';
import { Card, ErrorNote, Field, Loading, SectionTitle, Spinner } from '@/components/ui';

export default function SettingsPage() {
  const { toast, refresh } = useApp();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiGet('/api/settings').then((d) => setForm(d.settings)).catch((e) => setError(e.message));
  }, []);

  if (!form) return error ? <ErrorNote>{error}</ErrorNote> : <Loading />;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setBusy(true);
    setError('');
    try {
      await apiPut('/api/settings', form);
      toast('Settings saved');
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Settings</h1>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <Card className="space-y-3 p-4">
        <SectionTitle>Your business</SectionTitle>
        <p className="text-xs text-muted">This is what prints at the top of every receipt and invoice.</p>

        <Field label="Business name">
          <input className="field" value={form.businessName || ''} onChange={(e) => set({ businessName: e.target.value })} />
        </Field>
        <Field label="Address">
          <textarea className="field" rows={2} value={form.address || ''} onChange={(e) => set({ address: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Phone">
            <input className="field" value={form.phone || ''} onChange={(e) => set({ phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <input className="field" value={form.email || ''} onChange={(e) => set({ email: e.target.value })} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Currency symbol">
            <input className="field" value={form.currency || '₦'} onChange={(e) => set({ currency: e.target.value })} />
          </Field>
        </div>
        <Field label="Receipt footer">
          <input
            className="field"
            value={form.receiptFooter || ''}
            onChange={(e) => set({ receiptFooter: e.target.value })}
            placeholder="Thank you for your patronage."
          />
        </Field>
      </Card>

      <Card className="space-y-3 p-4">
        <SectionTitle>Daily takings summary</SectionTitle>
        <p className="text-xs text-muted">
          Where the end-of-day summary goes. The WhatsApp number gets you a one-tap send button; the email address is
          used if you set up automatic sending (see the README).
        </p>

        <Field
          label="Your WhatsApp number"
          hint="With or without the country code — 08031234567 works"
        >
          <input
            className="field"
            type="tel"
            value={form.ownerWhatsapp || ''}
            onChange={(e) => set({ ownerWhatsapp: e.target.value })}
            placeholder="08031234567"
          />
        </Field>

        <Field label="Your email address">
          <input
            className="field"
            type="email"
            value={form.ownerEmail || ''}
            onChange={(e) => set({ ownerEmail: e.target.value })}
          />
        </Field>
      </Card>

      <button onClick={save} disabled={busy} className="btn-primary w-full">
        {busy ? <Spinner /> : null}
        Save settings
      </button>
    </div>
  );
}
