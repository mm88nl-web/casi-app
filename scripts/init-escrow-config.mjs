#!/usr/bin/env node
/**
 * init-escrow-config.mjs
 *
 * One-time call to initialize_config on the deployed casi-escrow program.
 * Must be run by the wallet that is the program's upgrade authority.
 *
 * Usage (from repo root):
 *   node scripts/init-escrow-config.mjs
 *   node scripts/init-escrow-config.mjs --keypair /path/to/keypair.json
 *   node scripts/init-escrow-config.mjs --dry-run   # check without writing
 *
 * Prerequisites: npm install (node_modules must exist in repo root)
 */

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── parse args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const keypairFlagIdx = args.indexOf('--keypair');
const keypairPath = keypairFlagIdx !== -1
  ? args[keypairFlagIdx + 1]
  : join(homedir(), '.config', 'solana', 'id.json');
const isDryRun = args.includes('--dry-run');

// ── constants ───────────────────────────────────────────────────────────────
const PROGRAM_ID_STR   = 'CDunHmMe2KW8qmjoqWanuu3p1DsEYjqRA1yVmyXDtakM';
const DEVNET_USDC_STR  = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const TOKEN_PROGRAM_STR = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const CONFIG_SEED       = Buffer.from('casi-config');
const RPC               = process.env.NEXT_PUBLIC_SOLANA_RPC || 'https://api.devnet.solana.com';

// ── dynamic imports (avoids TS/ESM issues) ──────────────────────────────────
const { Connection, PublicKey, Keypair, SystemProgram } =
  await import('@solana/web3.js');
const { Program, AnchorProvider, setProvider, BN } =
  await import('@coral-xyz/anchor');

// ── load keypair ─────────────────────────────────────────────────────────────
let adminKp;
try {
  const raw = JSON.parse(readFileSync(keypairPath, 'utf8'));
  adminKp = Keypair.fromSecretKey(Uint8Array.from(raw));
} catch (e) {
  console.error(`\n✖ Failed to load keypair from: ${keypairPath}`);
  console.error(`  ${e.message}`);
  console.error('  Pass the correct path with --keypair <file>');
  process.exit(1);
}

const PROGRAM_ID = new PublicKey(PROGRAM_ID_STR);
const conn = new Connection(RPC, 'confirmed');

console.log('\ncasi-escrow initialize_config');
console.log('─'.repeat(48));
console.log('  RPC         :', RPC);
console.log('  Program ID  :', PROGRAM_ID_STR);
console.log('  Admin key   :', adminKp.publicKey.toBase58());
console.log('  Dry run     :', isDryRun);

// ── check if config PDA already exists ──────────────────────────────────────
const [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], PROGRAM_ID);
console.log('\n  Config PDA  :', configPda.toBase58());

const existing = await conn.getAccountInfo(configPda);
if (existing) {
  console.log('\n✓ Config already initialized — nothing to do.');
  console.log(`  Solscan: https://solscan.io/account/${configPda.toBase58()}?cluster=devnet`);
  process.exit(0);
}
console.log('  Config      : not found — will initialize');

// ── derive programData account ───────────────────────────────────────────────
// BPF Upgradeable Loader program account layout:
//   bytes 0-3   : state discriminant (2 = Program)
//   bytes 4-35  : programdata_address (32 bytes)
const progInfo = await conn.getAccountInfo(PROGRAM_ID);
if (!progInfo) {
  console.error(`\n✖ Program not found at ${PROGRAM_ID_STR} on this cluster.`);
  console.error('  Is the SOLANA_RPC env var pointing at the right cluster?');
  process.exit(1);
}
const programDataAddress = new PublicKey(progInfo.data.slice(4, 36));
console.log('  ProgramData :', programDataAddress.toBase58());

// ── verify admin is upgrade authority ────────────────────────────────────────
// ProgramData layout:
//   bytes 0-3   : discriminant (3 = ProgramData)
//   bytes 4-11  : deployment slot (u64 LE)
//   bytes 12    : is_initialized (u8)
//   bytes 13-45 : upgrade_authority pubkey (32 bytes, present when authority is set)
const pdInfo = await conn.getAccountInfo(programDataAddress);
if (!pdInfo) {
  console.error('\n✖ ProgramData account not found — unexpected.');
  process.exit(1);
}
const upgradeAuth = new PublicKey(pdInfo.data.slice(13, 45));
console.log('  Upgrade auth:', upgradeAuth.toBase58());

if (!upgradeAuth.equals(adminKp.publicKey)) {
  console.error('\n✖ This wallet is NOT the upgrade authority.');
  console.error(`  Upgrade authority : ${upgradeAuth.toBase58()}`);
  console.error(`  Your wallet       : ${adminKp.publicKey.toBase58()}`);
  console.error('  Use --keypair to point at the correct keypair file.');
  process.exit(1);
}
console.log('  ✓ Wallet matches upgrade authority');

if (isDryRun) {
  console.log('\nDry run — skipping on-chain write. Re-run without --dry-run to proceed.');
  process.exit(0);
}

// ── build and send ────────────────────────────────────────────────────────────
const IDL = JSON.parse(
  readFileSync(join(ROOT, 'src', 'idl', 'casi_escrow.json'), 'utf8'),
);
const wallet = {
  publicKey: adminKp.publicKey,
  signTransaction:    async (tx) => { tx.partialSign(adminKp); return tx; },
  signAllTransactions: async (txs) => { txs.forEach(tx => tx.partialSign(adminKp)); return txs; },
};
const provider = new AnchorProvider(conn, wallet, { commitment: 'confirmed' });
setProvider(provider);
const program = new Program(IDL, provider);

console.log('\nSending initialize_config...');
try {
  const sig = await program.methods
    .initializeConfig(
      new BN(0), // max_escrow_amount = 0 (no cap)
      new BN(0), // min_escrow_amount = 0 (no floor)
    )
    .accounts({
      initializer:   adminKp.publicKey,
      config:        configPda,
      acceptedMint:  new PublicKey(DEVNET_USDC_STR),
      programData:   programDataAddress,
      tokenProgram:  new PublicKey(TOKEN_PROGRAM_STR),
      systemProgram: SystemProgram.programId,
    })
    .signers([adminKp])
    .rpc();

  console.log('\n✓ initialize_config succeeded!');
  console.log('  Sig     :', sig);
  console.log('  Solscan : ' + `https://solscan.io/tx/${sig}?cluster=devnet`);
  console.log('\nSolana bookings should work again. Reload the overlay and try a booking.');
} catch (e) {
  console.error('\n✖ Transaction failed:', e.message);
  if (e.logs) {
    console.error('  Program logs:');
    e.logs.forEach(l => console.error('   ', l));
  }
  process.exit(1);
}
