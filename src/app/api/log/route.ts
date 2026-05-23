/**
 * POST /api/log
 *
 * Receives client-side error reports from ClientErrorReporter and feeds them
 * through the same `logError` helper as server code so every error lands in
 * one place (Vercel logs + optional webhook).
 *
 * Rate-limited in-memory: 20 requests per IP per 60 s. If the process gets
 * recycled the window resets — that's fine, we're protecting against a
 * single noisy tab, not DDoS. Cloudflare / Vercel handle the rest.
 *
 * Intentionally does NOT touch the DB. Client errors should never cost us a
 * row write.
 */
import { NextResponse } from 'next/server';
import { logErrorAsync } from '@/lib/observability';

const MAX_MESSAGE_LEN = 500;
const MAX_STACK_LEN   = 4000;
const MAX_URL_LEN     = 600;
const WINDOW_MS       = 60_000;
const WINDOW_LIMIT    = 20;

type Bucket = { count: number; resetAt: number };
const ipBuckets = new Map<string, Bucket>();

function getClientIp(req: Request): string {
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return 'unknown';
}

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const b = ipBuckets.get(ip);
  if (!b || now > b.resetAt) {
    ipBuckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (b.count >= WINDOW_LIMIT) return false;
  b.count += 1;
  return true;
}

function clamp(s: unknown, max: number): string | undefined {
  if (typeof s !== 'string') return undefined;
  return s.length > max ? s.slice(0, max) : s;
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  if (!rateLimit(ip)) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { message, stack, url, extra } = body as Record<string, unknown>;
  const safeMessage = clamp(message, MAX_MESSAGE_LEN);
  if (!safeMessage) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Await the async variant so the Vercel lambda doesn't terminate before
  // the Discord/webhook POST completes. The fire-and-forget logError() was
  // being cut off at the 5s function timeout before Discord confirmed receipt.
  await logErrorAsync('client', new Error(safeMessage), {
    stack: clamp(stack, MAX_STACK_LEN),
    url:   clamp(url, MAX_URL_LEN),
    ua:    req.headers.get('user-agent')?.slice(0, 300) || null,
    extra: typeof extra === 'object' && extra !== null ? extra : undefined,
  });

  return NextResponse.json({ ok: true });
}
