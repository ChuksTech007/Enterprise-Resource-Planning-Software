'use client';

import { useEffect } from 'react';

export default function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // Registered after load so it never competes with the first paint on a
    // slow connection.
    /* The build id rides along in the query string.
         *
         * A browser only treats a worker as new when its URL or bytes change,
         * and sw.js is identical from build to build. Without this the worker
         * installed on day one keeps serving HTML it cached then, pointing at
         * script files later builds deleted. */
        const version = process.env.NEXT_PUBLIC_BUILD_ID || 'dev';
        const register = () => navigator.serviceWorker.register(`/sw.js?v=${version}`).catch(() => {});
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register);
  }, []);

  return null;
}
