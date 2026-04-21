-- ── streamer_delegates ─────────────────────────────────────────────────────
-- Per-streamer session-key delegate mirror of the on-chain StreamerDelegate
-- PDA. Stores the PUBLIC key in clear (so the webhook + admin UI can match),
-- and the PRIVATE key encrypted with AES-256-GCM using DELEGATE_ENCRYPTION_KEY.
-- Only the service role (used inside server routes) ever reads this table —
-- anon + authenticated are revoked wholesale. Streamers interact with it
-- exclusively through /api/solana/delegates/*.
--
-- `encrypted_secret` format: base64url(nonce || ciphertext || tag)
--   • nonce      = 12 bytes (AES-GCM standard)
--   • ciphertext = 64 bytes (ed25519 secret key)
--   • tag        = 16 bytes (GCM auth tag)
-- so the on-disk string is ~124 base64 chars. No key id: rotate by updating
-- DELEGATE_ENCRYPTION_KEY and running a one-off re-encrypt migration (future).
--
-- expires_at mirrors the on-chain expires_at. The chain is still authoritative
-- for refusing a delegated start_beam after expiry — this column exists so the
-- server can avoid sending a tx it knows will fail.
--
-- revoked_at != NULL means the streamer pressed "revoke" in the UI. The
-- on-chain revoke is a separate streamer-signed tx; this column flips first
-- and synchronously, so the server auto-crank refuses to use the delegate
-- the instant the user asks. If the on-chain revoke fails to land, the
-- delegate still self-expires at `expires_at`.
CREATE TABLE IF NOT EXISTS public.streamer_delegates (
  profile_id        uuid PRIMARY KEY
                       REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_pubkey    text NOT NULL,
  encrypted_secret  text NOT NULL,
  expires_at        timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  rotated_at        timestamptz NOT NULL DEFAULT now(),
  revoked_at        timestamptz
);

-- The webhook receives session_pubkey as an account in start_beam_delegated
-- instructions; look-ups run on every qualifying event.
CREATE INDEX IF NOT EXISTS streamer_delegates_pubkey_idx
  ON public.streamer_delegates (session_pubkey)
  WHERE revoked_at IS NULL;

-- ── Permissions ────────────────────────────────────────────────────────────
-- Default is revoked-from-anon/authenticated; we belt-and-suspenders with an
-- RLS policy that refuses every row. Service-role bypasses RLS so server
-- routes continue to work as normal.
ALTER TABLE public.streamer_delegates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.streamer_delegates FROM PUBLIC;
REVOKE ALL ON public.streamer_delegates FROM anon;
REVOKE ALL ON public.streamer_delegates FROM authenticated;

-- Explicit deny-all RLS. Without this, a future GRANT would open the table up
-- unexpectedly; with this, adding access requires adding a matching policy.
DROP POLICY IF EXISTS deny_all ON public.streamer_delegates;
CREATE POLICY deny_all ON public.streamer_delegates
  FOR ALL TO public
  USING (false)
  WITH CHECK (false);
