/**
 * casi-escrow.ts
 *
 * TypeScript client for the CASI Escrow Anchor program.
 *
 * Usage:
 *   const client = new CasiEscrowClient(connection, wallet);
 *   const { sig, escrowPda } = await client.initializeFlash({
 *     escrowId, streamer, amountUsdc, viewerAta
 *   });
 *
 * Program ID and USDC mint are configured via constants below.
 * Update PROGRAM_ID after deploying to devnet/mainnet.
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
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import IDL from '@/idl/casi_escrow.json';

// ---------------------------------------------------------------------------
// Constants — update after program deploy
// ---------------------------------------------------------------------------

/** CASI Escrow program ID (devnet placeholder — replace after anchor deploy). */
export const PROGRAM_ID = new PublicKey(
  'CASIesCRow1111111111111111111111111111111111',
);

/** CASI treasury fee wallet (receives 5% of each Flash/Beam). */
export const CASI_FEE_WALLET = new PublicKey(
  'CASIFeeWaLLet1111111111111111111111111111111',
);

/** Devnet USDC mint (Circle Test Token). */
export const USDC_MINT_DEVNET = new PublicKey(
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
);

/** Mainnet USDC mint. */
export const USDC_MINT_MAINNET = new PublicKey(
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
);

const ESCROW_SEED = Buffer.from('casi-escrow');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a UUID string to a 32-byte Uint8Array seed. */
export function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32) throw new Error(`Invalid UUID: ${uuid}`);
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Derive the escrow PDA from a UUID string. */
export function deriveEscrowPda(
  escrowId: string | Uint8Array,
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  const idBytes =
    escrowId instanceof Uint8Array ? escrowId : uuidToBytes(escrowId);
  return PublicKey.findProgramAddressSync(
    [ESCROW_SEED, idBytes],
    programId,
  );
}

/** Solscan transaction URL (devnet or mainnet). */
export function solscanTxUrl(sig: string, cluster: 'devnet' | 'mainnet-beta' = 'devnet'): string {
  const q = cluster === 'devnet' ? '?cluster=devnet' : '';
  return `https://solscan.io/tx/${sig}${q}`;
}

