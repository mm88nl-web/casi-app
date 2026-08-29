-- ── Fix: PDA-squatting DoS via predictable escrow_id ───────────────────────
-- Fable's independent 2026-08-28 review (docs/fable-security-review-2026-08-28.md,
-- Finding 1) proved that deriving the Solana escrow PDA's seed from
-- sha256(String(bookings.id)) — a plain sequential, publicly-returned integer
-- — lets anyone pre-emptively call initialize_escrow against a *future*
-- booking id, permanently denying that booking a working on-chain escrow
-- (Anchor's `init` means first-to-land wins the PDA forever).
--
-- Fix: a random per-booking seed, generated server-side at creation time
-- (POST /api/bookings/create-solana, alongside the existing cancel_token),
-- used in place of booking.id everywhere an escrow_id is derived. Unlike
-- cancel_token, this value is NOT sensitive after creation — it's the same
-- trust level as escrow_pda (already public): the security property needed
-- is that it be unguessable BEFORE the booking exists, not secret after.
-- Public read access is required because several server-side flows (streamer
-- wallet-signed settle, the delegated crank routes, the stale-pending cron)
-- must recompute the identical escrow_id independently of the viewer, and
-- none of them have access to the viewer-only cancel_token.
--
-- Nullable + a fallback to booking.id at every call site (see the app-layer
-- changes in the same commit) so pre-existing devnet rows created before
-- this migration keep working — this program has no mainnet users yet, so
-- there's no live security exposure from leaving old rows on the weaker
-- derivation, only a compatibility concern.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS escrow_seed text;

-- Extend the existing column-level grants (see
-- 20260423000000_hide_cancel_token_from_select.sql) rather than re-granting
-- the whole table — escrow_seed is safe to expose but cancel_token must stay
-- excluded, so the column-by-column pattern that migration established stays
-- intact.
GRANT SELECT (escrow_seed) ON TABLE bookings TO anon;
GRANT SELECT (escrow_seed) ON TABLE bookings TO authenticated;
