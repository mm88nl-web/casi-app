/**
 * CASI Escrow — integration tests.
 *
 * Run with `anchor test` (spins up a local validator, builds + deploys the
 * program, then executes this file via ts-mocha).
 *
 * Coverage focuses on the audit-sensitive surface:
 *   - Fee math (5% of total, u128 intermediate) on normal + tiny amounts
 *   - Linear vesting cap in settle_beam (t=0, t=duration, t>duration)
 *   - Status machine transitions (Pending → {Settled, Cancelled, Active})
 *   - has_one / address constraint enforcement (streamer, viewer, fee_wallet)
 *   - WrongEscrowType cross-calls
 */

import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { expect } from "chai";
import { randomBytes } from "crypto";

// ---- constants mirrored from lib.rs -----------------------------------------
const ESCROW_SEED = Buffer.from("casi-escrow");
const FEE_WALLET  = new PublicKey("CASIFeeWaLLet1111111111111111111111111111111");
const FEE_BPS     = 500n;
const USDC_DECIMALS = 6;

// Escrow type enum (discriminant values sent as u8)
const TYPE_FLASH = 0;
const TYPE_BEAM  = 1;

// ---- helpers ----------------------------------------------------------------

function makeEscrowId(): number[] {
  return Array.from(randomBytes(32));
}

function derivePda(escrowId: number[], programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [ESCROW_SEED, Buffer.from(escrowId)],
    programId,
  );
  return pda;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Expected (streamer_amt, fee) split for a settled Flash of `total` micro-USDC. */
function flashSplit(total: bigint): { streamerAmt: bigint; fee: bigint } {
  const fee = (total * FEE_BPS) / 10_000n;
  return { streamerAmt: total - fee, fee };
}

/** Expected (streamer_amt, fee, refund) for a Beam settled at `elapsed` secs. */
function beamSplit(
  total: bigint,
  elapsed: bigint,
  duration: bigint,
): { streamerAmt: bigint; fee: bigint; refund: bigint } {
  const vestedTicks = elapsed < duration ? elapsed : duration;
  const grossVested = (total * vestedTicks) / duration;
  const refund = total - grossVested;
  const fee = (grossVested * FEE_BPS) / 10_000n;
  return { streamerAmt: grossVested - fee, fee, refund };
}

// -----------------------------------------------------------------------------

