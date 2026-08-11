-- ── abuse_reports table (retroactive) ───────────────────────────────────────
--
-- This table was originally specified in 20260419000000_p0_hardening.sql but
-- was never actually applied to production — confirmed 2026-08-10 via
-- to_regclass('public.abuse_reports') returning null. /api/abuse/report has
-- been calling .from('abuse_reports') against a table that doesn't exist,
-- so every submission has been failing with a 500 ("Failed to save report").
--
-- Only the table-creation half of that old migration is replayed here. Its
-- other half (a permissive bookings_insert_public INSERT policy) is NOT
-- reapplied — bookings currently has no anon INSERT policy at all (confirmed
-- via pg_policies), meaning a later migration already fully closed direct
-- anon inserts in favor of the service-role-gated /api/bookings/create-*
-- routes. Reapplying that old policy would reopen a direct-insert path that
-- was deliberately shut. See AGENTS.md's RLS section.

CREATE TABLE IF NOT EXISTS abuse_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  kind            text NOT NULL CHECK (kind IN ('dmca', 'illegal', 'harassment', 'other')),
  reporter_email  text NOT NULL,
  reporter_name   text,
  target_url      text,
  target_username text,
  description     text NOT NULL,
  status          text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'investigating', 'actioned', 'rejected')),
  handled_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  handled_at      timestamptz,
  handler_notes   text,
  reporter_ip_hash text
);

CREATE INDEX IF NOT EXISTS abuse_reports_status_created_idx
  ON abuse_reports (status, created_at DESC);

-- /api/abuse/report's new per-target_username aggregate cap (2026-08-10,
-- see docs/fable-spam-abuse-review-2026-08-10.md Finding 5) queries
-- (target_username, created_at) directly — index it so that check stays
-- cheap under report volume instead of a sequential scan.
CREATE INDEX IF NOT EXISTS abuse_reports_target_username_created_idx
  ON abuse_reports (target_username, created_at DESC)
  WHERE target_username IS NOT NULL;

-- The route's pre-existing per-IP cap queries (reporter_ip_hash, created_at)
-- the same way — index it too rather than leaving one of the two rate-limit
-- checks unindexed.
CREATE INDEX IF NOT EXISTS abuse_reports_ip_hash_created_idx
  ON abuse_reports (reporter_ip_hash, created_at DESC)
  WHERE reporter_ip_hash IS NOT NULL;

ALTER TABLE abuse_reports ENABLE ROW LEVEL SECURITY;

-- Anon can insert (via API route which validates + adds ip hash + Turnstile).
-- Only service role reads — platform operators go through admin tooling.
CREATE POLICY "abuse_reports_insert_public"
  ON abuse_reports FOR INSERT
  WITH CHECK (true);
