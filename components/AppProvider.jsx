'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiGet, startSync, onQueueChange, queueSize, flushQueue } from '@/lib/client';

const Ctx = createContext(null);

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

export function AppProvider({ initialUser, initialSettings, children }) {
  const [user, setUser] = useState(initialUser);
  const [settings, setSettings] = useState(initialSettings || {});
  const [openRegister, setOpenRegister] = useState(null);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [toasts, setToasts] = useState([]);

  /* ------------------------- connection ------------------------- */

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    queueSize().then(setPending);
    const off = onQueueChange(setPending);
    const stop = startSync();
    return () => {
      off();
      stop();
    };
  }, []);

  /* --------------------------- toasts --------------------------- */

  const toast = useCallback((message, tone = 'good') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'bad' ? 6000 : 3500);
  }, []);

  /* --------------------------- session -------------------------- */

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet('/api/auth/me');
      setUser(data.user);
      setSettings(data.settings || {});
      setOpenRegister(data.openRegister || null);
    } catch {
      /* offline — keep showing what we already have */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /* ---------------------------- money --------------------------- */

  const currency = settings?.currency || '₦';

  const fmt = useCallback(
    (n, { decimals = true } = {}) => {
      const v = Number(n) || 0;
      return (
        currency +
        v.toLocaleString('en-NG', {
          minimumFractionDigits: decimals ? 2 : 0,
          maximumFractionDigits: decimals ? 2 : 0,
        })
      );
    },
    [currency]
  );

  const value = useMemo(
    () => ({
      user,
      isOwner: user?.role === 'owner',
      settings,
      setSettings,
      currency,
      fmt,
      online,
      pending,
      openRegister,
      setOpenRegister,
      refresh,
      toast,
      sync: flushQueue,
    }),
    [user, settings, currency, fmt, online, pending, openRegister, refresh, toast]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <Toaster toasts={toasts} />
    </Ctx.Provider>
  );
}

function Toaster({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto w-full max-w-sm rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
            t.tone === 'bad' ? 'bg-bad text-white' : t.tone === 'warn' ? 'bg-warn text-white' : 'bg-ink text-white'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