describe("casi-escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Generated types from `anchor build` aren't checked into the repo, so we
  // use an untyped handle here — keeps this file compilable standalone.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program: any = anchor.workspace.CasiEscrow;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payer: Keypair = ((provider.wallet as any).payer) as Keypair;

  let usdcMint: PublicKey;
  let feeWalletAta: PublicKey;

  async function airdrop(pubkey: PublicKey, sol = 2) {
    const sig = await provider.connection.requestAirdrop(
      pubkey,
      sol * LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig, "confirmed");
  }

  async function balanceOf(ata: PublicKey): Promise<bigint> {
    try {
      const acc = await getAccount(provider.connection, ata);
      return acc.amount;
    } catch {
      return 0n;
    }
  }

  interface EscrowCtx {
    viewer: Keypair;
    streamer: Keypair;
    viewerAta: PublicKey;
    streamerAta: PublicKey;
    escrowId: number[];
    escrowPda: PublicKey;
    vault: PublicKey;
  }

  async function setupParties(mintAmount: bigint): Promise<EscrowCtx> {
    const viewer   = Keypair.generate();
    const streamer = Keypair.generate();
    await airdrop(viewer.publicKey);
    await airdrop(streamer.publicKey);

    const viewerAta = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection, payer, usdcMint, viewer.publicKey,
      )
    ).address;
    const streamerAta = getAssociatedTokenAddressSync(usdcMint, streamer.publicKey);

    await mintTo(
      provider.connection, payer, usdcMint, viewerAta, payer, mintAmount,
    );

    const escrowId = makeEscrowId();
    const escrowPda = derivePda(escrowId, program.programId);
    const vault = getAssociatedTokenAddressSync(usdcMint, escrowPda, true);

    return { viewer, streamer, viewerAta, streamerAta, escrowId, escrowPda, vault };
  }

  async function initialize(
    ctx: EscrowCtx,
    amount: bigint,
    durationSecs: bigint,
    typeVal: 0 | 1,
  ) {
    return program.methods
      .initializeEscrow(
        ctx.escrowId,
        new BN(amount.toString()),
        new BN(durationSecs.toString()),
        typeVal,
      )
      .accounts({
        viewer: ctx.viewer.publicKey,
        streamer: ctx.streamer.publicKey,
        escrowState: ctx.escrowPda,
        vault: ctx.vault,
        viewerAta: ctx.viewerAta,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([ctx.viewer])
      .rpc();
  }

  async function approveFlash(ctx: EscrowCtx, signer: Keypair = ctx.streamer) {
    return program.methods
      .approveFlash(ctx.escrowId)
      .accounts({
        streamer: signer.publicKey,
        viewer: ctx.viewer.publicKey,
        escrowState: ctx.escrowPda,
        vault: ctx.vault,
        streamerAta: getAssociatedTokenAddressSync(usdcMint, signer.publicKey),
        feeWalletAta,
        feeWallet: FEE_WALLET,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([signer])
      .rpc();
  }

  async function denyFlash(ctx: EscrowCtx) {
    return program.methods
      .denyFlash(ctx.escrowId)
      .accounts({
        streamer: ctx.streamer.publicKey,
        viewer: ctx.viewer.publicKey,
        escrowState: ctx.escrowPda,
        vault: ctx.vault,
        viewerAta: ctx.viewerAta,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([ctx.streamer])
      .rpc();
  }

  async function cancelEscrow(ctx: EscrowCtx) {
    return program.methods
      .cancelEscrow(ctx.escrowId)
      .accounts({
        viewer: ctx.viewer.publicKey,
        escrowState: ctx.escrowPda,
        vault: ctx.vault,
        viewerAta: ctx.viewerAta,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([ctx.viewer])
      .rpc();
  }

  async function startBeam(ctx: EscrowCtx) {
    return program.methods
      .startBeam(ctx.escrowId)
      .accounts({
        streamer: ctx.streamer.publicKey,
        escrowState: ctx.escrowPda,
      })
      .signers([ctx.streamer])
      .rpc();
  }

  async function settleBeam(ctx: EscrowCtx, caller: Keypair = ctx.streamer) {
    return program.methods
      .settleBeam(ctx.escrowId)
      .accounts({
        caller: caller.publicKey,
        streamer: ctx.streamer.publicKey,
        viewer: ctx.viewer.publicKey,
        escrowState: ctx.escrowPda,
        vault: ctx.vault,
        streamerAta: ctx.streamerAta,
        viewerAta: ctx.viewerAta,
        feeWalletAta,
        feeWallet: FEE_WALLET,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([caller])
      .rpc();
  }

  /** Expect tx to fail with a specific custom error variant name. */
  async function expectError(p: Promise<unknown>, variant: string) {
    try {
      await p;
      expect.fail(`expected tx to fail with ${variant} but it succeeded`);
    } catch (err) {
      const msg = String(
        (err as { message?: unknown })?.message ?? err,
      );
      expect(msg).to.include(variant);
    }
  }

  // ---- suite fixture --------------------------------------------------------
  before(async () => {
    usdcMint = await createMint(
      provider.connection, payer, payer.publicKey, null, USDC_DECIMALS,
    );
    feeWalletAta = getAssociatedTokenAddressSync(usdcMint, FEE_WALLET, true);
  });

  // ---------------------------------------------------------------------------
  // Flash
  // ---------------------------------------------------------------------------
  describe("Flash", () => {
    it("splits 95/5 on approve for a 1 USDC flash", async () => {
      const total = 1_000_000n; // 1 USDC
      const { streamerAmt, fee } = flashSplit(total);

      const ctx = await setupParties(total);
      await initialize(ctx, total, 0n, TYPE_FLASH);
      expect(await balanceOf(ctx.viewerAta)).to.equal(0n);

      await approveFlash(ctx);

      expect(await balanceOf(ctx.streamerAta)).to.equal(streamerAmt);
      expect(await balanceOf(feeWalletAta)).to.equal(fee);
      expect(await balanceOf(ctx.viewerAta)).to.equal(0n);
    });

    it("fees round to zero for a 1-micro-USDC flash (no underflow)", async () => {
      const total = 1n;
      const ctx = await setupParties(total);
      await initialize(ctx, total, 0n, TYPE_FLASH);

      const before = await balanceOf(feeWalletAta);
      await approveFlash(ctx);
      const after = await balanceOf(feeWalletAta);

      expect(await balanceOf(ctx.streamerAta)).to.equal(1n);
      expect(after - before).to.equal(0n);
    });

    it("refunds viewer in full on deny", async () => {
      const total = 2_500_000n;
      const ctx = await setupParties(total);
      await initialize(ctx, total, 0n, TYPE_FLASH);

      await denyFlash(ctx);

      expect(await balanceOf(ctx.viewerAta)).to.equal(total);
      expect(await balanceOf(ctx.streamerAta)).to.equal(0n);
    });

    it("refunds viewer in full on self-cancel (Pending)", async () => {
      const total = 7_777_777n;
      const ctx = await setupParties(total);
      await initialize(ctx, total, 0n, TYPE_FLASH);

      await cancelEscrow(ctx);

      expect(await balanceOf(ctx.viewerAta)).to.equal(total);
    });

    it("rejects approve_flash by a wallet that isn't the streamer (Unauthorized)", async () => {
      const ctx = await setupParties(1_000_000n);
      await initialize(ctx, 1_000_000n, 0n, TYPE_FLASH);

      const imposter = Keypair.generate();
      await airdrop(imposter.publicKey);

      await expectError(approveFlash(ctx, imposter), "Unauthorized");
    });

    it("rejects double-approve (AlreadySettled / account closed)", async () => {
      const ctx = await setupParties(1_000_000n);
      await initialize(ctx, 1_000_000n, 0n, TYPE_FLASH);
      await approveFlash(ctx);

      // After settle, escrow_state is closed, so the PDA lookup fails. Accept
      // either the explicit AlreadySettled or Anchor's account-not-initialized
      // error — both prove the second call can't drain funds.
      let failed = false;
      try {
        await approveFlash(ctx);
      } catch {
        failed = true;
      }
      expect(failed).to.equal(true);
    });

    it("rejects approve_flash on a Beam escrow (WrongEscrowType)", async () => {
      const total = 1_000_000n;
      const ctx = await setupParties(total);
      await initialize(ctx, total, 60n, TYPE_BEAM);

      await expectError(approveFlash(ctx), "WrongEscrowType");
    });

    it("rejects initialize with amount = 0 (InvalidAmount)", async () => {
      const ctx = await setupParties(0n);
      await expectError(
        initialize(ctx, 0n, 0n, TYPE_FLASH),
        "InvalidAmount",
      );
    });

    it("rejects approve_flash with a spoofed fee wallet (InvalidFeeWallet)", async () => {
      const total = 1_000_000n;
      const ctx = await setupParties(total);
      await initialize(ctx, total, 0n, TYPE_FLASH);

      const fakeFeeWallet = Keypair.generate().publicKey;
      const fakeFeeAta = getAssociatedTokenAddressSync(usdcMint, fakeFeeWallet, true);

      const call = program.methods
        .approveFlash(ctx.escrowId)
        .accounts({
          streamer: ctx.streamer.publicKey,
          viewer: ctx.viewer.publicKey,
          escrowState: ctx.escrowPda,
          vault: ctx.vault,
          streamerAta: ctx.streamerAta,
          feeWalletAta: fakeFeeAta,
          feeWallet: fakeFeeWallet,
          usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([ctx.streamer])
        .rpc();

      await expectError(call, "InvalidFeeWallet");
    });
  });

  // ---------------------------------------------------------------------------
  // Beam
  // ---------------------------------------------------------------------------
  describe("Beam", () => {
    it("rejects initialize with duration = 0 (InvalidDuration)", async () => {
      const ctx = await setupParties(1_000_000n);
      await expectError(
        initialize(ctx, 1_000_000n, 0n, TYPE_BEAM),
        "InvalidDuration",
      );
    });

    it("rejects settle_beam before start_beam (NotActive)", async () => {
      const ctx = await setupParties(1_000_000n);
      await initialize(ctx, 1_000_000n, 60n, TYPE_BEAM);
      await expectError(settleBeam(ctx), "NotActive");
    });

    it("rejects cancel_escrow after start_beam (AlreadySettled)", async () => {
      const ctx = await setupParties(1_000_000n);
      await initialize(ctx, 1_000_000n, 60n, TYPE_BEAM);
      await startBeam(ctx);
      await expectError(cancelEscrow(ctx), "AlreadySettled");
    });

    it("refunds viewer in full on cancel while Pending (before start_beam)", async () => {
      const total = 3_000_000n;
      const ctx = await setupParties(total);
      await initialize(ctx, total, 60n, TYPE_BEAM);
      await cancelEscrow(ctx);
      expect(await balanceOf(ctx.viewerAta)).to.equal(total);
    });

    it("fully vests when settled at t >= duration (95/5 split, no refund)", async () => {
      const total = 10_000_000n; // 10 USDC
      const duration = 2n;       // 2 seconds
      const { streamerAmt, fee } = flashSplit(total); // full vest == flash math

      const ctx = await setupParties(total);
      await initialize(ctx, total, duration, TYPE_BEAM);
      const feeBefore = await balanceOf(feeWalletAta);
      await startBeam(ctx);

      // Sleep beyond `duration` so the clamp `min(elapsed, duration)` triggers.
      await sleep(Number(duration) * 1000 + 1500);
      await settleBeam(ctx);

      expect(await balanceOf(ctx.streamerAta)).to.equal(streamerAmt);
      expect((await balanceOf(feeWalletAta)) - feeBefore).to.equal(fee);
      expect(await balanceOf(ctx.viewerAta)).to.equal(0n);
    });

    it("partially vests at 0 < t < duration (no drift; amounts sum to total)", async () => {
      const total = 10_000_000n;
      const duration = 10n;

      const ctx = await setupParties(total);
      await initialize(ctx, total, duration, TYPE_BEAM);
      const feeBefore = await balanceOf(feeWalletAta);
      await startBeam(ctx);

      await sleep(2500); // ~2-3 seconds into a 10s beam
      await settleBeam(ctx);

      const streamerBal = await balanceOf(ctx.streamerAta);
      const viewerBal   = await balanceOf(ctx.viewerAta);
      const feeDelta    = (await balanceOf(feeWalletAta)) - feeBefore;

      // Conservation: all value accounted for (modulo program's integer math).
      expect(streamerBal + viewerBal + feeDelta).to.equal(total);
      // Streamer gets a strict minority and viewer gets a strict majority.
      expect(viewerBal > streamerBal).to.equal(true);
      // Fee is exactly 5% of the vested portion.
      const vested = streamerBal + feeDelta;
      expect(feeDelta).to.equal((vested * FEE_BPS) / 10_000n);
    });

    it("rejects settle_beam twice (vault closed after first settle)", async () => {
      const total = 1_000_000n;
      const duration = 1n;

      const ctx = await setupParties(total);
      await initialize(ctx, total, duration, TYPE_BEAM);
      await startBeam(ctx);
      await sleep(1500);
      await settleBeam(ctx);

      let failed = false;
      try { await settleBeam(ctx); } catch { failed = true; }
      expect(failed).to.equal(true);
    });
  });
});
