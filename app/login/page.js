'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiPost } from '@/lib/client';
import { ErrorNote, Field, Spinner } from '@/components/ui';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      // Never queued: signing in offline is meaningless.
      await apiPost('/api/auth/login', { username, password }, { queue: false });
      const next = params.get('next') || '/';
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err.message || 'Could not sign you in');
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-2xl text-white">
            🖨
          </div>
          <h1 className="text-xl font-bold">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Framing, printing and canvas — quotes, jobs and the books</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-5">
          {error ? <ErrorNote>{error}</ErrorNote> : null}

          <Field label="Username">
            <input
              className="field"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              required
              autoFocus
            />
          </Field>

          <Field label="Password">
            <input
              className="field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>

          <button className="btn-primary w-full" disabled={busy}>
            {busy ? <Spinner /> : null}
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-faint">
          Forgotten your password? The owner can reset it under Staff.
        </p>
      </div>
    </main>
  );
}