/** Solscan account URL. */
export function solscanAccountUrl(pubkey: string, cluster: 'devnet' | 'mainnet-beta' = 'devnet'): string {
  const q = cluster === 'devnet' ? '?cluster=devnet' : '';
  return `https://solscan.io/account/${pubkey}${q}`;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface InitFlashParams {
  /** UUID string for this flash (from DB). */
  escrowId: string;
  /** Streamer's Solana wallet pubkey. */
  streamer: PublicKey;
  /** Amount in USDC micro-units (1 USDC = 1_000_000). */
  amountUsdc: number;
  /** USDC mint to use (defaults to devnet). */
  usdcMint?: PublicKey;
}

export interface InitFlashResult {
  /** Transaction signature. */
  sig: string;
  /** PDA address of the escrow account (base58). */
  escrowPda: string;
  /** Solscan link for the transaction. */
  solscanUrl: string;
}

export interface ModerateFlashParams {
  escrowId: string;
  /** Viewer's Solana wallet pubkey (needed for deny/cancel). */
  viewer: PublicKey;
  /** Streamer's Solana wallet pubkey. */
  streamer: PublicKey;
  usdcMint?: PublicKey;
}

export class CasiEscrowClient {
  private program: Program;
  private connection: Connection;
  private wallet: AnchorWallet;
  private cluster: 'devnet' | 'mainnet-beta';

  constructor(
    connection: Connection,
    wallet: AnchorWallet,
    cluster: 'devnet' | 'mainnet-beta' = 'devnet',
    confirmOpts: ConfirmOptions = { commitment: 'confirmed', preflightCommitment: 'confirmed' },
  ) {
    this.connection = connection;
    this.wallet = wallet;
    this.cluster = cluster;

    const provider = new AnchorProvider(connection, wallet, confirmOpts);
    setProvider(provider);
    this.program = new Program(IDL as Idl, provider);
  }

  // -------------------------------------------------------------------------
  // Flash — initialize (viewer locks funds)
  // -------------------------------------------------------------------------

  async initializeFlash(params: InitFlashParams): Promise<InitFlashResult> {
    const { escrowId, streamer, amountUsdc } = params;
    const usdcMint = params.usdcMint ?? (this.cluster === 'devnet' ? USDC_MINT_DEVNET : USDC_MINT_MAINNET);

    const escrowIdBytes = Array.from(uuidToBytes(escrowId));
    const [escrowPda] = deriveEscrowPda(escrowId);
    const viewer = this.wallet.publicKey;

    const viewerAta = getAssociatedTokenAddressSync(usdcMint, viewer);
    const vault = getAssociatedTokenAddressSync(usdcMint, escrowPda, true);

    const sig = await (this.program.methods as any)
      .initializeEscrow(escrowIdBytes, new BN(amountUsdc), new BN(0), 0)
      .accounts({
        viewer,
        streamer,
        escrowState: escrowPda,
        vault,
        viewerAta,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return {
      sig,
      escrowPda: escrowPda.toBase58(),
      solscanUrl: solscanTxUrl(sig, this.cluster),
    };
  }

  // -------------------------------------------------------------------------
  // Flash — streamer approves (releases 95% + 5% fee)
  // -------------------------------------------------------------------------

  async approveFlash(params: ModerateFlashParams): Promise<{ sig: string; solscanUrl: string }> {
    const { escrowId, viewer, streamer } = params;
    const usdcMint = params.usdcMint ?? (this.cluster === 'devnet' ? USDC_MINT_DEVNET : USDC_MINT_MAINNET);

    const escrowIdBytes = Array.from(uuidToBytes(escrowId));
    const [escrowPda] = deriveEscrowPda(escrowId);

    const vault = getAssociatedTokenAddressSync(usdcMint, escrowPda, true);
    const streamerAta = getAssociatedTokenAddressSync(usdcMint, streamer);
    const feeWalletAta = getAssociatedTokenAddressSync(usdcMint, CASI_FEE_WALLET);

    const sig = await (this.program.methods as any)
      .approveFlash(escrowIdBytes)
      .accounts({
        streamer,
        viewer,
        escrowState: escrowPda,
        vault,
        streamerAta,
        feeWalletAta,
        feeWallet: CASI_FEE_WALLET,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { sig, solscanUrl: solscanTxUrl(sig, this.cluster) };
  }

  // -------------------------------------------------------------------------
  // Flash — streamer denies (full refund to viewer)
  // -------------------------------------------------------------------------

  async denyFlash(params: ModerateFlashParams): Promise<{ sig: string; solscanUrl: string }> {
    const { escrowId, viewer, streamer } = params;
    const usdcMint = params.usdcMint ?? (this.cluster === 'devnet' ? USDC_MINT_DEVNET : USDC_MINT_MAINNET);

    const escrowIdBytes = Array.from(uuidToBytes(escrowId));
    const [escrowPda] = deriveEscrowPda(escrowId);

    const vault = getAssociatedTokenAddressSync(usdcMint, escrowPda, true);
    const viewerAta = getAssociatedTokenAddressSync(usdcMint, viewer);

    const sig = await (this.program.methods as any)
      .denyFlash(escrowIdBytes)
      .accounts({
        streamer,
        viewer,
        escrowState: escrowPda,
        vault,
        viewerAta,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { sig, solscanUrl: solscanTxUrl(sig, this.cluster) };
  }

  // -------------------------------------------------------------------------
  // Flash / Beam — viewer cancels (before streamer acts)
  // -------------------------------------------------------------------------

  async cancelEscrow(params: { escrowId: string; usdcMint?: PublicKey }): Promise<{ sig: string; solscanUrl: string }> {
    const { escrowId } = params;
    const usdcMint = params.usdcMint ?? (this.cluster === 'devnet' ? USDC_MINT_DEVNET : USDC_MINT_MAINNET);

    const escrowIdBytes = Array.from(uuidToBytes(escrowId));
    const [escrowPda] = deriveEscrowPda(escrowId);
    const viewer = this.wallet.publicKey;

    const vault = getAssociatedTokenAddressSync(usdcMint, escrowPda, true);
    const viewerAta = getAssociatedTokenAddressSync(usdcMint, viewer);

    const sig = await (this.program.methods as any)
      .cancelEscrow(escrowIdBytes)
      .accounts({
        viewer,
        escrowState: escrowPda,
        vault,
        viewerAta,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { sig, solscanUrl: solscanTxUrl(sig, this.cluster) };
  }

  // -------------------------------------------------------------------------
  // Beam — streamer starts streaming (sets start_timestamp)
  // -------------------------------------------------------------------------

  async startBeam(params: { escrowId: string; streamer: PublicKey }): Promise<{ sig: string; solscanUrl: string }> {
    const { escrowId, streamer } = params;
    const escrowIdBytes = Array.from(uuidToBytes(escrowId));
    const [escrowPda] = deriveEscrowPda(escrowId);

    const sig = await (this.program.methods as any)
      .startBeam(escrowIdBytes)
      .accounts({
        streamer,
        escrowState: escrowPda,
      })
      .rpc();

    return { sig, solscanUrl: solscanTxUrl(sig, this.cluster) };
  }

  // -------------------------------------------------------------------------
  // Beam — permissionless settle (anyone can call)
  // -------------------------------------------------------------------------

  async settleBeam(params: {
    escrowId: string;
    viewer: PublicKey;
    streamer: PublicKey;
    usdcMint?: PublicKey;
  }): Promise<{ sig: string; solscanUrl: string }> {
    const { escrowId, viewer, streamer } = params;
    const usdcMint = params.usdcMint ?? (this.cluster === 'devnet' ? USDC_MINT_DEVNET : USDC_MINT_MAINNET);

    const escrowIdBytes = Array.from(uuidToBytes(escrowId));
    const [escrowPda] = deriveEscrowPda(escrowId);
    const caller = this.wallet.publicKey;

    const vault = getAssociatedTokenAddressSync(usdcMint, escrowPda, true);
    const streamerAta = getAssociatedTokenAddressSync(usdcMint, streamer);
    const viewerAta = getAssociatedTokenAddressSync(usdcMint, viewer);
    const feeWalletAta = getAssociatedTokenAddressSync(usdcMint, CASI_FEE_WALLET);

    const sig = await (this.program.methods as any)
      .settleBeam(escrowIdBytes)
      .accounts({
        caller,
        streamer,
        viewer,
        escrowState: escrowPda,
        vault,
        streamerAta,
        viewerAta,
        feeWalletAta,
        feeWallet: CASI_FEE_WALLET,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { sig, solscanUrl: solscanTxUrl(sig, this.cluster) };
  }
}
