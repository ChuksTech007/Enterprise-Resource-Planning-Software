'use client';

/* ------------------------------------------------------------------ *
 * Talking to the API from the browser, with the network assumed to be
 * unreliable.
 *
 * Reads      -> plain fetch. The service worker serves the last good copy
 *               from cache when the network is down.
 * Writes     -> tried immediately; if the network is gone the request is
 *               parked in IndexedDB and replayed once it returns.
 *
 * Every queued write carries a `clientRef`, and the server refuses to act on
 * the same `clientRef` twice, so a replay can never duplicate a sale, a
 * payment or a job.
 * ------------------------------------------------------------------ */

const DB_NAME = 'printpress';
const STORE = 'outbox';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const result = fn(store);
    tx.oncomplete = () => resolve(result?.result ?? result);
    tx.onerror = () => reject(tx.error);
  });
}

export function newClientRef() {
  return (
    'c' +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
}

export async function queueSize() {
  try {
    return await withStore('readonly', (s) => s.count());
  } catch {
    return 0;
  }
}

export async function queuedItems() {
  try {
    return (await withStore('readonly', (s) => s.getAll())) || [];
  } catch {
    return [];
  }
}

async function enqueue(item) {
  await withStore('readwrite', (s) => s.put(item));
  notify();
}

async function dequeue(id) {
  await withStore('readwrite', (s) => s.delete(id));
  notify();
}

/* --------------------------- subscribers --------------------------- */

const listeners = new Set();
export function onQueueChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() {
  queueSize().then((n) => listeners.forEach((fn) => fn(n)));
}

/* ------------------------------ fetch ------------------------------ */

export class ApiClientError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function parse(res) {
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiClientError('The server sent back something unreadable', res.status);
  }
  if (!res.ok) {
    // A 401 means the session expired — send them back to sign in.
    if (res.status === 401 && typeof window !== 'undefined') {
      window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname);
    }
    throw new ApiClientError(data.error || 'Request failed', res.status);
  }
  return data;
}

export async function apiGet(path, params) {
  const url = new URL(path, window.location.origin);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  const res = await fetch(url, { credentials: 'same-origin' });
  return parse(res);
}

/**
 * Send a write.
 *
 * `queue: true` (the default for POST) means: if the network is unavailable,
 * accept the entry, store it, and tell the caller it is queued. The cashier
 * keeps serving customers; the data syncs when the signal comes back.
 */
export async function apiSend(path, method, body, { queue = true } = {}) {
  const payload = { ...(body || {}) };

  // Only writes that create money-bearing records need a clientRef.
  if (queue && method === 'POST' && !payload.clientRef) {
    payload.clientRef = newClientRef();
  }

  const doFetch = () =>
    fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

  if (queue && typeof navigator !== 'undefined' && navigator.onLine === false) {
    await enqueue({ id: payload.clientRef, path, method, payload, at: Date.now() });
    return { queued: true, clientRef: payload.clientRef };
  }

  try {
    return await parse(await doFetch());
  } catch (err) {
    // A genuine network failure (not a 4xx/5xx from the server).
    const isNetwork = !(err instanceof ApiClientError);
    if (isNetwork && queue) {
      await enqueue({ id: payload.clientRef, path, method, payload, at: Date.now() });
      return { queued: true, clientRef: payload.clientRef };
    }
    throw err;
  }
}

export const apiPost = (path, body, opts) => apiSend(path, 'POST', body, opts);
export const apiPatch = (path, body, opts) => apiSend(path, 'PATCH', body, { queue: false, ...opts });
export const apiPut = (path, body, opts) => apiSend(path, 'PUT', body, { queue: false, ...opts });
export const apiDelete = (path, body) => apiSend(path, 'DELETE', body, { queue: false });

/* ------------------------------ replay ----------------------------- */

let flushing = false;

/** Replay everything waiting in the outbox, oldest first. */
export async function flushQueue() {
  if (flushing || (typeof navigator !== 'undefined' && navigator.onLine === false)) return { sent: 0 };
  flushing = true;

  let sent = 0;
  let failed = 0;

  try {
    const items = (await queuedItems()).sort((a, b) => a.at - b.at);

    for (const item of items) {
      try {
        const res = await fetch(item.path, {
          method: item.method,
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload),
        });

        if (res.ok) {
          await dequeue(item.id);
          sent++;
          continue;
        }

        if (res.status === 401) break; // signed out — stop and keep the queue

        if (res.status >= 400 && res.status < 500) {
          // The server rejected it on its merits (bad data, till closed).
          // Retrying forever will not help, so park it for the user to see.
          const data = await res.json().catch(() => ({}));
          await withStore('readwrite', (s) => s.put({ ...item, error: data.error || 'Rejected', failedAt: Date.now() }));
          failed++;
          continue;
        }

        break; // 5xx — server trouble, try again later
      } catch {
        break; // network dropped again mid-flush
      }
    }
  } finally {
    flushing = false;
    notify();
  }

  return { sent, failed };
}

/** Throw away a queued write that the server refused. */
export async function discardQueued(id) {
  await dequeue(id);
}

/** Wire up automatic replay. Called once by the app shell. */
export function startSync() {
  if (typeof window === 'undefined') return () => {};

  const onOnline = () => flushQueue();
  window.addEventListener('online', onOnline);

  // Also retry periodically: a phone can report "online" while the connection
  // is still useless, which is very common on Nigerian mobile data.
  const timer = setInterval(() => {
    if (navigator.onLine) flushQueue();
  }, 30000);

  flushQueue();

  return () => {
    window.removeEventListener('online', onOnline);
    clearInterval(timer);
  };
}
