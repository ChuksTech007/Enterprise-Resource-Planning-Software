'use client';

import { useEffect } from 'react';

/**
 * What the shop sees when a screen fails.
 *
 * Without this, Next.js shows a bare white page reading "a client-side
 * exception has occurred (see the browser console)". Nobody standing at a
 * counter is going to open a browser console, so the shop's only move is to
 * ring somebody — without the one fact that would make the call short.
 *
 * So: say what broke, keep the rest of the app reachable, and put the details
 * on screen where they can be photographed and sent.
 */
export default function AppError({ error, reset }) {
  useEffect(() => {
    console.error('[app]', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-10">
      <h1 className="text-xl font-bold text-bad">This screen could not open</h1>

      <p className="text-sm text-muted">
        Nothing has been lost — everything already saved is safe. Try again, and if it keeps
        happening send the details below to whoever set this up.
      </p>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => reset()} className="btn-primary">
          Try again
        </button>
        <a href="/" className="btn-secondary">
          Back to the dashboard
        </a>
      </div>

      <div className="rounded-card border border-line bg-surface p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
          Details — photograph this
        </p>
        <p className="break-words font-mono text-sm">{error?.message || 'No message was given.'}</p>
        {error?.digest ? (
          <p className="mt-2 font-mono text-xs text-muted">reference: {error.digest}</p>
        ) : null}
        {error?.stack ? (
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-page p-2 font-mono text-[11px] leading-snug text-muted">
            {error.stack}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
