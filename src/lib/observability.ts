// Thin observability layer for server + client errors.
//
// No SaaS dependency on purpose: every log goes to stdout in a structured
// JSON shape so Vercel's log drain (or `vercel logs` locally) captures it
// without extra config. If ERROR_WEBHOOK_URL is set (Slack / Discord /
// Logflare / Better Stack) we also fan out a fire-and-forget POST so the
// on-call person gets a ping without having to grep logs.
//
// Keep the surface tiny — if this needs Sentry-level fidelity later, drop
// @sentry/nextjs in and replace the `logError` call sites. Until then the
// shape below is enough to find the needle.

type LogLevel = 'error' | 'warn' | 'info';

export type LogEntry = {
  level: LogLevel;
  scope: string;
  message: string;
  stack?: string;
  extra?: Record<string, unknown>;
  ts: string;
};

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

function errorStack(err: unknown): string | undefined {
  if (err instanceof Error && err.stack) return err.stack;
  return undefined;
}

async function forwardToWebhook(entry: LogEntry): Promise<void> {
  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;
  // Bounded: a slow webhook must not stall the request handler that fired it.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
      signal: controller.signal,
    });
  } catch {
    // Swallow: we already logged locally, and we don't want the webhook
    // itself to throw and mask the original error.
  } finally {
    clearTimeout(timer);
  }
}

function emit(entry: LogEntry): void {
  // console.error / console.warn go to stderr on Node which Vercel keeps
  // separate from stdout — easier to filter in the dashboard.
  const line = JSON.stringify(entry);
  if (entry.level === 'error') console.error(line);
  else if (entry.level === 'warn') console.warn(line);
  else console.log(line);
  // Don't await — caller shouldn't block on webhook delivery.
  void forwardToWebhook(entry);
}

export function logError(
  scope: string,
  err: unknown,
  extra?: Record<string, unknown>,
): void {
  emit({
    level: 'error',
    scope,
    message: errorMessage(err),
    stack: errorStack(err),
    extra,
    ts: new Date().toISOString(),
  });
}

export function logWarn(
  scope: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  emit({ level: 'warn', scope, message, extra, ts: new Date().toISOString() });
}
