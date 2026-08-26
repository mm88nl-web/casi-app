-- ── Scope bookings/flashes SELECT to close cross-account + dead-column leaks ──
--
-- Found during a self-audit (2026-08-26) prompted by a Reddit post about
-- common IDOR/RLS mistakes in AI-built apps. Two real gaps, both closed here
-- without changing any app behavior:
--
--   1. `bookings_select_public` / `flashes_select_public` are `USING (true)`
--      for EVERY role, including `authenticated`. That means any signed-in
--      streamer can read every OTHER streamer's bookings/flashes — full
--      cross-account read, not just the anon/public case. The studio
--      dashboard only ever queries its own logged-in profile's rows, so
--      scoping `authenticated` to `auth.uid() = profile_id` is a pure
--      hardening with zero functional change.
--
--   2. `flashes` never got the column-level GRANT treatment `bookings` got in
--      20260423000000_hide_cancel_token_from_select.sql — it still has a
--      bare table-level SELECT grant, so `payment_intent_id` (a Stripe
--      identifier with no legitimate anon use) is readable by anyone via a
--      raw PostgREST call even though no client query ever selects it.
--      `bookings` already hides `cancel_token` this way; this migration adds
--      `payment_intent_id` to bookings' hidden-from-anon list too — grepped
--      across src/app/overlay/page.tsx (the only anon-facing consumer) and
--      confirmed it's never read, only ever included in an unused SELECT
--      string alongside truly-needed fields like tx_signature/escrow_pda/
--      viewer_wallet (which the client-side Solana recovery flow genuinely
--      needs and which are public on-chain data anyway).
--
-- Column lists below were pulled live from information_schema.column_privileges
-- on the production project (axdedtgbjcmfurdrbbmx), not reconstructed from
-- migration history — bookings picked up banner_font_px/banner_speed_secs/
-- media_offset_x/media_offset_y/media_zoom/ended_at grants across three later
-- migrations (20260430000000, 20260509020000) that a manual re-read of just
-- 20260423000000's grant list would have missed and silently un-granted.
--
-- NOT changed here, on purpose: the `anon` row policy stays `USING (true)`
-- on both tables. Viewers have no real auth session, so "is this booking
-- mine" is currently checked client-side by matching viewer_name/
-- viewer_wallet — values the requester supplies, which RLS can't treat as
-- proof of identity. That means any anon caller can still read pending/
-- denied rows platform-wide (viewer_name, message, image_url, wallet,
-- escrow_pda) via a raw API call, same as before this migration. Closing
-- that for real means giving each booking a per-viewer lookup token (the
-- same pattern `cancel_token` already uses) and moving the "check my
-- booking" / "recover my USDC" queries in overlay/page.tsx behind it —
-- an app-code change, not a policy change, and out of scope for this
-- migration. Flagged for a follow-up, not silently left unfixed.

-- ── bookings: authenticated reads scoped to own profile ────────────────────
DROP POLICY IF EXISTS "bookings_select_public" ON bookings;

CREATE POLICY "bookings_select_public"
  ON bookings FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "bookings_select_owner"
  ON bookings FOR SELECT
  TO authenticated
  USING (auth.uid() = profile_id);

-- ── bookings: drop payment_intent_id from the anon-readable column set ─────
-- (authenticated keeps it — studio/page.tsx:98 reads it for the owning
-- streamer's own bookings, now safely scoped by bookings_select_owner above)
REVOKE SELECT ON TABLE bookings FROM anon;

GRANT SELECT (
  id,
  created_at,
  profile_id,
  viewer_name,
  image_url,
  message,
  price_value,
  price_unit,
  status,
  started_at,
  duration_minutes,
  element_id,
  queue_position,
  approved_at,
  is_queued,
  original_amount_cents,
  stream_id,
  payment_method,
  tx_signature,
  escrow_pda,
  viewer_wallet,
  storage_path,
  file_type,
  banner_font_px,
  banner_speed_secs,
  media_offset_x,
  media_offset_y,
  media_zoom,
  ended_at
) ON TABLE bookings TO anon;

-- ── flashes: authenticated reads scoped to own profile ──────────────────────
DROP POLICY IF EXISTS "flashes_select_public" ON flashes;

CREATE POLICY "flashes_select_public"
  ON flashes FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "flashes_select_owner"
  ON flashes FOR SELECT
  TO authenticated
  USING (auth.uid() = profile_id);

-- ── flashes: move off the bare table-level grant, same as bookings ─────────
-- flashes never had an explicit column-level grant before this migration —
-- it was still on the implicit full-table default, confirmed live via
-- information_schema.column_privileges (15 columns, unrestricted). This is
-- flashes' first column-level grant, mirroring the bookings pattern:
-- excludes payment_intent_id from anon (never selected by any anon-facing
-- query — overlay/page.tsx's FLASH_COLS and HIST_FLASH_COLS both omit it,
-- confirmed by grep); authenticated keeps the full live column set,
-- including payment_intent_id and settle_tx_signature, since neither
-- appears in any src/ code path (client or server) as of this migration —
-- left alone rather than guessed at, to avoid trimming something that
-- turns out to matter.
REVOKE SELECT ON TABLE flashes FROM anon;

GRANT SELECT (
  id,
  profile_id,
  viewer_name,
  message,
  amount_cents,
  currency,
  status,
  payment_method,
  stream_id,
  tx_signature,
  created_at,
  escrow_pda,
  viewer_wallet,
  settle_tx_signature
) ON TABLE flashes TO anon;

REVOKE SELECT ON TABLE flashes FROM authenticated;

GRANT SELECT (
  id,
  profile_id,
  viewer_name,
  message,
  amount_cents,
  currency,
  status,
  payment_method,
  payment_intent_id,
  stream_id,
  tx_signature,
  created_at,
  escrow_pda,
  viewer_wallet,
  settle_tx_signature
) ON TABLE flashes TO authenticated;
