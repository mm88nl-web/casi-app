/**
 * casi-escrow.ts
 *
 * TypeScript client for the CASI Escrow Anchor program.
 * Follows the audited solana-developers/program-examples token_interface pattern:
 * - Uses TOKEN_PROGRAM_ID (SPL Token) by default; pass TOKEN_2022_PROGRAM_ID
 *   for Token-2022 mints.
 * - All transfers use transfer_checked (requires mint + decimals).
 * - Vault is a PDA-owned ATA using anchor_spl associated_token::token_program.
 *
 * Usage:
 *   const client = new CasiEscrowClient(connection, wallet);
 *   const { sig, escrowPda } = await client.initializeFlash({
 *     escrowId, streamer, amountUsdc
 *   });
 *
 * Update PROGRAM_ID after `anchor deploy`.
 */

import {
  AnchorProvider,
  BN,
  Program,
  type Idl,
  setProvider,
} from '@coral-xyz/anchor';
import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  type ConfirmOptions,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import { sha256 } from '@noble/hashes/sha256';
import IDL from '@/idl/casi_escrow.json';

// ---------------------------------------------------------------------------
// Constants — sourced from NEXT_PUBLIC_* env vars with safe devnet fallbacks.
// Run `node scripts/sync-program-id.mjs` after `anchor deploy` to populate
// NEXT_PUBLIC_CASI_PROGRAM_ID in .env.local from target/idl/casi_escrow.json.
// ---------------------------------------------------------------------------

// Valid base58 sentinel (all-zero 32-byte pubkey = SystemProgram). Used when
// NEXT_PUBLIC_CASI_PROGRAM_ID is unset — keeps the module loadable during
// dev/build without crashing on base58 validation. Replaced after
// `anchor deploy` via scripts/sync-program-id.mjs.
const DEFAULT_PROGRAM_ID   = '11111111111111111111111111111111';
const DEFAULT_USDC_DEVNET  = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const DEFAULT_USDC_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/** CASI Escrow program ID. Override via NEXT_PUBLIC_CASI_PROGRAM_ID. */
export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_CASI_PROGRAM_ID || DEFAULT_PROGRAM_ID,
);

/** Devnet USDC mint (Circle test token). */
export const USDC_MINT_DEVNET = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT_DEVNET || DEFAULT_USDC_DEVNET,
);

/** Mainnet USDC mint. */
export const USDC_MINT_MAINNET = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT_MAINNET || DEFAULT_USDC_MAINNET,
);

/** SPL Token program (default). Use TOKEN_2022_PROGRAM_ID for Token-2022 mints. */
export { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID };

const ESCROW_SEED   = Buffer.from('casi-escrow');
const DELEGATE_SEED = Buffer.from('casi-delegate');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a 32-byte escrow seed from any booking/flash id.
 *
 * The Anchor program treats `escrow_id` as 32 opaque bytes used as a PDA
 * seed — it doesn't care about the shape of the source id. Supabase returns
 * `bookings.id` as a number (bigint column) and `flashes.id` as a uuid
 * string; SHA-256-ing the stringified id gives a stable 32-byte seed for
 * either shape, so both rails derive the same PDA client and server side.
 */
export function uuidToBytes(id: string | number | bigint): Uint8Array {
  if (id === null || id === undefined) {
    throw new Error(`uuidToBytes: id is ${id}`);
  }
  return sha256(String(id));
}

/** Derive the escrow PDA address from a booking/flash id or raw bytes. */
export function deriveEscrowPda(
  escrowId: string | number | bigint | Uint8Array,
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  const idBytes =
    escrowId instanceof Uint8Array ? escrowId : uuidToBytes(escrowId);
  return PublicKey.findProgramAddressSync([ESCROW_SEED, idBytes], programId);
}

/**
 * Derive the per-streamer delegate PDA. There is at most one active delegate
 * account per streamer — the seed is `[DELEGATE_SEED, streamer]` so calling
 * `set_delegate` a second time rotates in place via `init_if_needed`.
 */
