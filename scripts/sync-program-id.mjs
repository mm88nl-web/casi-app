#!/usr/bin/env node
/**
 * sync-program-id.mjs
 *
 * Run after `anchor build && anchor deploy --provider.cluster devnet`.
 * Reads the canonical program ID from target/idl/casi_escrow.json and writes:
 *   1. Anchor.toml  [programs.devnet] casi_escrow = "..."
 *   2. programs/casi-escrow/src/lib.rs  declare_id!("...")
 *   3. .env.local   NEXT_PUBLIC_CASI_PROGRAM_ID=...
 *
 * Also verifies that NEXT_PUBLIC_CASI_FEE_WALLET and NEXT_PUBLIC_USDC_MINT_*
 * are present in .env.local and prints a Vercel env-var checklist.
 *
 * Usage:
 *   node scripts/sync-program-id.mjs                  # sync from IDL
 *   node scripts/sync-program-id.mjs --id <PUBKEY>    # sync explicit ID
 *   node scripts/sync-program-id.mjs --check          # verify only (no writes)
 */

import { readFile, writeFile, access } from 'node:fs/promises';
import { constants as fsConst } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');

const IDL_PATH        = join(ROOT, 'target', 'idl', 'casi_escrow.json');
const ANCHOR_TOML     = join(ROOT, 'Anchor.toml');
const LIB_RS          = join(ROOT, 'programs', 'casi-escrow', 'src', 'lib.rs');
const ENV_LOCAL       = join(ROOT, '.env.local');

const args       = process.argv.slice(2);
const explicitId = args.includes('--id') ? args[args.indexOf('--id') + 1] : null;
const checkOnly  = args.includes('--check');

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function die(msg) {
  console.error(`[sync-program-id] ✖ ${msg}`);
  process.exit(1);
}
function log(msg)  { console.log(`[sync-program-id] ${msg}`); }
function warn(msg) { console.warn(`[sync-program-id] ⚠ ${msg}`); }

async function readIdlProgramId() {
  try {
    await access(IDL_PATH, fsConst.R_OK);
  } catch {
    die(`IDL not found at ${IDL_PATH}. Run \`anchor build\` first.`);
  }
  const idl = JSON.parse(await readFile(IDL_PATH, 'utf8'));
  const id  = idl.address || idl.metadata?.address;
  if (!id) die('IDL has no top-level `address` or `metadata.address` field.');
  return id;
}

async function readFileIfExists(path) {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

async function updateAnchorToml(id) {
  const src = await readFile(ANCHOR_TOML, 'utf8');
  const re  = /(^\s*casi_escrow\s*=\s*")[^"]+(")/m;
  if (!re.test(src)) die('Could not locate `casi_escrow = "..."` in Anchor.toml.');
  const next = src.replace(re, `$1${id}$2`);
  if (next === src) return false;
  if (!checkOnly) await writeFile(ANCHOR_TOML, next);
  return true;
}

async function updateLibRs(id) {
  const src = await readFile(LIB_RS, 'utf8');
  const re  = /(declare_id!\(")[^"]+("\);)/;
  if (!re.test(src)) die('Could not locate declare_id!("...") in programs/casi-escrow/src/lib.rs.');
  const next = src.replace(re, `$1${id}$2`);
  if (next === src) return false;
  if (!checkOnly) await writeFile(LIB_RS, next);
  return true;
}

async function updateEnvLocal(id) {
  const prev = (await readFileIfExists(ENV_LOCAL)) ?? '';
  const line = `NEXT_PUBLIC_CASI_PROGRAM_ID=${id}`;
  let next;
  if (/^NEXT_PUBLIC_CASI_PROGRAM_ID=.*$/m.test(prev)) {
    next = prev.replace(/^NEXT_PUBLIC_CASI_PROGRAM_ID=.*$/m, line);
  } else {
    next = prev + (prev.endsWith('\n') || prev === '' ? '' : '\n') + line + '\n';
  }
  if (next === prev) return false;
  if (!checkOnly) await writeFile(ENV_LOCAL, next);
  return true;
}

function checkEnvVar(env, name, required) {
  const re = new RegExp(`^${name}=(.*)$`, 'm');
  const m  = env.match(re);
  if (!m || !m[1].trim()) {
    if (required) warn(`${name} is missing from .env.local`);
    return null;
  }
  const value = m[1].trim();
  if (!PUBKEY_RE.test(value)) warn(`${name} does not look like a valid base58 pubkey (${value})`);
  return value;
}

async function main() {
  const id = explicitId ?? (await readIdlProgramId());
  if (id.length < 32 || id.length > 44) die(`Program ID "${id}" has invalid length (${id.length}).`);
  if (!PUBKEY_RE.test(id)) warn(`Program ID "${id}" does not match strict base58 — OK for dev placeholder, FAIL for mainnet.`);
  log(`Program ID: ${id}`);

  const anchorChanged = await updateAnchorToml(id);
  const libChanged    = await updateLibRs(id);
  const envChanged    = await updateEnvLocal(id);

  const verb = checkOnly ? 'would update' : 'updated';
  log(`Anchor.toml       ${anchorChanged ? verb : 'already up-to-date'}`);
  log(`lib.rs            ${libChanged    ? verb : 'already up-to-date'}`);
  log(`.env.local        ${envChanged    ? verb : 'already up-to-date'}`);

  const env = (await readFileIfExists(ENV_LOCAL)) ?? '';
  checkEnvVar(env, 'NEXT_PUBLIC_CASI_FEE_WALLET',   true);
  checkEnvVar(env, 'NEXT_PUBLIC_USDC_MINT_DEVNET',  false);
  checkEnvVar(env, 'NEXT_PUBLIC_USDC_MINT_MAINNET', false);

  log('');
  log('Vercel checklist (Settings → Environment Variables → Production/Preview):');
  log(`  NEXT_PUBLIC_CASI_PROGRAM_ID    = ${id}`);
  log(`  NEXT_PUBLIC_CASI_FEE_WALLET    = <your treasury pubkey>`);
  log('  NEXT_PUBLIC_USDC_MINT_DEVNET   = 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
  log('  NEXT_PUBLIC_USDC_MINT_MAINNET  = EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  log('');
  log(checkOnly ? 'Check complete (no files written).' : 'Sync complete.');
}

main().catch(err => die(err.stack || err.message));
