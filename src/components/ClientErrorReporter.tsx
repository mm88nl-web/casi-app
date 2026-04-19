"use client";
import { useEffect } from 'react';

/**
 * ClientErrorReporter
 *
 * Wires window.onerror + unhandledrejection to /api/log so uncaught errors
 * in any page end up in the same log stream as server errors. Runs once at
 * layout level — mount it in RootLayout.
 *
 * Dedupe keyed by `message + first stack frame`: if a render loop throws
 * the same error 60 times a second, we only post it once within a 10 s
 * window. Keeps /api/log from melting and Vercel bills sane.
 */
const DEDUPE_WINDOW_MS = 10_000;
const MAX_IN_FLIGHT    = 10;

export default function ClientErrorReporter() {
  useEffect(() => {
    const seen = new Map<string, number>();
    let inFlight = 0;

    const report = (message: string, stack: string | undefined) => {
      const firstFrame = (stack || '').split('\n')[1]?.trim() || '';
      const key = `${message}::${firstFrame}`;
      const now = Date.now();
      const last = seen.get(key);
      if (last && now - last < DEDUPE_WINDOW_MS) return;
      seen.set(key, now);

      // Trim the dedupe map periodically so it doesn't grow unbounded on
      // a long-lived tab.
      if (seen.size > 200) {
        for (const [k, t] of seen) {
          if (now - t > DEDUPE_WINDOW_MS) seen.delete(k);
        }
      }

      if (inFlight >= MAX_IN_FLIGHT) return;
      inFlight += 1;

      // keepalive lets the POST finish even if the tab is navigating away
      // — important for errors fired during unload.
      fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          stack,
          url: typeof window !== 'undefined' ? window.location.href : undefined,
        }),
        keepalive: true,
      })
        .catch(() => {})
        .finally(() => { inFlight -= 1; });
    };

    const onError = (e: ErrorEvent) => {
      const msg = e.message || (e.error instanceof Error ? e.error.message : 'unknown error');
      const stack = e.error instanceof Error ? e.error.stack : undefined;
      report(msg, stack);
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      const msg = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      report(`unhandledrejection: ${msg}`, stack);
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
