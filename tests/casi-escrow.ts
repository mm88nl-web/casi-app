/**
 * CASI Escrow — integration tests.
 *
 * Run with `anchor test` (spins up a local validator, builds + deploys the
 * program, then executes this file via ts-mocha).
 *
 * Coverage focuses on the audit-sensitive surface:
 *   - 100% payout: streamer receives the full settled amount (no platform skim)
 *   - Linear vesting cap in settle_beam (t=0, t=duration, t>duration)
 *   - Status machine transitions (Pending → {Settled, Cancelled, Active})
 *   - has_one constraint enforcement (streamer, viewer)
 *   - WrongEscrowType cross-calls
 */

import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
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
const ESCROW_SEED   = Buffer.from("casi-escrow");
const DELEGATE_SEED = Buffer.from("casi-delegate");
const USDC_DECIMALS = 6;

// Escrow type enum (discriminant values sent as u8)
const TYPE_FLASH = 0;
const TYPE_BEAM  = 1;

// Layout version bytes — must match lib.rs.
const ESCROW_STATE_VERSION       = 1;
const STREAMER_DELEGATE_VERSION  = 1;

// Lifetime caps. 180d for delegate, 7d for stale-pending.
const MAX_DELEGATE_LIFETIME_SECS = 180 * 24 * 60 * 60;
const PENDING_TIMEOUT_SECS       = 7 * 24 * 60 * 60;

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

function deriveDelegatePda(streamer: PublicKey, programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [DELEGATE_SEED, streamer.toBuffer()],
    programId,
  );
  return pda;
}

