-- ── Legacy RLS cleanup (audit follow-up, path A) ───────────────────────────
-- Background: the 2026-04-18 audit found that bookings and overlay_elements
-- carried multiple *permissive* policies with USING/WITH CHECK of TRUE.
-- Postgres OR's permissive policies, so the narrow policies added in earlier
-- migrations (bookings_insert_public, bookings_update_streamer, etc.) were
-- never the gatekeeper — any anon or authenticated client could
-- insert/update arbitrary rows.
--
-- The most exploitable finding:
--   * overlay_elements."1st" granted ALL commands (SELECT/INSERT/UPDATE/DELETE)
--     to anon+authenticated with USING true. An attacker could set
--     price_value = 0 on any paid slot and book for free.
--   * bookings."bookings_update_anon" lets anon PostgREST clients
--     UPDATE status='denied' on any pending booking, bypassing the
--     cancel_token check in /api/stripe/cancel entirely.
--
-- The viewer page (src/app/overlay/page.tsx) still writes directly from
-- the browser to run queue advancement (status='active' + image_url swap)
-- and post-Solana bookkeeping (tx_signature / escrow_pda / viewer_wallet).
-- We keep those flows working via two layers:
--   1. A narrow RLS row policy for anon UPDATE.
--   2. Table-level REVOKE UPDATE from anon, replaced with a column-level
--      GRANT UPDATE (specific_cols) so anon physically cannot write to
--      price_value, profile_id, payment_intent_id, cancel_token,
--      original_amount_cents, approved_at, etc. even if RLS lets the row
--      through.
--
-- Remaining known gap (path B, separate PR): anon can still flip a
-- pending booking to status='denied' via direct PostgREST, so the cancel
-- DoS isn't fully closed until queue advancement + viewer denies move to
-- a server route that runs as service_role. Tracked as follow-up.

-- ─── bookings ──────────────────────────────────────────────────────────────
-- Drop the wide-open duplicates that were negating the narrow policies.
DROP POLICY IF EXISTS "allow public insert"               ON bookings;
DROP POLICY IF EXISTS "Authenticated can update bookings" ON bookings;
DROP POLICY IF EXISTS "allow authenticated update"        ON bookings;
DROP POLICY IF EXISTS "allow authenticated select"        ON bookings;

-- Column-level guard: even if RLS lets the row through, anon cannot
-- touch price/payment/cancel_token/profile_id columns.
REVOKE UPDATE ON TABLE bookings FROM anon;
GRANT  UPDATE (status, started_at, tx_signature, escrow_pda, viewer_wallet)
  ON TABLE bookings TO anon;

-- ─── overlay_elements ──────────────────────────────────────────────────────
-- The catastrophic "1st" policy (anon can do ANYTHING to any slot).
DROP POLICY IF EXISTS "1st" ON overlay_elements;

-- The viewer page still swaps image_url from the browser on queue advance.
-- Keep a narrow UPDATE policy and backstop it with column grants.
CREATE POLICY "elements_update_anon_image"
  ON overlay_elements FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

REVOKE UPDATE ON TABLE overlay_elements FROM anon;
GRANT  UPDATE (image_url) ON TABLE overlay_elements TO anon;

-- ─── profiles (hygiene: drop exact duplicates) ─────────────────────────────
-- These all overlapped with the profiles_* policies that gate on
-- auth.uid() = id. Dropping the duplicates removes noise but does not
-- change the effective permission set.
DROP POLICY IF EXISTS "users can insert own profile"   ON profiles;
DROP POLICY IF EXISTS "users can update own profile"   ON profiles;
DROP POLICY IF EXISTS "profiles are publicly readable" ON profiles;
