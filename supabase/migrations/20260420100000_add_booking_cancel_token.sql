-- ── Per-booking cancel_token ────────────────────────────────────────────────
-- /api/stripe/cancel previously accepted { booking_id, viewer_name } from
-- anonymous callers and authorized the cancel if viewer_name matched the
-- stored column. viewer_name is NOT a secret: `bookings_select_public` is
-- `USING (true)` so any anon can `SELECT id, viewer_name FROM bookings` and
-- loop cancel calls, voiding or refunding every active booking on the
-- platform.
--
-- Introduce a random cancel_token generated server-side at booking creation
-- and returned only to the viewer who created the booking. The cancel route
-- now requires the token to match (or a streamer bearer token).
--
-- Existing rows get NULL and become streamer-only cancellable, which is safe:
-- viewers who want to back out can wait for Stripe auth expiry (janitor
-- sweeps) or ask the streamer. No in-flight production data is affected on
-- devnet; mainnet rollout should happen alongside the code that issues the
-- token (same PR).

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS cancel_token text;

-- Prevent anon from seeding their own cancel_token on INSERT. Mirrors the
-- server-managed-column pattern from 20260418100000 / 20260419000000.
DROP POLICY IF EXISTS "bookings_insert_public" ON bookings;

CREATE POLICY "bookings_insert_public"
  ON bookings FOR INSERT
  WITH CHECK (
    status = 'pending'
    AND payment_intent_id IS NULL
    AND original_amount_cents IS NULL
    AND started_at IS NULL
    AND approved_at IS NULL
    AND tx_signature IS NULL
    AND escrow_pda IS NULL
    AND cancel_token IS NULL
    AND EXISTS (
      SELECT 1 FROM overlay_elements e
      WHERE e.id = element_id
        AND e.profile_id = profile_id
        AND e.price_value > 0
    )
  );
