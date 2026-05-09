-- Companion to 20260509000000_price_value_to_numeric.sql, which failed in
-- the Supabase SQL Editor with:
--
--   ERROR: 0A000: cannot alter type of a column used in a policy definition
--   DETAIL: policy bookings_insert_public on table bookings depends on
--           column "price_value"
--
-- The policy (last rewritten in 20260420100000_add_booking_cancel_token.sql)
-- references overlay_elements.price_value inside its WITH CHECK EXISTS
-- subquery (`AND e.price_value > 0`). Postgres locks ALTER COLUMN TYPE on
-- any column a policy expression mentions, even transitively through a
-- subquery on a different table.
--
-- Fix: drop the policy, widen both price_value columns, recreate the policy
-- with the identical definition. Safe to run whether or not the original
-- 20260509000000 migration ran first — the casts are no-ops if the columns
-- are already NUMERIC.

DROP POLICY IF EXISTS "bookings_insert_public" ON bookings;

ALTER TABLE bookings
  ALTER COLUMN price_value TYPE NUMERIC USING price_value::NUMERIC;

ALTER TABLE overlay_elements
  ALTER COLUMN price_value TYPE NUMERIC USING price_value::NUMERIC;

-- Recreated verbatim from 20260420100000_add_booking_cancel_token.sql.
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
