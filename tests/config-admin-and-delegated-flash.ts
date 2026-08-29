/**
 * Coverage for GlobalConfig admin instructions (update_config, transfer_admin)
 * and the delegated Flash twins (approve_flash_delegated, deny_flash_delegated).
 * None of these had any test coverage before — see
 * docs/fable-security-review-2026-08-10.md, Finding #7.
 *
 * Filename sorts after casi-escrow.ts (which creates the real global config
 * in its before() hook) and before security-findings.ts, alphabetically —
 * mocha runs suites in that order for a single serial run. This file reuses
 * the config casi-escrow.ts already created rather than creating its own
 * (config is a single PDA per deployment; a second initialize_config call
 * always fails with AccountAlreadyInUse regardless of the mint).
 *
 * IMPORTANT: every admin-state test that mutates GlobalConfig (pause, cap,
 * floor, admin) restores it to whatever this file's before() hook captured
 * as the live baseline — NOT a hardcoded "production" value. This shared
 * test fixture deliberately runs with (max=0, min=0), matching
 * security-findings.ts's own fixture comment ("no cap, no floor"), which its
 * dust-value PoCs need — that's a different, intentionally permissive
 * baseline from the real deployed prod config (max=0, min=1_000_000 USDC) in
 * src/app/api/admin/init-escrow-config/route.ts. security-findings.ts runs
 * after this file and would fail with AmountBelowMin if this file left a
 * nonzero floor behind.
 */
import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
  getAccount,
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

const CONFIG_SEED = Buffer.from("casi-config");
const ESCROW_SEED = Buffer.from("casi-escrow");
const DELEGATE_SEED = Buffer.from("casi-delegate");
const REGISTRY_SEED = Buffer.from("casi-registry");
const TYPE_FLASH = 0;
const TYPE_BEAM = 1;

