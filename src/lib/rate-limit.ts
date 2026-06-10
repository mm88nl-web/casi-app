/**
 * rate-limit.ts
 *
 * Tiny in-memory sliding-window rate limiter shared by API routes that need a
 * cheap abuse speed-bump without a DB round-trip on the hot path.
 *
 * IMPORTANT trade-off: buckets live in the lambda's process memory, so the
 * limit is per-instance and resets on cold start — it is NOT shared across
 * concurrent serverless instances. This is the same model as /api/log: a
 * deterrent against a single hot caller, not a hard distributed guarantee.
 * For a limit that must hold across instances, use a DB-backed counter.
 */

type Bucket = { count: number; resetAt: number };

const stores = new Map<string, Map<string, Bucket>>();

/**
 * Returns true if the call is allowed, false if the key has exceeded `limit`
 * within the current `windowMs`. `namespace` keeps unrelated limiters from
 * sharing buckets (e.g. 'cranker' vs 'stripe-authorize').
 */
export function inMemoryRateLimit(
  namespace: string,
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  let store = stores.get(namespace);
  if (!store) {
    store = new Map();
    stores.set(namespace, store);
  }
  const now = Date.now();
  const b = store.get(key);
  if (!b || now > b.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count += 1;
  return true;
}

/** Best-effort client IP from proxy headers (Vercel sets x-real-ip). */
export function clientIpFrom(req: Request): string {
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return 'unknown';
}
