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
  type ConfirmOptions,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
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

const ESCROW_SEED = Buffer.from('casi-escrow');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a UUID string ("xxxxxxxx-xxxx-…") to a 32-byte Uint8Array seed. */
export function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32) throw new Error(`Invalid UUID: ${uuid}`);
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Derive the escrow PDA address from a UUID string or raw bytes. */
export function deriveEscrowPda(
  escrowId: string | Uint8Array,
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  const idBytes =
    escrowId instanceof Uint8Array ? escrowId : uuidToBytes(escrowId);
  return PublicKey.findProgramAddressSync([ESCROW_SEED, idBytes], programId);
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

// ---------------------------------------------------------------------------
// Parameter types
// ---------------------------------------------------------------------------

export interface InitFlashParams {
  escrowId:  string;
  streamer:  PublicKey;
  /** USDC micro-units (1 USDC = 1_000_000). */
  amountUsdc: number;
  usdcMint?:   PublicKey;
  /** SPL Token or Token-2022 program ID. Defaults to TOKEN_PROGRAM_ID. */
  tokenProgram?: PublicKey;
}

export interface InitBeamParams {
  escrowId:  string;
  streamer:  PublicKey;
  /** USDC micro-units (1 USDC = 1_000_000). */
  amountUsdc: number;
  /** Beam duration in seconds (> 0). */
  durationSecs: number;
  usdcMint?:   PublicKey;
  tokenProgram?: PublicKey;
}

export interface ModerateFlashParams {
  escrowId:    string;
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

    const sig = await (this.program.methods as any)
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
    escrowId:    string;
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
    escrowId: string;
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
    escrowId:    string;
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
}