function nowSecs(): number {
  return Math.floor(Date.now() / 1000);
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
function derivePda(escrowId: number[], programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([ESCROW_SEED, Buffer.from(escrowId)], programId)[0];
}
function deriveDelegatePda(streamer: PublicKey, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([DELEGATE_SEED, streamer.toBuffer()], programId)[0];
}
function makeEscrowId(): number[] {
  return Array.from(randomBytes(32));
}

describe("GlobalConfig admin instructions + delegated Flash", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program: any = anchor.workspace.CasiEscrow;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payer: Keypair = ((provider.wallet as any).payer) as Keypair;

  let configPda: PublicKey;
  let usdcMint: PublicKey;
  // Captured from the live config in before() — NOT hardcoded "production"
  // values. This suite's shared fixture (casi-escrow.ts's before() hook)
  // deliberately initializes config with (max=0, min=0), matching
  // security-findings.ts's own fixture comment ("no cap, no floor"), which
  // its dust-value PoCs need — that's a different, intentionally permissive
  // baseline from the real deployed prod config (max=0, min=1_000_000) in
  // src/app/api/admin/init-escrow-config/route.ts. Restoring to a hardcoded
  // "prod" value here previously broke every test that runs after this file
  // (AmountBelowMin failures in security-findings.ts) — restore to whatever
  // was actually there instead.
  let baselinePaused: boolean;
  let baselineMaxEscrow: number;
  let baselineMinEscrow: number;

  async function airdrop(pubkey: PublicKey, sol = 2) {
    const sig = await provider.connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig, "confirmed");
  }

  async function balanceOf(ata: PublicKey): Promise<bigint> {
    try {
      return (await getAccount(provider.connection, ata)).amount;
    } catch {
      return 0n;
    }
  }

  async function expectError(p: Promise<unknown>, variant: string) {
    try {
      await p;
      expect.fail(`expected tx to fail with ${variant} but it succeeded`);
    } catch (err) {
      const e = err as { message?: unknown; logs?: unknown };
      const msg = [
        typeof e?.message === 'string' ? e.message : '',
        Array.isArray(e?.logs) ? e.logs.join('\n') : '',
      ].join('\n');
      expect(msg).to.include(variant);
    }
  }

  async function updateConfig(
    admin: Keypair,
    paused: boolean,
    maxEscrow: number,
    minEscrow: number,
  ) {
    return program.methods
      .updateConfig(paused, new BN(maxEscrow), new BN(minEscrow))
      .accounts({ admin: admin.publicKey, config: configPda })
      .signers([admin])
      .rpc();
  }

  async function restoreBaseline(admin: Keypair) {
    await updateConfig(admin, baselinePaused, baselineMaxEscrow, baselineMinEscrow);
  }

  interface Ctx {
    viewer: Keypair;
    streamer: Keypair;
    viewerAta: PublicKey;
    streamerAta: PublicKey;
    escrowId: number[];
    escrowPda: PublicKey;
    vault: PublicKey;
  }

  async function registerStreamer(streamer: Keypair) {
    const [registryPda] = PublicKey.findProgramAddressSync(
      [REGISTRY_SEED, streamer.publicKey.toBuffer()],
      program.programId,
    );
    return program.methods
      .registerStreamer()
      .accounts({
        streamer: streamer.publicKey,
        registry: registryPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([streamer])
      .rpc();
  }

  async function setupParties(mintAmount: bigint): Promise<Ctx> {
    const viewer = Keypair.generate();
    const streamer = Keypair.generate();
    await airdrop(viewer.publicKey);
    await airdrop(streamer.publicKey);
    await registerStreamer(streamer);

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
        escrowState: ctx.escrowPda,
        vault: ctx.vault,
        viewerAta: ctx.viewerAta,
        usdcMint,
        config: configPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([ctx.viewer])
      .rpc();
  }

  async function approveFlash(ctx: Ctx) {
    return program.methods
      .approveFlash(ctx.escrowId)
      .accounts({
        streamer: ctx.streamer.publicKey,
        viewer: ctx.viewer.publicKey,
        escrowState: ctx.escrowPda,
        vault: ctx.vault,
        streamerAta: ctx.streamerAta,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([ctx.streamer])
      .rpc();
  }

  async function setDelegate(streamer: Keypair, sessionKey: PublicKey, expiresAt: number) {
    const delegatePda = deriveDelegatePda(streamer.publicKey, program.programId);
    return program.methods
      .setDelegate(sessionKey, new BN(expiresAt))
      .accounts({ streamer: streamer.publicKey, delegate: delegatePda, systemProgram: SystemProgram.programId })
      .signers([streamer])
      .rpc();
  }

  async function approveFlashDelegated(
    ctx: Ctx,
    session: Keypair,
    cranker: Keypair,
    delegateStreamer: PublicKey = ctx.streamer.publicKey,
  ) {
    const delegatePda = deriveDelegatePda(delegateStreamer, program.programId);
    const streamerAta = getAssociatedTokenAddressSync(usdcMint, delegateStreamer);
    return program.methods
      .approveFlashDelegated(ctx.escrowId)
      .accounts({
        session: session.publicKey,
        cranker: cranker.publicKey,
        streamer: delegateStreamer,
        viewer: ctx.viewer.publicKey,
        delegate: delegatePda,
        escrowState: ctx.escrowPda,
        vault: ctx.vault,
        streamerAta,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([session, cranker])
      .rpc();
  }

  async function denyFlashDelegated(
    ctx: Ctx,
    session: Keypair,
    cranker: Keypair,
    delegateStreamer: PublicKey = ctx.streamer.publicKey,
  ) {
    const delegatePda = deriveDelegatePda(delegateStreamer, program.programId);
    return program.methods
      .denyFlashDelegated(ctx.escrowId)
      .accounts({
        session: session.publicKey,
        cranker: cranker.publicKey,
        streamer: delegateStreamer,
        viewer: ctx.viewer.publicKey,
        delegate: delegatePda,
        escrowState: ctx.escrowPda,
        vault: ctx.vault,
        viewerAta: ctx.viewerAta,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([session, cranker])
      .rpc();
  }

  before(async function () {
    this.timeout(30_000);
    [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], program.programId);
    const existing = await provider.connection.getAccountInfo(configPda);
    if (!existing) {
      throw new Error(
        "GlobalConfig doesn't exist yet — this file must run after casi-escrow.ts's " +
        "before() hook. Check mocha file ordering (this file must sort after casi-escrow.ts).",
      );
    }
    const cfg = await program.account.globalConfig.fetch(configPda);
    usdcMint = cfg.acceptedMint as PublicKey;
    baselinePaused    = cfg.paused as boolean;
    baselineMaxEscrow = Number(cfg.maxEscrowAmount);
    baselineMinEscrow = Number(cfg.minEscrowAmount);
    // Confirm the assumption every restore step below relies on.
    expect(cfg.admin.toBase58()).to.equal(payer.publicKey.toBase58());
  });

  describe("update_config", () => {
    afterEach(async () => {
      await restoreBaseline(payer);
    });

    it("rejects a non-admin caller (Unauthorized)", async () => {
      const impostor = Keypair.generate();
      await airdrop(impostor.publicKey);
      await expectError(updateConfig(impostor, false, 0, 0), "Unauthorized");
    });

    it("pause blocks new initialize_escrow but not settling an already-Pending escrow", async () => {
      const total = 2_000_000n;
      const ctx = await setupParties(total);
      // Fund one escrow BEFORE pausing, to prove pause doesn't touch it.
      await initialize(ctx, total, 0n, TYPE_FLASH);

      await updateConfig(payer, true, baselineMaxEscrow, baselineMinEscrow);

      // New escrows are blocked while paused.
      const blocked = await setupParties(total);
      await expectError(initialize(blocked, total, 0n, TYPE_FLASH), "ProtocolPaused");

      // The escrow funded before the pause can still be approved — pause
      // must not trap already-locked funds (see lib.rs's own doc comment on
      // update_config).
      await approveFlash(ctx);
      expect(await balanceOf(ctx.streamerAta)).to.equal(total);
    });

    it("enforces max_escrow_amount (AmountExceedsCap) and min_escrow_amount (AmountBelowMin)", async () => {
      const cap = 5_000_000n;  // 5 USDC
      const floor = 2_000_000n; // 2 USDC
      await updateConfig(payer, false, Number(cap), Number(floor));

      const tooBig = await setupParties(cap + 1_000_000n);
      await expectError(initialize(tooBig, cap + 1_000_000n, 0n, TYPE_FLASH), "AmountExceedsCap");

      const tooSmall = await setupParties(floor - 1_000_000n);
      await expectError(initialize(tooSmall, floor - 1_000_000n, 0n, TYPE_FLASH), "AmountBelowMin");

      // Exactly at the boundaries must succeed both ways.
      const atCap = await setupParties(cap);
      await initialize(atCap, cap, 0n, TYPE_FLASH);
      const atFloor = await setupParties(floor);
      await initialize(atFloor, floor, 0n, TYPE_FLASH);
    });

    it("rejects min_escrow_amount > max_escrow_amount (InvalidCapFloor) — see fable-security-review-2026-08-28.md Finding 5", async () => {
      // Both nonzero and inverted: would make initialize_escrow's cap and
      // floor checks mutually unsatisfiable for every amount, silently
      // taking new-escrow creation offline. initialize_config has the
      // identical guard (verified by reading lib.rs — not re-tested here
      // since config can only be initialized once per deployment and this
      // suite's fixture has already used that call).
      await expectError(updateConfig(payer, false, 1_000_000, 2_000_000), "InvalidCapFloor");
      // Zero on either side means "no cap"/"no floor" — never inverted,
      // must still succeed.
      await updateConfig(payer, false, 0, 2_000_000);
      await updateConfig(payer, false, 1_000_000, 0);
    });
  });

  describe("transfer_admin", () => {
    // Only the happy-path test below actually changes config.admin, and it
    // restores payer as admin itself before returning — the three rejection
    // tests never succeed in changing it, so no shared teardown is needed.

    it("rejects the zero address (InvalidAdmin)", async () => {
      await expectError(
        program.methods
          .transferAdmin(PublicKey.default)
          .accounts({ admin: payer.publicKey, config: configPda })
          .signers([payer])
          .rpc(),
        "InvalidAdmin",
      );
    });

    // No "rejects an off-curve address" test: lib.rs used to reject a PDA
    // via Pubkey::is_on_curve(), but that call is unimplemented!() on-chain
    // in this SDK (see the comment above transfer_admin in lib.rs) and was
    // removed — it never actually rejected bad input, it just panicked on
    // every call, valid or not. There is currently no on-chain guard against
    // transferring admin to an unusable PDA; the caller is trusted to
    // double-check, same as everywhere else in this program.

    it("rejects a non-admin caller (Unauthorized)", async () => {
      const impostor = Keypair.generate();
      await airdrop(impostor.publicKey);
      const newAdmin = Keypair.generate();
      await expectError(
        program.methods
          .transferAdmin(newAdmin.publicKey)
          .accounts({ admin: impostor.publicKey, config: configPda })
          .signers([impostor])
          .rpc(),
        "Unauthorized",
      );
    });

    it("transfers admin rights to a new key, and the old admin loses update_config access", async () => {
      const newAdmin = Keypair.generate();
      await airdrop(newAdmin.publicKey);

      await program.methods
        .transferAdmin(newAdmin.publicKey)
        .accounts({ admin: payer.publicKey, config: configPda })
        .signers([payer])
        .rpc();

      const cfg = await program.account.globalConfig.fetch(configPda);
      expect(cfg.admin.toBase58()).to.equal(newAdmin.publicKey.toBase58());

      // Old admin (payer) can no longer call update_config.
      await expectError(updateConfig(payer, false, 0, 0), "Unauthorized");

      // New admin can, and restoring the baseline through them also proves
      // the new admin key actually works, not just that the field changed.
      await updateConfig(newAdmin, baselinePaused, baselineMaxEscrow, baselineMinEscrow);

      // Hand admin back to payer so every other test/file in this run can
      // keep assuming payer is admin.
      await program.methods
        .transferAdmin(payer.publicKey)
        .accounts({ admin: newAdmin.publicKey, config: configPda })
        .signers([newAdmin])
        .rpc();
      const restored = await program.account.globalConfig.fetch(configPda);
      expect(restored.admin.toBase58()).to.equal(payer.publicKey.toBase58());
    });
  });

  describe("register_streamer / unregister_streamer", () => {
    async function unregisterStreamer(streamer: Keypair) {
      const [registryPda] = PublicKey.findProgramAddressSync(
        [REGISTRY_SEED, streamer.publicKey.toBuffer()],
        program.programId,
      );
      return program.methods
        .unregisterStreamer()
        .accounts({ streamer: streamer.publicKey, registry: registryPda })
        .signers([streamer])
        .rpc();
    }

    it("re-calling register_streamer is a harmless no-op (init_if_needed)", async () => {
      const streamer = Keypair.generate();
      await airdrop(streamer.publicKey);
      await registerStreamer(streamer);
      // Second call must not throw — a streamer reconnecting their wallet,
      // or retrying after a dropped confirmation, shouldn't error.
      await registerStreamer(streamer);

      const [registryPda] = PublicKey.findProgramAddressSync(
        [REGISTRY_SEED, streamer.publicKey.toBuffer()],
        program.programId,
      );
      const state = await program.account.streamerRegistry.fetch(registryPda);
      expect(state.streamer.toBase58()).to.equal(streamer.publicKey.toBase58());
    });

    it("unregister_streamer closes the registry and re-blocks new escrows targeting this streamer", async () => {
      const streamer = Keypair.generate();
      await airdrop(streamer.publicKey);
      await registerStreamer(streamer);

      await unregisterStreamer(streamer);

      const [registryPda] = PublicKey.findProgramAddressSync(
        [REGISTRY_SEED, streamer.publicKey.toBuffer()],
        program.programId,
      );
      const info = await provider.connection.getAccountInfo(registryPda);
      expect(info, "registry account should be closed").to.equal(null);

      // A fresh initialize_escrow targeting this now-unregistered streamer
      // must fail exactly like it never registered at all.
      const viewer = Keypair.generate();
      await airdrop(viewer.publicKey);
      const viewerAta = (
        await getOrCreateAssociatedTokenAccount(provider.connection, payer, usdcMint, viewer.publicKey)
      ).address;
      await mintTo(provider.connection, payer, usdcMint, viewerAta, payer, 1_000_000n);
      const escrowId = makeEscrowId();
      const escrowPda = derivePda(escrowId, program.programId);
      const vault = getAssociatedTokenAddressSync(usdcMint, escrowPda, true);

      await expectError(
        program.methods
          .initializeEscrow(escrowId, new BN(1_000_000), new BN(0), TYPE_FLASH)
          .accounts({
            viewer: viewer.publicKey,
            streamer: streamer.publicKey,
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
          .rpc(),
        "AccountNotInitialized",
      );
    });

    it("unregistering does NOT affect an escrow already open against that streamer", async () => {
      const total = 1_000_000n;
      const ctx = await setupParties(total); // registers ctx.streamer internally
      await initialize(ctx, total, 0n, TYPE_FLASH);

      // Streamer unregisters AFTER the escrow already exists — same
      // non-retroactive spirit as GlobalConfig's pause flag.
      await unregisterStreamer(ctx.streamer);

      await approveFlash(ctx);
      expect(await balanceOf(ctx.streamerAta)).to.equal(total);
    });
  });

  describe("Delegated Flash (approve_flash_delegated / deny_flash_delegated)", () => {
    it("approve_flash_delegated pays the streamer in full and closes the escrow", async () => {
      const total = 3_000_000n;
      const ctx = await setupParties(total);
      await initialize(ctx, total, 0n, TYPE_FLASH);

      const session = Keypair.generate();
      const cranker = Keypair.generate();
      await airdrop(cranker.publicKey);
      await setDelegate(ctx.streamer, session.publicKey, nowSecs() + 60);

      await approveFlashDelegated(ctx, session, cranker);

      expect(await balanceOf(ctx.streamerAta)).to.equal(total);
      expect(await provider.connection.getAccountInfo(ctx.escrowPda)).to.equal(null);
    });

    it("deny_flash_delegated refunds the viewer in full and closes the escrow", async () => {
      const total = 3_000_000n;
      const ctx = await setupParties(total);
      await initialize(ctx, total, 0n, TYPE_FLASH);

      const session = Keypair.generate();
      const cranker = Keypair.generate();
      await airdrop(cranker.publicKey);
      await setDelegate(ctx.streamer, session.publicKey, nowSecs() + 60);

      const before = await balanceOf(ctx.viewerAta);
      await denyFlashDelegated(ctx, session, cranker);

      expect(await balanceOf(ctx.viewerAta)).to.equal(before + total);
      expect(await provider.connection.getAccountInfo(ctx.escrowPda)).to.equal(null);
    });

    it("rejects approve_flash_delegated against a Beam-type escrow (WrongEscrowType)", async () => {
      const total = 1_000_000n;
      const ctx = await setupParties(total);
      await initialize(ctx, total, 60n, TYPE_BEAM);

      const session = Keypair.generate();
      const cranker = Keypair.generate();
      await airdrop(cranker.publicKey);
      await setDelegate(ctx.streamer, session.publicKey, nowSecs() + 60);

      await expectError(approveFlashDelegated(ctx, session, cranker), "WrongEscrowType");
    });

    it("rejects approve_flash_delegated after the delegate has expired (DelegateExpired)", async () => {
      const total = 1_000_000n;
      const ctx = await setupParties(total);
      await initialize(ctx, total, 0n, TYPE_FLASH);

      const session = Keypair.generate();
      const cranker = Keypair.generate();
      await airdrop(cranker.publicKey);
      await setDelegate(ctx.streamer, session.publicKey, nowSecs() + 2);
      await sleep(3500);

      await expectError(approveFlashDelegated(ctx, session, cranker), "DelegateExpired");
    });

    it("rejects deny_flash_delegated from a non-matching session key (Unauthorized)", async () => {
      const total = 1_000_000n;
      const ctx = await setupParties(total);
      await initialize(ctx, total, 0n, TYPE_FLASH);

      const realSession = Keypair.generate();
      const fakeSession = Keypair.generate();
      const cranker = Keypair.generate();
      await airdrop(cranker.publicKey);
      await setDelegate(ctx.streamer, realSession.publicKey, nowSecs() + 60);

      await expectError(denyFlashDelegated(ctx, fakeSession, cranker), "Unauthorized");
    });

    it("rejects cross-streamer delegate usage on approve_flash_delegated (Unauthorized)", async () => {
      const total = 1_000_000n;
      const ctxB = await setupParties(total);
      await initialize(ctxB, total, 0n, TYPE_FLASH);

      const streamerA = Keypair.generate();
      await airdrop(streamerA.publicKey);
      const session = Keypair.generate();
      const cranker = Keypair.generate();
      await airdrop(cranker.publicKey);
      await setDelegate(streamerA, session.publicKey, nowSecs() + 60);

      // streamerA's delegate tries to approve an escrow that belongs to
      // ctxB.streamer — both the delegate PDA seed binding (derived from
      // streamerA) and escrow_state.has_one=streamer should reject this.
      await expectError(
        approveFlashDelegated(ctxB, session, cranker, streamerA.publicKey),
        "Unauthorized",
      );
    });
  });
});
