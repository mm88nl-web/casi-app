/**
 * /api/cron/solana-reconciler
 *
 * Daily safety net for Solana booking state that drifted from the chain.
 * The Helius webhook at /api/webhooks/solana is the primary writer; this
 * cron only exists to catch webhook misses (delivery failures, secret
 * rotation gaps, bugs in the decoder, etc).
 *
 * Scope — two targeted scans, both cheap on current volume:
 *
 *   1. Stale `pending` Solana bookings older than N hours that still have
 *      `escrow_pda` set. Probe the PDA:
 *        - `null` (account closed) → escrow was cancelled/denied on-chain,
 *          flip DB to 'denied'. (A Pending escrow's only close path is
 *          cancel_escrow, which 100% refunds the viewer.)
 *        - status byte = 1 (Active)   → webhook missed start_beam, flip to
 *          'active' and stamp started_at.
 *        - status byte = 0 (Pending)  → viewer hasn't moved, leave alone.
 *
 *   2. `active` Solana bookings whose wall-clock should have ended (started
 *      + duration ≤ now). Probe the PDA:
 *        - `null` (account closed) → settle_beam already ran on-chain, flip
 *          DB to 'expired' and null image_url.
 *        - still Active             → settle hasn't cranked yet; leave alone.
 *          The next admin action or viewer overlay visit will crank it.
 *
 * Idempotent: every write uses a WHERE clause that matches the pre-transition
 * status so repeated runs after the drift is fixed are no-ops.
 *
 * Deployed on a daily schedule (Vercel Hobby cap) — fine for a backstop.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Connection, PublicKey } from '@solana/web3.js';
import { SOLANA_RPC } from '@/lib/solana-network';
import { logError } from '@/lib/observability';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Offset of the `status` byte inside the EscrowState account.
// Layout (from programs/casi-escrow/src/lib.rs):
//   0..8    Anchor discriminator
//   8..40   escrow_id ([u8; 32])
//   40..72  viewer (Pubkey)
//   72..104 streamer (Pubkey)
//   104..136 usdc_mint (Pubkey)
//   136..144 total_amount (u64)
//   144..152 duration_secs (u64)
//   152..160 start_timestamp (i64)
//   160..161 escrow_type (enum u8)
//   161..162 status      (enum u8)   ← offset 161
//   162..163 bump        (u8)
const ESCROW_STATUS_OFFSET = 161;
const ESCROW_STATUS_ACTIVE = 1;

// How long a pending row can sit unprobed before we touch it. Short enough
// to heal drift within a day, long enough that normal flows (viewer signing,
// streamer approving) finish first without a race.
const PENDING_STALE_AFTER_HOURS = 2;

type PendingRow = {
  id: number | string;
  escrow_pda: string;
  created_at: string;
  image_url: string | null;
  element_id: string | null;
};

type ActiveRow = {
  id: number | string;
  escrow_pda: string;
  started_at: string | null;
  duration_minutes: number | string | null;
  element_id: string | null;
};

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logError('solana-reconciler', 'CRON_SECRET not set');
    return NextResponse.json({ error: 'Misconfigured' }, { status: 500 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const connection = new Connection(SOLANA_RPC, 'confirmed');

  const pendingCutoff = new Date(
    Date.now() - PENDING_STALE_AFTER_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const [pending, active] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, escrow_pda, created_at, image_url, element_id')
      .eq('status', 'pending')
      .eq('payment_method', 'solana')
      .not('escrow_pda', 'is', null)
      .lt('created_at', pendingCutoff)
      .limit(200),
    supabase
      .from('bookings')
      .select('id, escrow_pda, started_at, duration_minutes, element_id')
      .eq('status', 'active')
      .eq('payment_method', 'solana')
      .not('escrow_pda', 'is', null)
      .not('started_at', 'is', null)
      .limit(200),
  ]);

  if (pending.error) logError('solana-reconciler', pending.error, { scope: 'select pending' });
  if (active.error) logError('solana-reconciler', active.error, { scope: 'select active' });

  const healed = { pendingToActive: 0, pendingToDenied: 0, activeToExpired: 0 };

  for (const row of (pending.data ?? []) as PendingRow[]) {
    try {
      const result = await reconcilePending(connection, row);
      if (result === 'active') healed.pendingToActive++;
      else if (result === 'denied') healed.pendingToDenied++;
    } catch (err) {
      logError('solana-reconciler', err, { booking_id: row.id, stage: 'pending' });
    }
  }

  const now = Date.now();
  for (const row of (active.data ?? []) as ActiveRow[]) {
    try {
      if (!isDurationExceeded(row, now)) continue;
      const result = await reconcileActive(connection, row);
      if (result === 'expired') healed.activeToExpired++;
    } catch (err) {
      logError('solana-reconciler', err, { booking_id: row.id, stage: 'active' });
    }
  }

  return NextResponse.json({
    scanned: {
      pending: pending.data?.length ?? 0,
      active: active.data?.length ?? 0,
    },
    healed,
  });
}

function isDurationExceeded(row: ActiveRow, nowMs: number): boolean {
  if (!row.started_at) return false;
  const dur = Number(row.duration_minutes);
  if (!Number.isFinite(dur) || dur <= 0) return false;
  const endsAt = new Date(row.started_at).getTime() + dur * 60_000;
  return nowMs >= endsAt;
}

async function reconcilePending(
  connection: Connection,
  row: PendingRow,
): Promise<'active' | 'denied' | 'noop'> {
  const info = await connection.getAccountInfo(new PublicKey(row.escrow_pda));

  if (!info) {
    // Account closed — for a Pending DB row, the only close path is
    // cancel_escrow (viewer refund). Match DB to that.
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'denied' })
      .eq('id', row.id)
      .eq('status', 'pending');
    if (error) throw error;
    return 'denied';
  }

  const status = info.data[ESCROW_STATUS_OFFSET];
  if (status === ESCROW_STATUS_ACTIVE) {
    // Webhook missed start_beam. Use on-chain start timestamp if we can
    // decode it, otherwise now(). Reading start_timestamp here is a nice-
    // to-have — the DB `started_at` is only used for UI countdown, and an
    // off-by-a-few-minutes stamp on a drifted row is acceptable.
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'active', started_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'pending');
    if (error) throw error;
    // Mirror to overlay_elements — same reason as in the webhook: the
    // admin client may have failed to run its post-sign projection.
    if (row.element_id && row.image_url) {
      await supabase
        .from('overlay_elements')
        .update({ image_url: row.image_url })
        .eq('id', row.element_id);
    }
    return 'active';
  }

  // status byte 0 (Pending) → viewer hasn't cancelled, streamer hasn't
  // started. Nothing to heal.
  return 'noop';
}

async function reconcileActive(
  connection: Connection,
  row: ActiveRow,
): Promise<'expired' | 'noop'> {
  const info = await connection.getAccountInfo(new PublicKey(row.escrow_pda));
  if (info) {
    // Still Active on chain even though duration has elapsed. Someone has
    // to crank settle_beam; that's not this cron's job (we don't hold a
    // signing key here). Leave it.
    return 'noop';
  }

  // Account closed → settle_beam has run. DB hasn't caught up.
  const { error } = await supabase
    .from('bookings')
    .update({ status: 'expired', image_url: null })
    .eq('id', row.id)
    .eq('status', 'active');
  if (error) throw error;
  // Clear the canvas to match admin's expire path (empty string, not null
  // — OBS filters on truthy length).
  if (row.element_id) {
    await supabase
      .from('overlay_elements')
      .update({ image_url: '' })
      .eq('id', row.element_id);
  }
  return 'expired';
}
