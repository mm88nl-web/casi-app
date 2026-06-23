/**
 * Server-side cranker for approve_flash_delegated and deny_flash_delegated.
 *
 * Extracted from the /api/solana/delegates/approve-flash and deny-flash routes
 * so callers without a user session (e.g. the Discord interaction handler) can
 * fire the on-chain instruction using only a service-role Supabase client.
 *
 * Callers are responsible for:
 *   - Verifying that the caller is authorized to act on the flash (ownership
 *     check, guild guard, etc.). This lib does NOT re-check ownership.
 *   - Confirming flash.status === 'pending' before calling.
 *
 * DB writes happen in the Helius webhook:
 *   approve_flash_delegated discriminator → applyFlashTransition → pending → approved
 *   deny_flash_delegated discriminator   → applyFlashTransition → pending → denied
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
import { openSessionSecret }  from './delegate-crypto';
import { loadCrankerKeypair } from './cranker-keypair';
import { CasiEscrowClient, solscanTxUrl } from './casi-escrow';
import { logError, logWarn } from './observability';

export type FlashDelegatedReason =
  | 'no_delegate'
  | 'revoked'
  | 'expired'
  | 'no_cranker'
  | 'db_error'
  | 'decrypt_failed'
  | 'key_mismatch'
  | 'chain_error';

export type FlashDelegatedResult =
  | { ok: true;  signature: string; solscanUrl: string; alreadyProcessed?: boolean }
  | { ok: false; reason: FlashDelegatedReason; message?: string };

export interface SignFlashParams {
  supabase:      SupabaseClient;
  /** Log scope prefix so callers are distinguishable in the drain. */
  scope:         string;
  profileId:     string;
  flashId:       string | number;
  streamerWallet: string;
  viewerWallet:  string;
}

// ── Internal shared implementation ────────────────────────────────────────────

async function signFlashDelegated(
  { supabase, scope, profileId, flashId, streamerWallet, viewerWallet }: SignFlashParams,
  verb: 'approve' | 'deny',
): Promise<FlashDelegatedResult> {
  // ── Load + validate delegate row ─────────────────────────────────────────
  const { data: delegate, error: delegateErr } = await supabase
    .from('streamer_delegates')
    .select('session_pubkey, encrypted_secret, expires_at, revoked_at')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (delegateErr) {
    logError(scope, delegateErr, { profile_id: profileId, flash_id: flashId });
    return { ok: false, reason: 'db_error' };
  }
  if (!delegate) return { ok: false, reason: 'no_delegate' };
  if (delegate.revoked_at) return { ok: false, reason: 'revoked' };
  const expMs = Date.parse(delegate.expires_at);
  if (!Number.isFinite(expMs) || expMs <= Date.now()) return { ok: false, reason: 'expired' };

  // ── Decrypt session key ──────────────────────────────────────────────────
  let session: Keypair;
  try {
    const secretBytes = openSessionSecret(delegate.encrypted_secret);
    session = Keypair.fromSecretKey(secretBytes);
  } catch (err) {
    logError(scope, err, { profile_id: profileId, flash_id: flashId, step: 'decrypt' });
    return { ok: false, reason: 'decrypt_failed' };
  }
  if (session.publicKey.toBase58() !== delegate.session_pubkey) {
    logError(scope, new Error('session keypair / session_pubkey mismatch'), { profile_id: profileId });
    return { ok: false, reason: 'key_mismatch' };
  }

  // ── Cranker as fee payer ─────────────────────────────────────────────────
  const cranker = loadCrankerKeypair(scope);
  if (!cranker) {
    logWarn(scope,
      `SOLANA_CRANKER_KEYPAIR not set — delegated ${verb}-flash cannot pay fees`,
      { flash_id: flashId });
    return { ok: false, reason: 'no_cranker' };
  }

  const connection = new Connection(SOLANA_RPC, 'confirmed');
  const streamer   = new PublicKey(streamerWallet);
  const viewer     = new PublicKey(viewerWallet);

  // Minimal AnchorWallet shim — see delegate-start-beam.ts for rationale.
  const wallet = {
    publicKey: session.publicKey,
    signTransaction: async <T extends Transaction>(t: T): Promise<T> => {
      (t as unknown as Transaction).partialSign(session);
      return t;
    },
    signAllTransactions: async <T extends Transaction>(ts: T[]): Promise<T[]> => {
      for (const t of ts) (t as unknown as Transaction).partialSign(session);
      return ts;
    },
  } as unknown as import('@solana/wallet-adapter-react').AnchorWallet;

  // ── Build + send transaction ─────────────────────────────────────────────
  let sig: string;
  try {
    const client = new CasiEscrowClient(connection, wallet, WALLET_ADAPTER_CLUSTER);
    const ix = verb === 'approve'
      ? await client.buildApproveFlashDelegatedIx({
          escrowId:   flashId,
          streamer,
          viewer,
          sessionKey: session.publicKey,
          cranker:    cranker.publicKey,
        })
      : await client.buildDenyFlashDelegatedIx({
          escrowId:   flashId,
          streamer,
          viewer,
          sessionKey: session.publicKey,
          cranker:    cranker.publicKey,
        });

    const tx = new Transaction().add(ix);
    tx.feePayer = cranker.publicKey;
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash     = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;

    sig = await sendAndConfirmTransaction(connection, tx, [cranker, session], {
      commitment:    'confirmed',
      skipPreflight: false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('already been processed')) {
      logWarn(scope, 'tx already processed — treating as success', { flash_id: flashId });
      return { ok: true, signature: '', solscanUrl: '', alreadyProcessed: true };
    }
    logError(scope, err, { flash_id: flashId });
    return { ok: false, reason: 'chain_error', message: msg };
  }

  return {
    ok:         true,
    signature:  sig,
    solscanUrl: solscanTxUrl(sig, WALLET_ADAPTER_CLUSTER),
  };
}

// ── Public exports ─────────────────────────────────────────────────────────────

export function signApproveFlashDelegated(args: SignFlashParams): Promise<FlashDelegatedResult> {
  return signFlashDelegated(args, 'approve');
}

export function signDenyFlashDelegated(args: SignFlashParams): Promise<FlashDelegatedResult> {
  return signFlashDelegated(args, 'deny');
}
