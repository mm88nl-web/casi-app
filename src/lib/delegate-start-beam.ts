/**
 * Server-side crank for `start_beam_delegated`.
 *
 * Extracted from the streamer-auth route so the viewer-triggered
 * `expire-and-advance` path can also auto-promote the next queued Solana
 * beam without the streamer having to be online. The logic is identical in
 * both cases: load the registered delegate row, validate it, decrypt the
 * session key, build + sign `start_beam_delegated` with the cranker as fee
 * payer, and confirm.
 *
 * Callers are responsible for:
 *   - Proving that the booking's owning profile consents (either via a
 *     bearer-token auth check, or by the booking genuinely being next-up on
 *     the streamer's own slot after a natural timer expiry).
 *   - Flipping DB status after success. This helper touches the chain only.
 *
 * The returned discriminated union lets each caller decide how to degrade:
 *   - reason=no_delegate / revoked / expired → surface a wallet-sign fallback
 *   - reason=no_cranker → fall back to wallet-sign (or 503 on the API)
 *   - reason=chain_error → leave DB state untouched so manual recovery is
 *     possible via the Play Now button.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { SOLANA_RPC, WALLET_ADAPTER_CLUSTER } from './solana-network';
import { openSessionSecret } from './delegate-crypto';
import { loadCrankerKeypair } from './cranker-keypair';
import { CasiEscrowClient } from './casi-escrow';
import { logError, logWarn } from './observability';

export type StartDelegatedReason =
  | 'no_delegate'
  | 'revoked'
  | 'expired'
  | 'no_cranker'
  | 'db_error'
  | 'decrypt_failed'
  | 'key_mismatch'
  | 'chain_error';

export type StartDelegatedResult =
  | { ok: true; signature: string; alreadyProcessed?: boolean }
  | { ok: false; reason: StartDelegatedReason; message?: string };

export async function signStartBeamDelegated({
  supabase,
  scope,
  profileId,
  bookingId,
  escrowId,
  streamerWallet,
}: {
  supabase: SupabaseClient;
  /** Log scope prefix so callers are distinguishable in the drain. */
  scope: string;
  profileId: string;
  /** Underlying booking row id; used for logs / context only. */
  bookingId: string | number;
  /** Escrow UUID the Anchor program keys the PDA on. */
  escrowId: string | number;
  streamerWallet: string;
}): Promise<StartDelegatedResult> {
  // ── Load + validate delegate row ─────────────────────────────────────────
  const { data: delegate, error: delegateErr } = await supabase
    .from('streamer_delegates')
    .select('session_pubkey, encrypted_secret, expires_at, revoked_at')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (delegateErr) {
    logError(scope, delegateErr, { profile_id: profileId, booking_id: bookingId });
    return { ok: false, reason: 'db_error' };
  }
  if (!delegate) {
    return { ok: false, reason: 'no_delegate' };
  }
  if (delegate.revoked_at) {
    return { ok: false, reason: 'revoked' };
  }
  const expMs = Date.parse(delegate.expires_at);
  if (!Number.isFinite(expMs) || expMs <= Date.now()) {
    return { ok: false, reason: 'expired' };
  }

  // ── Decrypt session key ──────────────────────────────────────────────────
  let session: Keypair;
  try {
    const secretBytes = openSessionSecret(delegate.encrypted_secret);
    session = Keypair.fromSecretKey(secretBytes);
  } catch (err) {
    logError(scope, err, { profile_id: profileId, booking_id: bookingId, step: 'decrypt' });
    return { ok: false, reason: 'decrypt_failed' };
  }
  if (session.publicKey.toBase58() !== delegate.session_pubkey) {
    logError(scope,
      new Error('session keypair / session_pubkey mismatch'),
      { profile_id: profileId, booking_id: bookingId });
    return { ok: false, reason: 'key_mismatch' };
  }

  // ── Cranker as fee payer ─────────────────────────────────────────────────
  const cranker = loadCrankerKeypair(scope);
  if (!cranker) {
    logWarn(scope, 'SOLANA_CRANKER_KEYPAIR not set — delegated start cannot pay fees', {
      booking_id: bookingId,
    });
    return { ok: false, reason: 'no_cranker' };
  }

  const connection = new Connection(SOLANA_RPC, 'confirmed');
  const streamer   = new PublicKey(streamerWallet);

  // Minimal AnchorWallet shim — the client only uses it to build the
  // instruction; the real signing happens below with `[cranker, session]`.
  const wallet = {
    publicKey: session.publicKey,
    signTransaction:    async <T extends Transaction>(t: T): Promise<T> => {
      (t as unknown as Transaction).partialSign(session);
      return t;
    },
    signAllTransactions: async <T extends Transaction>(ts: T[]): Promise<T[]> => {
      for (const t of ts) (t as unknown as Transaction).partialSign(session);
      return ts;
    },
  } as unknown as import('@solana/wallet-adapter-react').AnchorWallet;

  try {
    const client = new CasiEscrowClient(connection, wallet, WALLET_ADAPTER_CLUSTER);
    const ix = await client.buildStartBeamDelegatedIx({
      escrowId,
      streamer,
      sessionKey: session.publicKey,
    });

    const tx = new Transaction().add(ix);
    tx.feePayer = cranker.publicKey;
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;

    const signature = await sendAndConfirmTransaction(connection, tx, [cranker, session], {
      commitment: 'confirmed',
      skipPreflight: false,
    });
    return { ok: true, signature };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Replica lag can surface a landed tx as "already processed" — treat as
    // success so callers don't regress or double-flip state.
    if (msg.includes('already been processed')) {
      logWarn(scope, 'tx already processed — treating as success', { booking_id: bookingId });
      return { ok: true, signature: '', alreadyProcessed: true };
    }
    logError(scope, err, { booking_id: bookingId });
    return { ok: false, reason: 'chain_error', message: msg };
  }
}
