-- ── Tighten bookings INSERT policy ───────────────────────────────────────────
-- The previous policy (WITH CHECK (true)) allowed any caller with the anon key
-- to insert a booking row with an arbitrary status value (e.g. 'active'),
-- bypassing the streamer-approval flow entirely.
--
-- This replacement restricts inserts so that new rows must always enter as
-- 'pending', regardless of what the client sends.  The streamer's admin
-- dashboard is the only path that advances status beyond 'pending'.

DROP POLICY IF EXISTS "bookings_insert_public" ON bookings;

CREATE POLICY "bookings_insert_public"
  ON bookings FOR INSERT
  WITH CHECK (status = 'pending');
