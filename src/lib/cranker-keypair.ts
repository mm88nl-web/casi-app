import { Keypair } from '@solana/web3.js';
import { logError } from '@/lib/observability';
import { decodeBase58 } from '@/lib/casi-escrow-decoder';

/**
 * Load the shared server-side signing keypair from `SOLANA_CRANKER_KEYPAIR`.
 *
 * Used by:
 *   - /api/cron/solana-reconciler       (permissionless `cancel_stale_pending`)
 *   - /api/solana/delegates/start-beam  (fee payer for `start_beam_delegated`)
 *
 * Accepts either a JSON byte array (same format as `~/.config/solana/id.json`)
 * or a base58-encoded 64-byte secret. Returns `null` when unset / malformed —
 * callers decide whether that's fatal or skip-worthy.
 *
 * The server-held session key signs the delegated instruction but has no SOL,
 * so it can't also be the fee payer — Solana rejects debits on accounts with
 * no prior credit. The cranker funds the fees; the session key provides the
 * signature the program constraints require.
 */
export function loadCrankerKeypair(scope: string): Keypair | null {
  const raw = process.env.SOLANA_CRANKER_KEYPAIR;
  if (!raw) return null;
  try {
    if (raw.trim().startsWith('[')) {
      const arr = JSON.parse(raw) as number[];
      if (!Array.isArray(arr) || arr.length !== 64) return null;
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    }
    const bytes = decodeBase58(raw.trim());
    if (bytes.length !== 64) return null;
    return Keypair.fromSecretKey(bytes);
  } catch (err) {
    logError(scope, err, { scope: 'loadCrankerKeypair' });
    return null;
  }
}
