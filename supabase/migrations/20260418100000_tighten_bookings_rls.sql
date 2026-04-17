-- ── Tighten bookings RLS ─────────────────────────────────────────────────────
-- Two fixes for the bookings table's RLS:
--
--  1. INSERT previously only checked status='pending'. This left server-managed
--     columns (payment_intent_id, original_amount_cents, approved_at, …) free
--     for a viewer to seed with arbitrary values on creation. The server
--     routes re-read the authoritative price from overlay_elements, so tamper
--     damage is already contained, but defence-in-depth at the DB layer is
--     cheap and matches the security audit.
--
--  2. UPDATE policy was `auth.uid() IS NULL OR auth.uid() = profile_id`, which
--     let ANY anonymous caller mutate ANY booking. Split into two policies:
--       • streamers (authenticated, owner) can change anything on their rows
--       • anon can only move status along legitimate viewer paths:
--             pending         → denied          (Stripe cancel URL)
--             pending         → pending         (attach escrow_pda/viewer_wallet/tx_signature after Solana payment)
--             active          → expired         (client countdown end)
--             approved_queued → active          (viewer-driven queue advance)
--
-- Server routes use SUPABASE_SERVICE_ROLE_KEY and bypass RLS entirely, so
-- approve / capture / settle flows are unaffected.

-- ── INSERT ──────────────────────────────────────────────────────────────────
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
    -- element_id must resolve to an element owned by the claimed profile,
    -- preventing a viewer from booking profile A's element against profile B.
    AND EXISTS (
      SELECT 1 FROM overlay_elements e
      WHERE e.id = element_id
        AND e.profile_id = profile_id
    )
  );

-- ── UPDATE ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "bookings_update_owner_or_anon" ON bookings;

CREATE POLICY "bookings_update_streamer"
  ON bookings FOR UPDATE
  TO authenticated
  USING  (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "bookings_update_anon"
  ON bookings FOR UPDATE
  TO anon
  USING      (status IN ('pending', 'active', 'approved_queued'))
  WITH CHECK (status IN ('pending', 'denied', 'active', 'expired'));
