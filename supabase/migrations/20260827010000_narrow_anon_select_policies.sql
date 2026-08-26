-- ── Narrow anon SELECT to what's actually meant to be public ────────────────
--
-- This is the migration that actually closes the platform-wide read found
-- in the 2026-08-26 self-audit: any anonymous caller could read every
-- booking/flash across every streamer regardless of status — including
-- pending (unmoderated submissions) and denied (rejected content), both of
-- which carry viewer_name/message/image_url/wallet data never meant to be
-- broadcast. `bookings_select_public` / `flashes_select_public` were
-- `USING (true)` for anon with no row restriction at all.
--
-- Prerequisite for this to ship without regressions: the two client-side
-- code paths that legitimately needed broad pending/denied/cancelled/
-- expired visibility (the "check my own booking" and "my activity today"
-- queries in overlay/page.tsx, keyed by client-supplied viewer_name) have
-- been moved to /api/bookings/my-status and /api/flashes/my-status, which
-- verify ownership server-side via cancel_token / viewer_token instead of
-- trusting viewer_name. See 20260827000000_flashes_viewer_token.sql for the
-- flashes side of that (bookings already had cancel_token since
-- 20260420100000).
--
-- What stays anon-readable at the row level, and why each piece is safe:
--
--   bookings:
--     status IN ('active', 'approved_queued')
--       — the whole point of these two statuses is to render live on
--         stream to every viewer, not just the booker. Already genuinely
--         public.
--     OR (payment_method = 'solana' AND status IN ('denied','expired')
--         AND escrow_pda IS NOT NULL)
--       — the cross-device USDC recovery case: a viewer reconnecting the
--         same wallet on a browser with no localStorage (no cancel_token
--         available) needs to find their stuck escrow. This does NOT prove
--         wallet ownership (anon has no session to check a signature
--         against) — it's a deliberate, narrower residual exposure, not a
--         full close. Scoped as tight as the feature allows: only rows
--         that are (a) Solana (b) in a terminal failure state (c) still
--         holding funds on-chain. Doesn't cover pending, cancelled, or any
--         non-solana row. escrow_pda/viewer_wallet are also intrinsically
--         adjacent to public on-chain data, unlike message/image_url on a
--         pending row nobody ever approved.
--
--   flashes:
--     status = 'approved'
--       — same reasoning as active/approved_queued bookings: approved
--         flashes are meant to render on stream publicly.
--     OR (payment_method = 'solana' AND status = 'pending'
--         AND escrow_pda IS NOT NULL)
--       — same cross-device recovery case, for flashes' "stuck payment"
--         state (flashes don't have an active/expired lifecycle, so
--         "stuck" is status='pending' with a live escrow reference instead
--         of denied/expired).
--
-- Real, deliberately-accepted residual gap: a viewer's "today's activity"
-- view via the WALLET-keyed history query (overlay/page.tsx, querying ALL
-- statuses/ages for a connected wallet, used so a viewer on a brand-new
-- device still sees their day's spend) will now silently narrow to just
-- the two carve-outs above instead of full history, for that specific
-- new-device-same-day case. Not a money-recovery regression (the stuck-
-- escrow case above still works) — just a "history list looks emptier on
-- a device you've never used before" UX narrowing. Fixing that for real
-- needs actual wallet-signature verification (challenge/response with the
-- connected wallet), which is out of scope here — flagged, not silently
-- dropped.

DROP POLICY IF EXISTS "bookings_select_public" ON bookings;

CREATE POLICY "bookings_select_public"
  ON bookings FOR SELECT
  TO anon
  USING (
    status IN ('active', 'approved_queued')
    OR (
      payment_method = 'solana'
      AND status IN ('denied', 'expired')
      AND escrow_pda IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "flashes_select_public" ON flashes;

CREATE POLICY "flashes_select_public"
  ON flashes FOR SELECT
  TO anon
  USING (
    status = 'approved'
    OR (
      payment_method = 'solana'
      AND status = 'pending'
      AND escrow_pda IS NOT NULL
    )
  );
