/**
 * /api/cron/cranker-monitor
 *
 * Daily SOL balance check for the server-held delegate fee payer.
 *
 * The cranker (`SOLANA_CRANKER_KEYPAIR`) pays fees + ATA rent for every
 * delegated start_beam / settle_beam / approve_flash / deny_flash, plus the
 * permissionless `cancel_stale_pending` from the daily reconciler. If it
 * runs out of SOL, the delegate routes return 503 and admin falls back to
 * wallet-signed everything — every approve and every kick pops a popup.
 *
 * Steady-state burn is ~10k lamports per delegated op (two sigs × 5k base
 * fee), with ~2.04M lamports one-time per fresh ATA the first time a
 * streamer or viewer's USDC ATA is created. 0.05 SOL covers thousands of
 * ops at steady state. We warn at 0.005 SOL (~500 ops left) so there's
 * still a comfortable runway when the alert fires.
 *
 * Scoped: read-only. The cron never moves funds; just probes the chain
 * and emits a structured log. ERROR_WEBHOOK_URL gets the page if set.
 *
 * Hobby-plan-friendly: daily cron only. The cranker doesn't bleed fast
 * enough to need higher cadence — at >0.005 SOL even a hot day's traffic
 * leaves headroom until the next run.
 */
import { NextResponse } from 'next/server';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { SOLANA_RPC } from '@/lib/solana-network';
import { loadCrankerKeypair } from '@/lib/cranker-keypair';
import { logError, logWarn } from '@/lib/observability';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// ~500 delegated ops at steady-state base fee; gives multiple days of
// headroom between the alert firing and the cranker actually running dry.
const WARN_THRESHOLD_LAMPORTS = 0.005 * LAMPORTS_PER_SOL;

// One-time ATA rent (worst case both viewer + streamer ATAs are fresh on
// the same delegated settle) is ~0.00409 SOL. If the balance can't cover
// that single op, the next delegated settle will fail — page louder.
const CRITICAL_THRESHOLD_LAMPORTS = 0.001 * LAMPORTS_PER_SOL;

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logError('cranker-monitor', 'CRON_SECRET not set');
    return NextResponse.json({ error: 'Misconfigured' }, { status: 500 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cranker = loadCrankerKeypair('cranker-monitor');
  if (!cranker) {
    // Not necessarily an error — if delegation isn't deployed yet the env
    // var is unset by design. Log a warn so the admin sees this on the
    // first run after enabling delegation, then no-op.
    logWarn('cranker-monitor', 'SOLANA_CRANKER_KEYPAIR not set — skipping balance probe');
    return NextResponse.json({ skipped: 'no-cranker' });
  }

  const connection = new Connection(SOLANA_RPC, 'confirmed');
  let lamports: number;
  try {
    lamports = await connection.getBalance(cranker.publicKey, 'confirmed');
  } catch (err) {
    logError('cranker-monitor', err, { stage: 'getBalance', cranker: cranker.publicKey.toBase58() });
    return NextResponse.json({ error: 'rpc-error' }, { status: 502 });
  }

  const sol = lamports / LAMPORTS_PER_SOL;
  const pubkey = cranker.publicKey.toBase58();
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'devnet';

  if (lamports < CRITICAL_THRESHOLD_LAMPORTS) {
    logError(
      'cranker-monitor',
      `Cranker BELOW critical threshold — top up immediately. ${sol.toFixed(6)} SOL remaining.`,
      { pubkey, lamports, sol, cluster, threshold: 'critical' },
    );
  } else if (lamports < WARN_THRESHOLD_LAMPORTS) {
    logWarn(
      'cranker-monitor',
      `Cranker low — top up before it bottoms out. ${sol.toFixed(6)} SOL remaining.`,
      { pubkey, lamports, sol, cluster, threshold: 'warn' },
    );
  }

  return NextResponse.json({
    pubkey,
    cluster,
    lamports,
    sol,
    healthy: lamports >= WARN_THRESHOLD_LAMPORTS,
  });
}
