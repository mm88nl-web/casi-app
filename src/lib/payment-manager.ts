/**
 * payment-manager.ts
 *
 * Single source of truth for "pay for a flash" across the three rails:
 *   - stripe — redirect to Stripe Checkout (manual-capture PI)
 *   - solana — on-chain escrow via CasiEscrowClient (devnet-only, feature-flagged)
 *   - free   — no payment, just an insert (subject to server-side rate limit)
 *
 * The overlay component calls sendFlash({ method, ... }) and doesn't need to
 * know anything about the rails. Adding a fourth rail (credits, in Phase 2)
 * means adding one handler here, not touching the overlay.
 */
import type { Connection } from '@solana/web3.js';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import { WALLET_ADAPTER_CLUSTER } from '@/lib/solana-network';

export type PaymentMethod = 'stripe' | 'solana' | 'free';

export interface SendFlashInput {
  method: PaymentMethod;
  profileId: string;
  viewerName: string;
  message: string;
  amountCents: number;
  /** Solana-only — the streamer's USDC-denominated amount in 6-decimal micro-units. */
  amountUsdc?: number;
  /** Solana-only — the streamer's linked wallet (base58). */
  streamerSolanaWallet?: string | null;
  /** Solana-only — wallet + connection from react hooks. */
  solana?: {
    connection: Connection;
    wallet: Pick<WalletContextState, 'publicKey' | 'signTransaction' | 'signAllTransactions'>;
  };
}

export interface SendFlashResult {
  /** Stripe rail redirects the browser. */
  redirectTo?: string;
  /** Solana rail returns the on-chain sig + escrow PDA for the success banner. */
  solana?: { sig: string; escrowPda: string; solscanUrl: string };
  /** Free rail returns the newly-created flash id so the UI can subscribe to it. */
  flashId?: string;
}

export const SOLANA_ENABLED =
  process.env.NEXT_PUBLIC_CASI_SOLANA_ENABLED === 'true';

/**
 * Entry point — dispatches to the right rail. Throws on failure; the overlay
 * calls formatEscrowError() to render a toast.
 */
export async function sendFlash(input: SendFlashInput): Promise<SendFlashResult> {
  switch (input.method) {
    case 'stripe': return sendFlashStripe(input);
    case 'solana': return sendFlashSolana(input);
    case 'free':   return sendFlashFree(input);
  }
}

// ─── Stripe ──────────────────────────────────────────────────────────────────

async function sendFlashStripe(input: SendFlashInput): Promise<SendFlashResult> {
  const res = await fetch('/api/flashes/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profile_id:     input.profileId,
      viewer_name:    input.viewerName,
      message:        input.message.trim(),
      amount_cents:   input.amountCents,
      payment_method: 'stripe',
    }),
  });
  const { checkout_url, flash_id, error } = await res.json();
  if (error || !checkout_url) throw new Error(error || 'Failed to create Stripe checkout');
  return { redirectTo: checkout_url, flashId: flash_id };
}

// ─── Solana ──────────────────────────────────────────────────────────────────

async function sendFlashSolana(input: SendFlashInput): Promise<SendFlashResult> {
  if (!SOLANA_ENABLED) {
    throw new Error('Solana payments are disabled on this build');
  }
  const { solana, streamerSolanaWallet, amountUsdc } = input;
  if (!solana?.wallet.publicKey || !solana.wallet.signTransaction) {
    throw new Error('Please connect your wallet');
  }
  if (!streamerSolanaWallet) {
    throw new Error('This streamer has not linked a Solana wallet yet');
  }
  if (!amountUsdc || amountUsdc <= 0) {
    throw new Error('Invalid USDC amount');
  }

  const createRes = await fetch('/api/flashes/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profile_id:     input.profileId,
      viewer_name:    input.viewerName,
      message:        input.message.trim(),
      amount_cents:   input.amountCents,
      payment_method: 'solana',
    }),
  });
  const { flash_id, solana_wallet, error: apiErr } = await createRes.json();
  if (apiErr || !flash_id) throw new Error(apiErr || 'Failed to create flash');
  if (!solana_wallet)      throw new Error('Streamer wallet not found');

  const { publicKey, signTransaction, signAllTransactions } = solana.wallet;
  const anchorWallet = {
    publicKey,
    signTransaction,
    signAllTransactions:
      signAllTransactions ||
      (async <T,>(txs: T[]) => {
        const signed: T[] = [];
        for (const tx of txs) signed.push(await signTransaction!(tx as never) as T);
        return signed;
      }),
  // Narrow enough for CasiEscrowClient (which wants an AnchorProvider-compatible wallet).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const { CasiEscrowClient } = await import('@/lib/casi-escrow');
  const { PublicKey: PK }    = await import('@solana/web3.js');
  const client = new CasiEscrowClient(solana.connection, anchorWallet, WALLET_ADAPTER_CLUSTER);

  const { sig, escrowPda, solscanUrl } = await client.initializeFlash({
    escrowId: flash_id,
    streamer: new PK(solana_wallet),
    amountUsdc,
  });

  const attachRes = await fetch('/api/flashes/attach-escrow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      flash_id,
      tx_signature:  sig,
      escrow_pda:    escrowPda,
      viewer_wallet: publicKey.toBase58(),
    }),
  });
  const attachJson = await attachRes.json().catch(() => ({}));
  if (!attachRes.ok || attachJson?.error) {
    // Chain state is already correct — don't scare the user, just log.
    console.warn('[payment-manager] attach-escrow failed (chain ok):', attachJson?.error);
  }

  return { flashId: flash_id, solana: { sig, escrowPda, solscanUrl } };
}

// ─── Free ────────────────────────────────────────────────────────────────────

async function sendFlashFree(input: SendFlashInput): Promise<SendFlashResult> {
  const res = await fetch('/api/flashes/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profile_id:     input.profileId,
      viewer_name:    input.viewerName,
      message:        input.message.trim(),
      amount_cents:   0,
      payment_method: 'free',
    }),
  });
  const { flash_id, error } = await res.json();
  if (error || !flash_id) throw new Error(error || 'Failed to create free flash');
  return { flashId: flash_id };
}
