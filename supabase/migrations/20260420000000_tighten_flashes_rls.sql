-- ── Tighten flashes RLS ──────────────────────────────────────────────────────
-- Fixes the same class of hole as 20260418100000_tighten_bookings_rls.sql:
--
--   1. UPDATE previously used
--        USING (auth.uid() IS NULL OR auth.uid() = profile_id)
--      with no WITH CHECK and no column restriction, so any anon caller with
--      the public anon key could `update().eq('id', …)` and rewrite status,
--      message, viewer_name, or amount_cents on any flash — including flipping
--      a pending flash to 'approved' and spoofing the overlay display.
--
--   2. INSERT previously used WITH CHECK (true). Server-managed columns
--      (status, tx_signature, escrow_pda, viewer_wallet, payment_intent_id)
--      could be seeded with attacker-chosen values on creation.
--
-- All legitimate server flash writes (create, attach-escrow, moderate) use
-- SUPABASE_SERVICE_ROLE_KEY and bypass RLS entirely, so tightening the anon
-- policies has no effect on real flows.

-- ── UPDATE ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "flashes_update_owner_or_anon" ON flashes;

CREATE POLICY "flashes_update_streamer"
  ON flashes FOR UPDATE
  TO authenticated
  USING      (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

-- No anon UPDATE policy: viewer-side flash writes (attach-escrow) go through
-- the service-role API route, not direct anon access.

-- ── INSERT ──────────────────────────────────────────────────────────────────
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
  );