export function deriveDelegatePda(
  streamer: PublicKey,
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [DELEGATE_SEED, streamer.toBuffer()],
    programId,
  );
}

/** Solscan transaction link. */
export function solscanTxUrl(
  sig: string,
  cluster: 'devnet' | 'mainnet-beta' = 'devnet',
): string {
  return `https://solscan.io/tx/${sig}${cluster === 'devnet' ? '?cluster=devnet' : ''}`;
}

/** Solscan account link. */
export function solscanAccountUrl(
  pubkey: string,
  cluster: 'devnet' | 'mainnet-beta' = 'devnet',
): string {
  return `https://solscan.io/account/${pubkey}${cluster === 'devnet' ? '?cluster=devnet' : ''}`;
}

/**
 * Categorize the messy errors that come out of Anchor / wallet-adapter /
 * web3.js when a `set_delegate` (or any program tx) fails. Returns a
 * fresh Error with a UI-friendly message; UI code shows `.message` raw.
 *
 * Common modes seen on devnet during delegate install/rotate:
 *   - User dismissed the wallet popup
 *   - Wallet popup approved late, blockhash expired before submit
 *   - RPC dropped the tx in transit
 *   - Tx landed but client didn't see confirmation
 *
 * The pre-flight probe in `setDelegate` handles the last case; this
 * helper covers the rest with a one-line cause.
 */
export function decorateDelegateError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (
    lower.includes('user rejected') ||
    lower.includes('user declined') ||
    lower.includes('rejected the request')
  ) {
    return new Error('Wallet popup dismissed — click again to retry.');
  }
  if (lower.includes('blockhash not found') || lower.includes('block height exceeded')) {
    return new Error('Network slow — your signature timed out. Click again to retry.');
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return new Error('Wallet timed out — click again to retry.');
  }
  if (lower.includes('insufficient lamports') || lower.includes('insufficient funds')) {
    return new Error('Not enough SOL in your wallet for the transaction fee.');
  }
  return err instanceof Error ? err : new Error(msg);
}

// ---------------------------------------------------------------------------
// Parameter types
// ---------------------------------------------------------------------------

export interface InitFlashParams {
  escrowId:  string | number | bigint;
  streamer:  PublicKey;
  /** USDC micro-units (1 USDC = 1_000_000). */
  amountUsdc: number;
  usdcMint?:   PublicKey;
  /** SPL Token or Token-2022 program ID. Defaults to TOKEN_PROGRAM_ID. */
  tokenProgram?: PublicKey;
}

export interface InitBeamParams {
  escrowId:  string | number | bigint;
  streamer:  PublicKey;
  /** USDC micro-units (1 USDC = 1_000_000). */
  amountUsdc: number;
  /** Beam duration in seconds (> 0). */
  durationSecs: number;
  usdcMint?:   PublicKey;
  tokenProgram?: PublicKey;
}

export interface ModerateFlashParams {
  escrowId:    string | number | bigint;
  viewer:      PublicKey;
  streamer:    PublicKey;
  usdcMint?:   PublicKey;
  tokenProgram?: PublicKey;
}

export interface InitFlashResult {
  sig:       string;
  escrowPda: string;
  solscanUrl: string;
}

export interface SetDelegateParams {
  /** Ephemeral session-key pubkey. The matching secret stays server-side. */
  sessionKey: PublicKey;
  /** Unix seconds when the delegate self-expires. Capped to 180 days on-chain. */
  expiresAt: number;
}

export interface StartBeamDelegatedIxParams {
  escrowId: string | number | bigint;
  /** Streamer wallet this delegate belongs to (NOT the session key). */
  streamer: PublicKey;
  /** Session-key pubkey (signer that will be attached server-side). */
  sessionKey: PublicKey;
}

