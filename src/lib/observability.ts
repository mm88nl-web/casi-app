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

function isDiscordWebhook(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'discord.com' || host === 'discordapp.com'
      || host.endsWith('.discord.com') || host.endsWith('.discordapp.com');
  } catch {
    return false;
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

// Discord rejects arbitrary JSON — it expects {content} or {embeds}. Adapter
// renders one color-coded embed per entry; everything else (Slack, Better
// Stack, Logflare) keeps receiving the raw LogEntry shape.
function formatForDiscord(entry: LogEntry): unknown {
  const color = entry.level === 'error' ? 0xE03131
    : entry.level === 'warn' ? 0xF59F00
    : 0x4263EB;
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];
  if (entry.stack) {
    fields.push({ name: 'stack', value: truncate('```\n' + entry.stack + '\n```', 1024) });
  }
  if (entry.extra && Object.keys(entry.extra).length > 0) {
    let extraStr: string;
    try { extraStr = JSON.stringify(entry.extra, null, 2); } catch { extraStr = String(entry.extra); }
    fields.push({ name: 'extra', value: truncate('```json\n' + extraStr + '\n```', 1024) });
  }
  return {
    embeds: [{
      title: truncate(`[${entry.level}] ${entry.scope}`, 256),
      description: truncate(entry.message || '(no message)', 4000),
      color,
      fields,
      timestamp: entry.ts,
    }],
  };
}

async function forwardToWebhook(entry: LogEntry): Promise<void> {
  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;
  const body = isDiscordWebhook(url) ? formatForDiscord(entry) : entry;
  // Bounded: a slow webhook must not stall the request handler that fired it.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
