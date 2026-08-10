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
 * For a limit that must hold across instances, use `distributedRateLimit`
 * below instead.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/observability';

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

/**
 * Distributed sliding-window rate limit backed by Postgres — holds across
 * concurrent Vercel serverless instances, unlike `inMemoryRateLimit`.
 *
 * Calls the `delegate_rate_limit_hit` DB function (see migrations
 * `20260810120144_delegate_rate_limit.sql` and
 * `20260810120251_delegate_rate_limit_hit_revoke_anon.sql`), which atomically
 * increments a per-streamer counter in a single UPSERT statement, resetting it if
 * `windowSecs` has elapsed since the window started. Returns true if the
 * post-increment count is still within `limit`.
 *
 * Fails CLOSED on any DB/RPC error: this exists specifically to protect the
 * shared cranker's SOL from a self-dealing streamer, so "we couldn't verify
 * the caller is under the limit" must deny, not allow. Callers already have
 * a safe fallback for a denied delegated op — the admin UI drops to a
 * wallet-signed popup — so failing closed here just costs one extra popup,
 * never a stuck action.
 */
export async function distributedRateLimit(
  supabase: SupabaseClient,
  streamerId: string,
  limit: number,
  windowSecs: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('delegate_rate_limit_hit', {
    p_streamer_id: streamerId,
    p_window_secs: windowSecs,
  });
  if (error) {
    logError('rate-limit', error, { streamer_id: streamerId, scope: 'distributedRateLimit' });
    return false;
  }
  return (data as number) <= limit;
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