export interface SettleBeamDelegatedIxParams {
  escrowId: string | number | bigint;
  /** Streamer wallet this delegate belongs to. Receives the vested portion
   *  and the account rent (via close = streamer). */
  streamer: PublicKey;
  /** Viewer wallet — refund destination, bound by `has_one` on the escrow. */
  viewer: PublicKey;
  /** Session-key pubkey (authorization signer, attached server-side). */
  sessionKey: PublicKey;
  /** Cranker pubkey — fee + ATA-init payer, attached server-side. */
  cranker: PublicKey;
  usdcMint?: PublicKey;
  tokenProgram?: PublicKey;
}

export interface ApproveFlashDelegatedIxParams {
  escrowId: string | number | bigint;
  /** Streamer wallet this delegate belongs to. Receives the full amount +
   *  the EscrowState rent (via close = streamer) + the vault ATA rent. */
  streamer: PublicKey;
  /** Viewer wallet — passed for event-indexing parity with `approve_flash`;
   *  not functionally used on-chain. */
  viewer: PublicKey;
  /** Session-key pubkey (authorization signer, attached server-side). */
  sessionKey: PublicKey;
  /** Cranker pubkey — fee + ATA-init payer, attached server-side. */
  cranker: PublicKey;
  usdcMint?: PublicKey;
  tokenProgram?: PublicKey;
}

export interface DenyFlashDelegatedIxParams {
  escrowId: string | number | bigint;
  /** Streamer wallet this delegate belongs to. Used for the delegate PDA
   *  seed; not a funds destination on deny. */
  streamer: PublicKey;
  /** Viewer wallet — refund destination + EscrowState close recipient. */
  viewer: PublicKey;
  /** Session-key pubkey (authorization signer, attached server-side). */
  sessionKey: PublicKey;
  /** Cranker pubkey — fee + ATA-init payer, attached server-side. */
  cranker: PublicKey;
  usdcMint?: PublicKey;
  tokenProgram?: PublicKey;
}

export interface CancelStalePendingParams {
  escrowId: string | number | bigint;
  /** Viewer wallet — refund destination (bound by the escrow's `has_one`). */
  viewer: PublicKey;
  usdcMint?: PublicKey;
  tokenProgram?: PublicKey;
}

