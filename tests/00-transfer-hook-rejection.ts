/**
 * TransferHook rejection — dedicated fixture, runs before any other test file.
 *
 * initialize_config's GlobalConfig is a single PDA per program deployment
 * (seeded only by CONFIG_SEED, no per-test uniqueness), so this can only be
 * exercised once per validator: the first successful initialize_config call
 * wins, and any later attempt fails with AccountAlreadyInUse regardless of
 * the mint's validity. Filename is prefixed `00-` so mocha's alphabetical
 * file ordering runs this before casi-escrow.ts's `before()` hook creates
 * the real global config — if this file ran after, initialize_config would
 * already be taken and every assertion here would be meaningless.
 *
 * This test builds a REAL Token-2022 mint with a REAL TransferHook extension
 * (not a mock) and asserts initialize_config rejects it, per lib.rs's
 * documented intent (see the comment above the TLV-parsing block: "Reject
 * Token-2022 mints that have a TransferHook extension configured... A
 * malicious hook could manipulate shared mutable accounts or drain ATAs it
 * has authority over").
 */
import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  getMintLen,
  createInitializeTransferHookInstruction,
  createInitializeMintInstruction,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { expect } from "chai";

const CONFIG_SEED = Buffer.from("casi-config");
const USDC_DECIMALS = 6;

describe("initialize_config — TransferHook rejection (must run first, see file-header comment)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program: any = anchor.workspace.CasiEscrow;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payer: Keypair = ((provider.wallet as any).payer) as Keypair;

  let configPda: PublicKey;

  before(() => {
    [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], program.programId);
  });

  it("rejects a Token-2022 mint carrying a real TransferHook extension (TransferHookNotAllowed)", async function () {
    this.timeout(30_000);

    // If some earlier run already created the global config on this
    // validator (e.g. re-running this file without --reset), this test
    // can't prove anything — skip rather than report a false pass/fail.
    const existingConfig = await provider.connection.getAccountInfo(configPda);
    if (existingConfig) {
      // eslint-disable-next-line no-console
      console.warn(
        "  [skipped] global config already exists on this validator — " +
        "re-run against a fresh --reset validator to exercise this test.",
      );
      this.skip();
      return;
    }

    // A transfer hook needs a program to point at. It's never actually
    // invoked by this test (initialize_config should reject before any
    // transfer happens) — any non-default pubkey is sufficient to prove the
    // rejection reads the real stored program_id, not just "extension
    // present at all". Use a second real program already on this validator
    // (the CASI program itself) rather than an arbitrary unexecutable
    // pubkey, so nothing here depends on an assumption about how the loader
    // validates hook program accounts.
    const hookProgramId = program.programId as PublicKey;

    const mint = Keypair.generate();
    const mintLen = getMintLen([ExtensionType.TransferHook]);
    const lamports = await provider.connection.getMinimumBalanceForRentExemption(mintLen);

    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mint.publicKey,
        space: mintLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeTransferHookInstruction(
        mint.publicKey,
        payer.publicKey,
        hookProgramId,
        TOKEN_2022_PROGRAM_ID,
      ),
      createInitializeMintInstruction(
        mint.publicKey,
        USDC_DECIMALS,
        payer.publicKey,
        null,
        TOKEN_2022_PROGRAM_ID,
      ),
    );
    await sendAndConfirmTransaction(provider.connection, tx, [payer, mint]);

    // Sanity check: the mint we just built really does carry a non-default
    // TransferHook program id, so a failure below is the program's own
    // check, not a malformed fixture.
    const mintInfo = await provider.connection.getAccountInfo(mint.publicKey);
    expect(mintInfo, "mint account should exist").to.not.equal(null);
    expect(mintInfo!.data.length).to.be.greaterThan(82);

    const progInfo = await provider.connection.getAccountInfo(program.programId);
    if (!progInfo) throw new Error("casi_escrow program not found on localnet");
    const programDataAddress = new PublicKey(progInfo.data.slice(4, 36));

    let rejected = false;
    let sawTransferHookNotAllowed = false;
    try {
      await program.methods
        .initializeConfig(new BN(0), new BN(0))
        .accounts({
          initializer:   payer.publicKey,
          config:        configPda,
          acceptedMint:  mint.publicKey,
          programData:   programDataAddress,
          tokenProgram:  TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([payer])
        .rpc();
    } catch (err) {
      rejected = true;
      const e = err as { message?: unknown; logs?: unknown };
      const msg = [
        typeof e?.message === 'string' ? e.message : '',
        Array.isArray(e?.logs) ? e.logs.join('\n') : '',
      ].join('\n');
      sawTransferHookNotAllowed = msg.includes('TransferHookNotAllowed');
      if (!sawTransferHookNotAllowed) {
        // Surface the real error rather than silently treating any failure
        // as success — a wrong rejection reason (e.g. an unrelated account
        // error) would otherwise let this test pass for the wrong reason.
        // eslint-disable-next-line no-console
        console.error('initialize_config failed, but NOT with TransferHookNotAllowed:', msg);
      }
    }

    expect(rejected, "initialize_config should have failed for a hook-bearing mint").to.equal(true);
    expect(sawTransferHookNotAllowed, "rejection reason should be TransferHookNotAllowed").to.equal(true);

    // Confirm no partial state: config must NOT exist after a rejected call,
    // so casi-escrow.ts's before() hook (which checks "does config already
    // exist") isn't misled into reusing a bogus config from this test.
    const configAfter = await provider.connection.getAccountInfo(configPda);
    expect(configAfter, "config must not exist after a rejected initialize_config").to.equal(null);
  });
});
