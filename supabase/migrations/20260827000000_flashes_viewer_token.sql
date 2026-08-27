-- ── flashes.viewer_token ────────────────────────────────────────────────────
-- Companion to bookings.cancel_token (20260420100000_add_booking_cancel_token.sql),
-- but for reads rather than the cancel action: a random secret minted
-- server-side at flash creation, returned only to the creating viewer, and
-- never exposed via SELECT. /api/flashes/my-status verifies it server-side
-- (service_role) to answer "is this flash mine" without needing a real auth
-- session — the same trust model bookings already uses for cancel_token,
-- extended to prove read-ownership too.
--
-- Existing rows get NULL and simply won't resolve through the new
-- my-status route (same accepted tradeoff as cancel_token's original
-- rollout for bookings) — flash lifecycles are short (one-shot paid
-- message), so the exposure window for already-in-flight rows is small.

ALTER TABLE flashes
  ADD COLUMN IF NOT EXISTS viewer_token text;

-- Prevent anon from seeding their own viewer_token on INSERT — mirrors the
-- server-managed-column pattern already used for status/payment_intent_id/
-- tx_signature/escrow_pda/viewer_wallet/stream_id on this same policy.
DROP POLICY IF EXISTS "flashes_insert_public" ON flashes;

CREATE POLICY "flashes_insert_public"
  ON flashes FOR INSERT
  WITH CHECK (
    status = 'pending'
    AND payment_intent_id IS NULL
    AND tx_signature IS NULL
    AND escrow_pda IS NULL
    AND viewer_wallet IS NULL
    AND stream_id IS NULL
    AND viewer_token IS NULL
  );

-- viewer_token is excluded from both column-level grants below (it must
-- never be SELECT-able — that would defeat its purpose the same way a
-- publicly-readable cancel_token did for bookings, see
-- 20260423000000_hide_cancel_token_from_select.sql). All other columns
-- match the live-verified grant lists from that migration's sibling below
-- (20260827010000_narrow_anon_select_policies.sql) minus payment_intent_id
-- for anon.