export interface StreamerDelegateState {
  version:    number;
  streamer:   PublicKey;
  sessionKey: PublicKey;
  expiresAt:  number;
  bump:       number;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class CasiEscrowClient {
  private program: Program;
  private cluster: 'devnet' | 'mainnet-beta';

  constructor(
    connection: Connection,
    wallet: AnchorWallet,
    cluster: 'devnet' | 'mainnet-beta' = 'devnet',
    confirmOpts: ConfirmOptions = {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
    },
  ) {
    // Fail loud when the deploy forgot to set NEXT_PUBLIC_CASI_PROGRAM_ID.
    // The module-load fallback (DEFAULT_PROGRAM_ID = SystemProgram) lets the
    // build pass in sandboxes without env vars, but actually sending a tx
    // against the System Program silently no-ops and orphans user funds.
    if (PROGRAM_ID.equals(SystemProgram.programId)) {
      throw new Error(
        'NEXT_PUBLIC_CASI_PROGRAM_ID is unset — refusing to sign against the System Program. ' +
        'Set it in your env (see scripts/sync-program-id.mjs) and redeploy.',
      );
    }
    this.cluster = cluster;
    const provider = new AnchorProvider(connection, wallet, confirmOpts);
    setProvider(provider);
    this.program = new Program(IDL as Idl, provider);
  }

  private get wallet() {
    return (this.program.provider as AnchorProvider).wallet;
  }

  private defaultMint() {
    return this.cluster === 'devnet' ? USDC_MINT_DEVNET : USDC_MINT_MAINNET;
  }

  // -------------------------------------------------------------------------
  // initialize_escrow  (Flash variant: duration_secs = 0, escrow_type_val = 0)
  // -------------------------------------------------------------------------

  async initializeFlash(params: InitFlashParams): Promise<InitFlashResult> {
    const { escrowId, streamer, amountUsdc } = params;
    const usdcMint    = params.usdcMint    ?? this.defaultMint();
    const tokenProgram = params.tokenProgram ?? TOKEN_PROGRAM_ID;

    const escrowIdBytes = uuidToBytes(escrowId);
    const [escrowPda]   = deriveEscrowPda(escrowId);
    const viewer        = this.wallet.publicKey;

    const viewerAta = getAssociatedTokenAddressSync(usdcMint, viewer, false, tokenProgram);
    const vault     = getAssociatedTokenAddressSync(usdcMint, escrowPda, true, tokenProgram);

    // Devnet RPC endpoints regularly miss the confirmation window even for
    // transactions that did land on-chain — the wallet shows the balance
    // deducted but Anchor's .rpc() throws a TransactionExpiredBlockheight
    // ExceededError. That error carries the signature; we fall back to it
    // so the caller still gets something to write into attach-escrow.
    // If the tx really didn't land, admin's subsequent approve_flash will
    // hit AccountNotInitialized and the existing drift-recovery path
    // (probe PDA, run dbOnlyModerate if absent) takes over.
    let sig: string;
    try {
      sig = await (this.program.methods as any)
        .initializeEscrow(escrowIdBytes, new BN(amountUsdc), new BN(0), 0)
        .accounts({
          viewer,
          streamer,
          escrowState:          escrowPda,
          vault,
          viewerAta,
          usdcMint,
          tokenProgram,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram:          SystemProgram.programId,
        })
        .rpc();
    } catch (err: unknown) {
      const maybeSig = (err as { signature?: unknown })?.signature;
      if (typeof maybeSig === 'string' && maybeSig.length >= 64) {
        console.warn('[initializeFlash] confirmation timed out but sig recovered:', maybeSig);
        sig = maybeSig;
      } else {
        throw err;
      }
    }

    return {
      sig,
      escrowPda:  escrowPda.toBase58(),
      solscanUrl: solscanTxUrl(sig, this.cluster),
    };
  }

  // -------------------------------------------------------------------------
  // initialize_escrow  (Beam variant: duration_secs > 0, escrow_type_val = 1)
  // -------------------------------------------------------------------------

  async initializeBeam(params: InitBeamParams): Promise<InitFlashResult> {
    const { escrowId, streamer, amountUsdc, durationSecs } = params;
    if (!(durationSecs > 0)) {
      throw new Error('durationSecs must be > 0 for Beam escrows');
    }
    const usdcMint     = params.usdcMint     ?? this.defaultMint();
    const tokenProgram = params.tokenProgram ?? TOKEN_PROGRAM_ID;

    const escrowIdBytes = uuidToBytes(escrowId);
    const [escrowPda]   = deriveEscrowPda(escrowId);
    const viewer        = this.wallet.publicKey;

    const viewerAta = getAssociatedTokenAddressSync(usdcMint, viewer,   false, tokenProgram);
    const vault     = getAssociatedTokenAddressSync(usdcMint, escrowPda, true, tokenProgram);

    const sig = await (this.program.methods as any)
      .initializeEscrow(escrowIdBytes, new BN(amountUsdc), new BN(durationSecs), 1)
      .accounts({
        viewer,
        streamer,
        escrowState:          escrowPda,
        vault,
        viewerAta,
        usdcMint,
        tokenProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram:          SystemProgram.programId,
      })
      .rpc();

    return {
      sig,
      escrowPda:  escrowPda.toBase58(),
      solscanUrl: solscanTxUrl(sig, this.cluster),
    };
  }

  // -------------------------------------------------------------------------
  // approve_flash
  // -------------------------------------------------------------------------

  async approveFlash(
    params: ModerateFlashParams,
  ): Promise<{ sig: string; solscanUrl: string }> {
    const { escrowId, viewer, streamer } = params;
    const usdcMint    = params.usdcMint    ?? this.defaultMint();
    const tokenProgram = params.tokenProgram ?? TOKEN_PROGRAM_ID;

    const escrowIdBytes  = uuidToBytes(escrowId);
    const [escrowPda]    = deriveEscrowPda(escrowId);
    const vault          = getAssociatedTokenAddressSync(usdcMint, escrowPda, true,  tokenProgram);
    const streamerAta    = getAssociatedTokenAddressSync(usdcMint, streamer,  false, tokenProgram);

    const sig = await (this.program.methods as any)
      .approveFlash(escrowIdBytes)
      .accounts({
        streamer,
        viewer,
        escrowState:          escrowPda,
        vault,
        streamerAta,
        usdcMint,
        tokenProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram:          SystemProgram.programId,
      })
      .rpc();

    return { sig, solscanUrl: solscanTxUrl(sig, this.cluster) };
  }

  // -------------------------------------------------------------------------
  // deny_flash
  // -------------------------------------------------------------------------

  async denyFlash(
    params: ModerateFlashParams,
  ): Promise<{ sig: string; solscanUrl: string }> {
    const { escrowId, viewer, streamer } = params;
    const usdcMint    = params.usdcMint    ?? this.defaultMint();
    const tokenProgram = params.tokenProgram ?? TOKEN_PROGRAM_ID;

    const escrowIdBytes = uuidToBytes(escrowId);
    const [escrowPda]   = deriveEscrowPda(escrowId);
    const vault         = getAssociatedTokenAddressSync(usdcMint, escrowPda, true,  tokenProgram);
    const viewerAta     = getAssociatedTokenAddressSync(usdcMint, viewer,    false, tokenProgram);

    const sig = await (this.program.methods as any)
      .denyFlash(escrowIdBytes)
      .accounts({
        streamer,
        viewer,
        escrowState:          escrowPda,
        vault,
        viewerAta,
        usdcMint,
        tokenProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram:          SystemProgram.programId,
      })
      .rpc();

    return { sig, solscanUrl: solscanTxUrl(sig, this.cluster) };
  }

  // -------------------------------------------------------------------------
  // cancel_escrow  (viewer cancels before streamer acts)
  // -------------------------------------------------------------------------

  async cancelEscrow(params: {
    escrowId:    string | number | bigint;
    usdcMint?:   PublicKey;
    tokenProgram?: PublicKey;
  }): Promise<{ sig: string; solscanUrl: string }> {
    const { escrowId } = params;
    const usdcMint    = params.usdcMint    ?? this.defaultMint();
    const tokenProgram = params.tokenProgram ?? TOKEN_PROGRAM_ID;

    const escrowIdBytes = uuidToBytes(escrowId);
    const [escrowPda]   = deriveEscrowPda(escrowId);
    const viewer        = this.wallet.publicKey;
    const vault         = getAssociatedTokenAddressSync(usdcMint, escrowPda, true,  tokenProgram);
    const viewerAta     = getAssociatedTokenAddressSync(usdcMint, viewer,    false, tokenProgram);

    const sig = await (this.program.methods as any)
      .cancelEscrow(escrowIdBytes)
      .accounts({
        viewer,
        escrowState:          escrowPda,
        vault,
        viewerAta,
        usdcMint,
        tokenProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram:          SystemProgram.programId,
      })
      .rpc();

    return { sig, solscanUrl: solscanTxUrl(sig, this.cluster) };
  }

  // -------------------------------------------------------------------------
  // start_beam  (streamer approves a Beam, sets start_timestamp on-chain)
  // -------------------------------------------------------------------------

  async startBeam(params: {
    escrowId: string | number | bigint;
    streamer: PublicKey;
  }): Promise<{ sig: string; solscanUrl: string }> {
    const { escrowId, streamer } = params;
    const escrowIdBytes = uuidToBytes(escrowId);
    const [escrowPda]   = deriveEscrowPda(escrowId);

    const sig = await (this.program.methods as any)
      .startBeam(escrowIdBytes)
      .accounts({ streamer, escrowState: escrowPda })
      .rpc();

    return { sig, solscanUrl: solscanTxUrl(sig, this.cluster) };
  }

  // -------------------------------------------------------------------------
  // settle_beam  (permissionless; anyone may call after stream starts)
  // -------------------------------------------------------------------------

  async settleBeam(params: {
    escrowId:    string | number | bigint;
    viewer:      PublicKey;
    streamer:    PublicKey;
    usdcMint?:   PublicKey;
    tokenProgram?: PublicKey;
  }): Promise<{ sig: string; solscanUrl: string }> {
    const { escrowId, viewer, streamer } = params;
    const usdcMint    = params.usdcMint    ?? this.defaultMint();
    const tokenProgram = params.tokenProgram ?? TOKEN_PROGRAM_ID;

    const escrowIdBytes = uuidToBytes(escrowId);
    const [escrowPda]   = deriveEscrowPda(escrowId);
    const caller        = this.wallet.publicKey;

    const vault         = getAssociatedTokenAddressSync(usdcMint, escrowPda, true,  tokenProgram);
    const streamerAta   = getAssociatedTokenAddressSync(usdcMint, streamer,  false, tokenProgram);
    const viewerAta     = getAssociatedTokenAddressSync(usdcMint, viewer,    false, tokenProgram);

    const sig = await (this.program.methods as any)
      .settleBeam(escrowIdBytes)
      .accounts({
        caller,
        streamer,
        viewer,
        escrowState:          escrowPda,
        vault,
        streamerAta,
        viewerAta,
        usdcMint,
        tokenProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram:          SystemProgram.programId,
      })
      .rpc();

    return { sig, solscanUrl: solscanTxUrl(sig, this.cluster) };
  }

  // -------------------------------------------------------------------------
  // set_delegate  (streamer installs or rotates a session-key delegate)
  // -------------------------------------------------------------------------

  async setDelegate(
    params: SetDelegateParams,
  ): Promise<{ sig: string; delegatePda: string; solscanUrl: string; alreadyApplied?: boolean }> {
    const { sessionKey, expiresAt } = params;
    const streamer = this.wallet.publicKey;
    const [delegatePda] = deriveDelegatePda(streamer);

    // Pre-flight: if a previous attempt actually landed on-chain but the
    // client didn't observe the confirmation (network blip, slow RPC,
    // user dismissed the popup AFTER signing), the on-chain delegate
    // already matches what we'd register. Skip the wallet popup + tx fee.
    // This is the dominant fix for the "I clicked Rotate three times before
    // it worked" UX — the FIRST one usually landed, the retries were
    // wasted.
    try {
      const existing = await this.fetchDelegate(streamer);
      if (existing && existing.sessionKey.equals(sessionKey)) {
        return {
          sig:           '',
          delegatePda:   delegatePda.toBase58(),
          solscanUrl:    '',
          alreadyApplied: true,
        };
      }
    } catch {
      // Fetch failure is non-fatal — fall through to the regular set_delegate.
    }

    let sig: string;
    try {
      sig = await (this.program.methods as any)
        .setDelegate(sessionKey, new BN(expiresAt))
        .accounts({
          streamer,
          delegate:      delegatePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (err) {
      throw decorateDelegateError(err);
    }

    return {
      sig,
      delegatePda: delegatePda.toBase58(),
      solscanUrl:  solscanTxUrl(sig, this.cluster),
    };
  }

  // -------------------------------------------------------------------------
  // revoke_delegate  (streamer closes their delegate account)
  // -------------------------------------------------------------------------

  async revokeDelegate(): Promise<{ sig: string; solscanUrl: string }> {
    const streamer = this.wallet.publicKey;
    const [delegatePda] = deriveDelegatePda(streamer);

    const sig = await (this.program.methods as any)
      .revokeDelegate()
      .accounts({
        streamer,
        delegate: delegatePda,
      })
      .rpc();

    return { sig, solscanUrl: solscanTxUrl(sig, this.cluster) };
  }

  // -------------------------------------------------------------------------
  // start_beam_delegated  (server-side: built here, signed with session key)
  // -------------------------------------------------------------------------
  //
  // Unlike the other methods, the session key is held server-side and never
  // reaches the client bundle. We therefore return an unsigned
  // `TransactionInstruction` — the caller (server route) is responsible for
  // wrapping it in a `Transaction`, attaching the session-key signature, and
  // sending it. This keeps the wallet-adapter `AnchorWallet` abstraction out
  // of the hot path for a flow it doesn't fit.

  async buildStartBeamDelegatedIx(
    params: StartBeamDelegatedIxParams,
  ): Promise<TransactionInstruction> {
    const { escrowId, streamer, sessionKey } = params;
    const escrowIdBytes   = uuidToBytes(escrowId);
    const [escrowPda]     = deriveEscrowPda(escrowId);
    const [delegatePda]   = deriveDelegatePda(streamer);

    return (this.program.methods as any)
      .startBeamDelegated(escrowIdBytes)
      .accounts({
        session:     sessionKey,
        streamer,
        delegate:    delegatePda,
        escrowState: escrowPda,
      })
      .instruction();
  }

  // -------------------------------------------------------------------------
  // settle_beam_delegated  (server-side: built here, signed with session key
  // and co-signed with the cranker as fee payer)
  // -------------------------------------------------------------------------

  async buildSettleBeamDelegatedIx(
    params: SettleBeamDelegatedIxParams,
  ): Promise<TransactionInstruction> {
    const { escrowId, streamer, viewer, sessionKey, cranker } = params;
    const usdcMint     = params.usdcMint     ?? this.defaultMint();
    const tokenProgram = params.tokenProgram ?? TOKEN_PROGRAM_ID;

    const escrowIdBytes = uuidToBytes(escrowId);
    const [escrowPda]   = deriveEscrowPda(escrowId);
    const [delegatePda] = deriveDelegatePda(streamer);

    const vault       = getAssociatedTokenAddressSync(usdcMint, escrowPda, true,  tokenProgram);
    const streamerAta = getAssociatedTokenAddressSync(usdcMint, streamer,  false, tokenProgram);
    const viewerAta   = getAssociatedTokenAddressSync(usdcMint, viewer,    false, tokenProgram);

    return (this.program.methods as any)
      .settleBeamDelegated(escrowIdBytes)
      .accounts({
        session:     sessionKey,
        cranker,
        streamer,
        viewer,
        delegate:    delegatePda,
        escrowState: escrowPda,
        vault,
        streamerAta,
        viewerAta,
        usdcMint,
        tokenProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram:          SystemProgram.programId,
      })
      .instruction();
  }

  // -------------------------------------------------------------------------
  // approve_flash_delegated  (server-side: built here, signed with session
  // key + cranker; mirrors buildSettleBeamDelegatedIx)
  // -------------------------------------------------------------------------

  async buildApproveFlashDelegatedIx(
    params: ApproveFlashDelegatedIxParams,
  ): Promise<TransactionInstruction> {
    const { escrowId, streamer, viewer, sessionKey, cranker } = params;
    const usdcMint     = params.usdcMint     ?? this.defaultMint();
    const tokenProgram = params.tokenProgram ?? TOKEN_PROGRAM_ID;

    const escrowIdBytes = uuidToBytes(escrowId);
    const [escrowPda]   = deriveEscrowPda(escrowId);
    const [delegatePda] = deriveDelegatePda(streamer);

    const vault       = getAssociatedTokenAddressSync(usdcMint, escrowPda, true,  tokenProgram);
    const streamerAta = getAssociatedTokenAddressSync(usdcMint, streamer,  false, tokenProgram);

    return (this.program.methods as any)
      .approveFlashDelegated(escrowIdBytes)
      .accounts({
        session:     sessionKey,
        cranker,
        streamer,
        viewer,
        delegate:    delegatePda,
        escrowState: escrowPda,
        vault,
        streamerAta,
        usdcMint,
        tokenProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram:          SystemProgram.programId,
      })
      .instruction();
  }

  // -------------------------------------------------------------------------
  // deny_flash_delegated  (server-side: refund path; cranker pays any
  // viewer-ATA init rent, though the viewer almost always has one already
  // since they funded the flash from it)
  // -------------------------------------------------------------------------

  async buildDenyFlashDelegatedIx(
    params: DenyFlashDelegatedIxParams,
  ): Promise<TransactionInstruction> {
    const { escrowId, streamer, viewer, sessionKey, cranker } = params;
    const usdcMint     = params.usdcMint     ?? this.defaultMint();
    const tokenProgram = params.tokenProgram ?? TOKEN_PROGRAM_ID;

    const escrowIdBytes = uuidToBytes(escrowId);
    const [escrowPda]   = deriveEscrowPda(escrowId);
    const [delegatePda] = deriveDelegatePda(streamer);

    const vault     = getAssociatedTokenAddressSync(usdcMint, escrowPda, true,  tokenProgram);
    const viewerAta = getAssociatedTokenAddressSync(usdcMint, viewer,    false, tokenProgram);

    return (this.program.methods as any)
      .denyFlashDelegated(escrowIdBytes)
      .accounts({
        session:     sessionKey,
        cranker,
        streamer,
        viewer,
        delegate:    delegatePda,
        escrowState: escrowPda,
        vault,
        viewerAta,
        usdcMint,
        tokenProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram:          SystemProgram.programId,
      })
      .instruction();
  }

  // -------------------------------------------------------------------------
  // cancel_stale_pending  (permissionless; viewer gets a full refund)
  // -------------------------------------------------------------------------

  async cancelStalePending(
    params: CancelStalePendingParams,
  ): Promise<{ sig: string; solscanUrl: string }> {
    const { escrowId, viewer } = params;
    const usdcMint     = params.usdcMint     ?? this.defaultMint();
    const tokenProgram = params.tokenProgram ?? TOKEN_PROGRAM_ID;

    const escrowIdBytes = uuidToBytes(escrowId);
    const [escrowPda]   = deriveEscrowPda(escrowId);
    const cranker       = this.wallet.publicKey;
    const vault         = getAssociatedTokenAddressSync(usdcMint, escrowPda, true,  tokenProgram);
    const viewerAta     = getAssociatedTokenAddressSync(usdcMint, viewer,    false, tokenProgram);

    const sig = await (this.program.methods as any)
      .cancelStalePending(escrowIdBytes)
      .accounts({
        cranker,
        viewer,
        escrowState:          escrowPda,
        vault,
        viewerAta,
        usdcMint,
        tokenProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram:          SystemProgram.programId,
      })
      .rpc();

    return { sig, solscanUrl: solscanTxUrl(sig, this.cluster) };
  }

  // -------------------------------------------------------------------------
  // fetchDelegate  (read-only helper; returns null if no delegate installed)
  // -------------------------------------------------------------------------

  async fetchDelegate(streamer: PublicKey): Promise<StreamerDelegateState | null> {
    const [delegatePda] = deriveDelegatePda(streamer);
    try {
      const raw = await (this.program.account as any).streamerDelegate.fetch(delegatePda);
      return {
        version:    Number(raw.version),
        streamer:   raw.streamer as PublicKey,
        sessionKey: raw.sessionKey as PublicKey,
        expiresAt:  Number(raw.expiresAt.toString()),
        bump:       Number(raw.bump),
      };
    } catch {
      return null;
    }
  }
}
