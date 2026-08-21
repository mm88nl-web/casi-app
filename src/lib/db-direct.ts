// Direct Postgres connection — bypasses the Supabase REST/PostgREST gateway
// entirely. Added 2026-08-21 as an outage workaround: the project's free-tier
// egress quota was exceeded, and Supabase 402s every REST/Auth/Realtime call
// until the quota resets or the org upgrades to Pro. The raw Postgres port
// (db.<ref>.supabase.co:5432) is gated separately and was confirmed reachable
// with a real authenticated connection during the outage.
//
// This connects as the `postgres` role, which bypasses RLS entirely — every
// caller of this pool is responsible for its own authorization (see
// verify-session-local.ts for the write side; the OBS read route only
// exposes columns already public under the normal anon RLS policies).
//
// Safe to delete this whole file (and its two call sites) once the quota
// resets or Pro is purchased and the normal supabase-js path is reliable
// again — nothing else in the app depends on it.
import { Pool } from 'pg';

let pool: Pool | null = null;

export function getDirectPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set — direct-Postgres bypass unavailable');
    }
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pool;
}
