-- ── Phase C: close the last anon UPDATE on bookings ─────────────────────────
-- Phase B (20260421000000) kept GRANT UPDATE (status) on anon because the
-- Stripe submitBooking flow still ran a stale-pending UPDATE(status='denied')
-- from the browser (overlay/page.tsx, formerly lines 711-718). That write has
-- now been moved into /api/bookings/create-stripe, which runs as
-- service_role and bypasses RLS + grants entirely.
--
-- With no remaining anon UPDATE path, the column grant and the
-- bookings_update_anon row policy are both dead code. Drop them outright:
-- anon bookings mutations now require going through a server route (and
-- those routes use a per-booking cancel_token for auth on the viewer-
-- initiated branches).

REVOKE UPDATE (status) ON TABLE bookings FROM anon;

DROP POLICY IF EXISTS "bookings_update_anon" ON bookings;