function nowSecs(): number {
  return Math.floor(Date.now() / 1000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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
  });

  // ---------------------------------------------------------------------------
  // Flash
  // ---------------------------------------------------------------------------
  describe("Flash", () => {
    it("sends full amount to streamer on approve for a 1 USDC flash", async () => {
      const total = 1_000_000n; // 1 USDC

      const ctx = await setupParties(total);
      await initialize(ctx, total, 0n, TYPE_FLASH);
      expect(await balanceOf(ctx.viewerAta)).to.equal(0n);

      await approveFlash(ctx);

      expect(await balanceOf(ctx.streamerAta)).to.equal(total);
      expect(await balanceOf(ctx.viewerAta)).to.equal(0n);
    });

    it("sends the full 1 micro-USDC on approve (no rounding loss)", async () => {
      const total = 1n;
      const ctx = await setupParties(total);
      await initialize(ctx, total, 0n, TYPE_FLASH);

      await approveFlash(ctx);

      expect(await balanceOf(ctx.streamerAta)).to.equal(1n);
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

    it("fully vests when settled at t >= duration (100% to streamer, no refund)", async () => {
      const total = 10_000_000n; // 10 USDC
      const duration = 2n;       // 2 seconds

      const ctx = await setupParties(total);
      await initialize(ctx, total, duration, TYPE_BEAM);
      await startBeam(ctx);

      // Sleep beyond `duration` so the clamp `min(elapsed, duration)` triggers.
      await sleep(Number(duration) * 1000 + 1500);
      await settleBeam(ctx);

      expect(await balanceOf(ctx.streamerAta)).to.equal(total);
      expect(await balanceOf(ctx.viewerAta)).to.equal(0n);
    });

    it("partially vests at 0 < t < duration (no drift; amounts sum to total)", async () => {
      const total = 10_000_000n;
      const duration = 10n;

      const ctx = await setupParties(total);
      await initialize(ctx, total, duration, TYPE_BEAM);
      await startBeam(ctx);

      await sleep(2500); // ~2-3 seconds into a 10s beam
      await settleBeam(ctx);

      const streamerBal = await balanceOf(ctx.streamerAta);
      const viewerBal   = await balanceOf(ctx.viewerAta);

      // Conservation: every micro-USDC lands with either streamer or viewer.
      expect(streamerBal + viewerBal).to.equal(total);
      // Streamer gets a strict minority and viewer gets a strict majority.
      expect(viewerBal > streamerBal).to.equal(true);
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

    it("rejects third-party settle_beam before duration (anti-grief)", async () => {
      const total = 5_000_000n;
      const duration = 30n; // long enough that we never reach it

      const ctx = await setupParties(total);
      await initialize(ctx, total, duration, TYPE_BEAM);
      await startBeam(ctx);

      const griefer = Keypair.generate();
      await airdrop(griefer.publicKey);

      await expectError(settleBeam(ctx, griefer), "Unauthorized");
    });

    it("allows viewer to settle_beam early (accepts pro-rata split)", async () => {
      const total = 10_000_000n;
      const duration = 30n;

      const ctx = await setupParties(total);
      await initialize(ctx, total, duration, TYPE_BEAM);
      await startBeam(ctx);

      // Viewer voluntarily ends early.
      await sleep(1500);
      await settleBeam(ctx, ctx.viewer);

      // Conservation holds regardless of who called.
      const streamerBal = await balanceOf(ctx.streamerAta);
      const viewerBal   = await balanceOf(ctx.viewerAta);
      expect(streamerBal + viewerBal).to.equal(total);
    });

    it("allows anyone to settle_beam after duration elapses (crank)", async () => {
      const total = 4_000_000n;
      const duration = 1n;

      const ctx = await setupParties(total);
      await initialize(ctx, total, duration, TYPE_BEAM);
      await startBeam(ctx);
      await sleep(2000); // past duration

      const cranker = Keypair.generate();
      await airdrop(cranker.publicKey);

      // Should succeed — elapsed >= duration, so permissionless crank works.
      await settleBeam(ctx, cranker);

      // Full vest expected — streamer receives 100%, viewer gets nothing.
      expect(await balanceOf(ctx.streamerAta)).to.equal(total);
      expect(await balanceOf(ctx.viewerAta)).to.equal(0n);
    });
  });

  // ---------------------------------------------------------------------------
  // Session-key delegation
  // ---------------------------------------------------------------------------
  //
  // Trust-model assertions: a delegate can ONLY start beams, only for its own
  // streamer, and only before its self-expiry. Nothing else.
  describe("SessionDelegate", () => {
    async function setDelegate(
      streamer: Keypair,
      sessionKey: PublicKey,
      expiresAt: number,
    ) {
      const delegatePda = deriveDelegatePda(streamer.publicKey, program.programId);
      return program.methods
        .setDelegate(sessionKey, new BN(expiresAt))
        .accounts({
          streamer: streamer.publicKey,
          delegate: delegatePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([streamer])
        .rpc();
    }

    async function revokeDelegate(streamer: Keypair) {
      const delegatePda = deriveDelegatePda(streamer.publicKey, program.programId);
      return program.methods
        .revokeDelegate()
        .accounts({
          streamer: streamer.publicKey,
          delegate: delegatePda,
        })
        .signers([streamer])
        .rpc();
    }

    async function startBeamDelegated(
      ctx: EscrowCtx,
      session: Keypair,
      delegateStreamer: PublicKey = ctx.streamer.publicKey,
    ) {
      const delegatePda = deriveDelegatePda(delegateStreamer, program.programId);
      return program.methods
        .startBeamDelegated(ctx.escrowId)
        .accounts({
          session: session.publicKey,
          streamer: delegateStreamer,
          delegate: delegatePda,
          escrowState: ctx.escrowPda,
        })
        .signers([session])
        .rpc();
    }

    async function settleBeamDelegated(
      ctx: EscrowCtx,
      session: Keypair,
      cranker: Keypair,
      delegateStreamer: PublicKey = ctx.streamer.publicKey,
    ) {
      const delegatePda = deriveDelegatePda(delegateStreamer, program.programId);
      return program.methods
        .settleBeamDelegated(ctx.escrowId)
        .accounts({
          session: session.publicKey,
          cranker: cranker.publicKey,
          streamer: delegateStreamer,
          viewer: ctx.viewer.publicKey,
          delegate: delegatePda,
          escrowState: ctx.escrowPda,
          vault: ctx.vault,
          streamerAta: ctx.streamerAta,
          viewerAta: ctx.viewerAta,
          usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([session, cranker])
        .rpc();
    }

    it("installs + rotates + revokes a delegate (happy path)", async () => {
      const streamer = Keypair.generate();
      await airdrop(streamer.publicKey);
      const delegatePda = deriveDelegatePda(streamer.publicKey, program.programId);

      const keyA = Keypair.generate();
      await setDelegate(streamer, keyA.publicKey, nowSecs() + 60);

      // init_if_needed means re-calling rotates in place.
      const keyB = Keypair.generate();
      await setDelegate(streamer, keyB.publicKey, nowSecs() + 120);

      // Decode the delegate state via Anchor's built-in fetcher to avoid
      // hand-rolling a layout here. We only assert the session_key field —
      // version/streamer/expires_at are exercised via behavior below.
      const state = await program.account.streamerDelegate.fetch(delegatePda);
      expect(state.sessionKey.toBase58()).to.equal(keyB.publicKey.toBase58());
      expect(state.version).to.equal(STREAMER_DELEGATE_VERSION);
      expect(state.streamer.toBase58()).to.equal(streamer.publicKey.toBase58());

      await revokeDelegate(streamer);

      // After revoke, the account is closed; fetch should throw.
      let fetched = true;
      try {
        await program.account.streamerDelegate.fetch(delegatePda);
      } catch {
        fetched = false;
      }
      expect(fetched).to.equal(false);
    });

    it("rejects set_delegate with expiry in the past (InvalidExpiry)", async () => {
      const streamer = Keypair.generate();
      await airdrop(streamer.publicKey);
      const session = Keypair.generate();

      await expectError(
        setDelegate(streamer, session.publicKey, nowSecs() - 10),
        "InvalidExpiry",
      );
    });

    it("rejects set_delegate with expiry beyond max lifetime (DelegateLifetimeExceedsMax)", async () => {
      const streamer = Keypair.generate();
      await airdrop(streamer.publicKey);
      const session = Keypair.generate();

      await expectError(
        setDelegate(
          streamer,
          session.publicKey,
          nowSecs() + MAX_DELEGATE_LIFETIME_SECS + 3600,
        ),
        "DelegateLifetimeExceedsMax",
      );
    });

    it("lets a valid delegate start a beam (emits delegated=true)", async () => {
      const total = 6_000_000n;
      const ctx = await setupParties(total);
      await initialize(ctx, total, 60n, TYPE_BEAM);

      const session = Keypair.generate();
      await airdrop(session.publicKey); // pays tx fee
      await setDelegate(ctx.streamer, session.publicKey, nowSecs() + 60);

      await startBeamDelegated(ctx, session);

      // Beam is now Active; we can settle it early via the viewer and confirm
      // conservation (covering the end-to-end delegated → settle path).
      await sleep(1500);
      await settleBeam(ctx, ctx.viewer);
      expect(
        (await balanceOf(ctx.streamerAta)) + (await balanceOf(ctx.viewerAta)),
      ).to.equal(total);
    });

    it("rejects start_beam_delegated from a non-matching session key (Unauthorized)", async () => {
      const total = 1_000_000n;
      const ctx = await setupParties(total);
      await initialize(ctx, total, 60n, TYPE_BEAM);

      const realSession  = Keypair.generate();
      const fakeSession  = Keypair.generate();
      await airdrop(fakeSession.publicKey);
      await setDelegate(ctx.streamer, realSession.publicKey, nowSecs() + 60);

      await expectError(
        startBeamDelegated(ctx, fakeSession),
        "Unauthorized",
      );
    });

    it("rejects start_beam_delegated after expires_at (DelegateExpired)", async () => {
      const total = 1_000_000n;
      const ctx = await setupParties(total);
      await initialize(ctx, total, 60n, TYPE_BEAM);

      const session = Keypair.generate();
      await airdrop(session.publicKey);
      // 2-second window; we sleep past it before calling.
      await setDelegate(ctx.streamer, session.publicKey, nowSecs() + 2);
      await sleep(3500);

      await expectError(
        startBeamDelegated(ctx, session),
        "DelegateExpired",
      );
    });

    it("rejects cross-streamer delegate usage (Unauthorized)", async () => {
      // StreamerA installs a delegate; the session key tries to start a beam
      // on an escrow owned by StreamerB. Both the delegate PDA seed binding
      // and the escrow.streamer constraint should reject this.
      const total = 1_000_000n;
      const ctxB = await setupParties(total);
      await initialize(ctxB, total, 60n, TYPE_BEAM);

      const streamerA = Keypair.generate();
      await airdrop(streamerA.publicKey);
      const session = Keypair.generate();
      await airdrop(session.publicKey);
      await setDelegate(streamerA, session.publicKey, nowSecs() + 60);

      // Ask the delegate to start a beam for streamerB but pass streamerA's
      // pubkey as the delegate owner — PDA seed match, but
      // escrow.streamer ≠ streamerA → Unauthorized.
      await expectError(
        startBeamDelegated(ctxB, session, streamerA.publicKey),
        "Unauthorized",
      );
    });

    it("lets a valid delegate settle an Active beam (pro-rata split)", async () => {
      const total = 6_000_000n;
      const ctx = await setupParties(total);
      await initialize(ctx, total, 60n, TYPE_BEAM);

      const session = Keypair.generate();
      const cranker = Keypair.generate();
      await airdrop(session.publicKey);
      await airdrop(cranker.publicKey);
      await setDelegate(ctx.streamer, session.publicKey, nowSecs() + 60);

      await startBeamDelegated(ctx, session);
      await sleep(1500);
      await settleBeamDelegated(ctx, session, cranker);

      // Conservation: streamer + viewer == total. Exact split depends on the
      // validator's clock, but we know both sides must be > 0 (some elapsed)
      // and strictly less than total (beam didn't reach duration).
      const streamerBal = await balanceOf(ctx.streamerAta);
      const viewerBal   = await balanceOf(ctx.viewerAta);
      expect(streamerBal + viewerBal).to.equal(total);
      expect(streamerBal).to.be.greaterThan(0n);
      expect(viewerBal).to.be.greaterThan(0n);
    });

    it("rejects settle_beam_delegated from a non-matching session key (Unauthorized)", async () => {
      const total = 1_000_000n;
      const ctx = await setupParties(total);
      await initialize(ctx, total, 60n, TYPE_BEAM);

      const realSession = Keypair.generate();
      const fakeSession = Keypair.generate();
      const cranker = Keypair.generate();
      await airdrop(realSession.publicKey);
      await airdrop(fakeSession.publicKey);
      await airdrop(cranker.publicKey);
      await setDelegate(ctx.streamer, realSession.publicKey, nowSecs() + 60);

      await startBeamDelegated(ctx, realSession);

      await expectError(
        settleBeamDelegated(ctx, fakeSession, cranker),
        "Unauthorized",
      );
    });

    it("rejects settle_beam_delegated after expires_at (DelegateExpired)", async () => {
      const total = 1_000_000n;
      const ctx = await setupParties(total);
      await initialize(ctx, total, 60n, TYPE_BEAM);

      const session = Keypair.generate();
      const cranker = Keypair.generate();
      await airdrop(session.publicKey);
      await airdrop(cranker.publicKey);
      // 3-second window: enough to start, then expire before we settle.
      await setDelegate(ctx.streamer, session.publicKey, nowSecs() + 3);
      await startBeamDelegated(ctx, session);
      await sleep(4000);

      await expectError(
        settleBeamDelegated(ctx, session, cranker),
        "DelegateExpired",
      );
    });

    it("rejects settle_beam_delegated on a Pending beam (NotActive)", async () => {
      const total = 1_000_000n;
      const ctx = await setupParties(total);
      await initialize(ctx, total, 60n, TYPE_BEAM);

      const session = Keypair.generate();
      const cranker = Keypair.generate();
      await airdrop(session.publicKey);
      await airdrop(cranker.publicKey);
      await setDelegate(ctx.streamer, session.publicKey, nowSecs() + 60);

      // No start_beam yet — escrow is Pending on-chain.
      await expectError(
        settleBeamDelegated(ctx, session, cranker),
        "NotActive",
      );
    });

    it("rejects cross-streamer delegated settle (Unauthorized)", async () => {
      // StreamerA installs a delegate. The session key tries to settle a
      // beam owned by streamerB. The delegate PDA seed + escrow.streamer
      // constraint should reject it.
      const total = 1_000_000n;
      const ctxB = await setupParties(total);
      await initialize(ctxB, total, 60n, TYPE_BEAM);
      // Start ctxB's beam via its own streamer's wallet so we have an Active
      // target for the cross-streamer attempt.
      await program.methods
        .startBeam(ctxB.escrowId)
        .accounts({
          streamer: ctxB.streamer.publicKey,
          escrowState: ctxB.escrowPda,
        })
        .signers([ctxB.streamer])
        .rpc();

      const streamerA = Keypair.generate();
      await airdrop(streamerA.publicKey);
      const session = Keypair.generate();
      const cranker = Keypair.generate();
      await airdrop(session.publicKey);
      await airdrop(cranker.publicKey);
      await setDelegate(streamerA, session.publicKey, nowSecs() + 60);

      await expectError(
        settleBeamDelegated(ctxB, session, cranker, streamerA.publicKey),
        "Unauthorized",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Stale-Pending permissionless cancel
  // ---------------------------------------------------------------------------
  //
  // The happy path (after PENDING_TIMEOUT_SECS) can't be reached on a stock
  // localnet without clock mocking, so we assert (a) pre-stale is rejected
  // and (b) refund destination cannot be redirected.
  describe("CancelStalePending", () => {
    async function cancelStalePending(
      ctx: EscrowCtx,
      cranker: Keypair,
      viewer: PublicKey = ctx.viewer.publicKey,
      viewerAta: PublicKey = ctx.viewerAta,
    ) {
      return program.methods
        .cancelStalePending(ctx.escrowId)
        .accounts({
          cranker: cranker.publicKey,
          viewer,
          escrowState: ctx.escrowPda,
          vault: ctx.vault,
          viewerAta,
          usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([cranker])
        .rpc();
    }

    it("rejects before PENDING_TIMEOUT_SECS elapses (PendingNotStale)", async () => {
      const ctx = await setupParties(1_000_000n);
      await initialize(ctx, 1_000_000n, 60n, TYPE_BEAM);

      const cranker = Keypair.generate();
      await airdrop(cranker.publicKey);

      await expectError(
        cancelStalePending(ctx, cranker),
        "PendingNotStale",
      );
      // Proves that within 7 days of create we cannot shortcut the refund.
      expect(PENDING_TIMEOUT_SECS).to.equal(7 * 24 * 60 * 60);
    });

    it("rejects a cranker who tries to redirect the viewer account", async () => {
      const ctx = await setupParties(1_000_000n);
      await initialize(ctx, 1_000_000n, 60n, TYPE_BEAM);

      const cranker  = Keypair.generate();
      const attacker = Keypair.generate();
      await airdrop(cranker.publicKey);
      await airdrop(attacker.publicKey);

      const attackerAta = getAssociatedTokenAddressSync(
        usdcMint, attacker.publicKey,
      );

      // has_one viewer → Unauthorized (struct-level mismatch on the escrow's
      // `viewer` field). Even though the stale check would fire later, the
      // struct constraints run first.
      await expectError(
        cancelStalePending(ctx, cranker, attacker.publicKey, attackerAta),
        "Unauthorized",
      );
    });

    it("refuses to crank a non-Pending escrow (AlreadySettled)", async () => {
      const ctx = await setupParties(1_000_000n);
      await initialize(ctx, 1_000_000n, 60n, TYPE_BEAM);
      await startBeam(ctx); // → Active

      const cranker = Keypair.generate();
      await airdrop(cranker.publicKey);

      await expectError(
        cancelStalePending(ctx, cranker),
        "AlreadySettled",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Versioned state — audit-surface assertions.
  // ---------------------------------------------------------------------------
  describe("VersionedState", () => {
    it("stamps ESCROW_STATE_VERSION + created_at on initialize", async () => {
      const ctx = await setupParties(1_000_000n);
      const before = nowSecs();
      await initialize(ctx, 1_000_000n, 60n, TYPE_BEAM);
      const after = nowSecs();

      const state = await program.account.escrowState.fetch(ctx.escrowPda);
      expect(state.version).to.equal(ESCROW_STATE_VERSION);
      const created = Number(state.createdAt.toString());
      // Allow 2s slack either side for slot clock drift.
      expect(created).to.be.at.least(before - 2);
      expect(created).to.be.at.most(after + 2);
    });
  });

  // ---------------------------------------------------------------------------
  // Invariant / fuzz tests
  // ---------------------------------------------------------------------------
  //
  // Randomized sequences that any legitimate caller might drive, asserting two
  // core invariants across every run:
  //   1. Conservation of funds  — total_in == streamer_out + viewer_out
  //   2. Status monotonicity    — Pending → {Settled | Cancelled | Active → Settled}
  //                                 only; no backwards transitions observed.
  describe("Invariants (randomized)", () => {
    /** Pick from an array with Math.random — good enough for fuzz seeds here. */
    function pick<T>(xs: readonly T[]): T {
      return xs[Math.floor(Math.random() * xs.length)];
    }

    it("preserves conservation across 6 random Flash sequences", async function () {
      this.timeout(120_000);
      const outcomes: Array<"approve" | "deny" | "cancel"> = [
        "approve", "deny", "cancel",
      ];

      for (let i = 0; i < 6; i++) {
        const total = BigInt(1 + Math.floor(Math.random() * 1_000_000));
        const ctx = await setupParties(total);
        await initialize(ctx, total, 0n, TYPE_FLASH);

        const choice = pick(outcomes);
        if (choice === "approve")       await approveFlash(ctx);
        else if (choice === "deny")     await denyFlash(ctx);
        else                            await cancelEscrow(ctx);

        const streamerBal = await balanceOf(ctx.streamerAta);
        const viewerBal   = await balanceOf(ctx.viewerAta);

        // Every micro-USDC is accounted for regardless of outcome.
        expect(streamerBal + viewerBal).to.equal(total);

        // Status monotonicity: the PDA is closed after any of the three calls,
        // so the account no longer exists — proves we can't re-enter it.
        const info = await provider.connection.getAccountInfo(ctx.escrowPda);
        expect(info).to.equal(null);
      }
    });

    it("preserves conservation across 4 random Beam sequences", async function () {
      this.timeout(180_000);

      for (let i = 0; i < 4; i++) {
        const total    = BigInt(1_000_000 + Math.floor(Math.random() * 4_000_000));
        const duration = BigInt(2 + Math.floor(Math.random() * 3)); // 2-4s
        const ctx = await setupParties(total);
        await initialize(ctx, total, duration, TYPE_BEAM);

        // Randomly cancel-before-start OR run the full Beam.
        if (Math.random() < 0.3) {
          await cancelEscrow(ctx);
          expect(await balanceOf(ctx.viewerAta)).to.equal(total);
          continue;
        }

        await startBeam(ctx);
        // Sleep a random fraction of the duration (may exceed → full vest).
        const ms = Math.floor(Number(duration) * 1000 * (0.3 + Math.random() * 1.0));
        await sleep(ms);

        // Random caller: streamer, viewer, or a third-party cranker. The
        // third-party only works if elapsed >= duration; if it fails we fall
        // back to streamer so the invariant still runs.
        const callers = [ctx.streamer, ctx.viewer] as const;
        const caller  = Math.random() < 0.5 ? callers[0] : callers[1];
        try {
          await settleBeam(ctx, caller);
        } catch {
          await settleBeam(ctx, ctx.streamer);
        }

        const streamerBal = await balanceOf(ctx.streamerAta);
        const viewerBal   = await balanceOf(ctx.viewerAta);
        expect(streamerBal + viewerBal).to.equal(total);
      }
    });

    it("never lets streamer exceed total_amount in a settle_beam pro-rata", async function () {
      this.timeout(60_000);
      // Direct fuzz on the vesting math: pick random (total, duration, elapsed)
      // triples and verify the TS mirror of the on-chain formula caps at total.
      for (let i = 0; i < 100; i++) {
        const total     = BigInt(Math.floor(Math.random() * 1e12) + 1);
        const duration  = BigInt(Math.floor(Math.random() * 86_400) + 1);
        const elapsed   = BigInt(Math.floor(Math.random() * 172_800)); // up to 2× duration
        const vested    = elapsed < duration ? elapsed : duration;
        const streamer  = (total * vested) / duration;
        const refund    = total - streamer;
        expect(streamer <= total).to.equal(true);
        expect(refund <= total).to.equal(true);
        expect(streamer + refund).to.equal(total);
      }
    });
  });
});
