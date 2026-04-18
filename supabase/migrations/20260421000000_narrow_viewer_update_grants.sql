-- ── Phase B: narrow viewer UPDATE grants after server-route migration ─────
-- The Phase-A migration (20260420200000) replaced the table-wide anon UPDATE
-- grant on bookings with a column-level grant on
-- (status, started_at, tx_signature, escrow_pda, viewer_wallet), matching
-- the columns the overlay page wrote directly from the browser.
--
-- All of those writes except one have now been moved to server routes that
-- run as service_role (bypasses RLS + grants entirely):
--
--   status='expired' + started_at (queue advancement)  → /api/bookings/expire-and-advance
--   status='denied'  (post-Stripe-cancel redirect)     → /api/stripe/cancel
--   status='denied'  (Solana error paths, USDC cancel) → /api/bookings/viewer-deny
--   tx_signature + escrow_pda + viewer_wallet writes   → /api/bookings/attach-solana-tx
--   overlay_elements.image_url on queue advance        → /api/bookings/expire-and-advance
--
-- The remaining anon write is the stale-pending cleanup inside
-- submitBooking (Stripe path, src/app/overlay/page.tsx:711-718), which sets
-- status='denied' on the viewer's own prior pending rows. That migration is
-- deferred to Phase C (requires wrapping the Stripe insert in a server
-- route so cancel_token can authorize the cleanup). Until then we keep
-- UPDATE(status) on anon.

REVOKE UPDATE ON TABLE bookings FROM anon;
GRANT  UPDATE (status) ON TABLE bookings TO anon;

-- overlay_elements: image_url is no longer written by the anon overlay page.
-- Drop the narrow policy and the column grant outright.
DROP POLICY IF EXISTS "elements_update_anon_image" ON overlay_elements;
REVOKE UPDATE ON TABLE overlay_elements FROM anon;
