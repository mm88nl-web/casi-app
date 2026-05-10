/**
 * Tiny helper to fan client-side errors out to /api/log → ERROR_WEBHOOK_URL
 * (Discord/Slack/Better Stack). The global ClientErrorReporter only catches
 * window.onerror + unhandledrejection, so any error that gets handled inside
 * a try/catch (booking flow, wallet signing, etc.) needs to opt in here.
 *
 * Shape mirrors the body shape /api/log already accepts. Keeps `keepalive`
 * true so a navigation away mid-error still posts.
 */
export function reportClientError(
  scope: string,
  err: unknown,
  extra?: Record<string, unknown>,
): void {
  if (typeof window === 'undefined') return;
  const message = err instanceof Error ? err.message : String(err ?? 'unknown');
  const stack   = err instanceof Error ? err.stack : undefined;
  try {
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `[${scope}] ${message}`,
        stack,
        url: window.location.href,
        extra: { scope, ...(extra ?? {}) },
      }),
      keepalive: true,
    }).catch(() => { /* swallow — best-effort reporter */ });
  } catch {
    /* swallow */
  }
}
