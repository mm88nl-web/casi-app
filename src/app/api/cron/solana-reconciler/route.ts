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
 *        - still Active             → past duration, settle_beam is
 *          PERMISSIONLESS at this point (see programs/casi-escrow/src/lib.rs)
 *          — crank it ourselves with the cranker keypair, same pattern as
 *          crankStalePending below. 100% of the vested amount goes to the
 *          streamer once fully elapsed; nothing for the cranker to hold or
 *          route. Found live 2026-09-09: nothing previously called
 *          settle_beam for this case at all — a viewer's own wallet is the
 *          ONLY thing that used to crank it, and if their wallet's own
 *          preflight simulation balked (seen live: Solflare refusing to
 *          simulate an unfamiliar program), the escrow just sat stuck
 *          forever with no automatic fallback. The webhook (or tomorrow's
 *          reconciler run, via the branch above) flips DB status once the
 *          PDA actually closes — this function only fires the crank.
 *
 *   3. `expired` Solana bookings that STILL have `escrow_pda` set — the same
 *      set the viewer overlay's "Ended early — USDC recoverable" chip is
 *      built from (isSolanaKickLeaked). This is the case where DB status
 *      already says expired (a prior settle attempt threw and, before
 *      #197, the status got flipped anyway) but nothing ever actually
 *      closed the escrow on-chain — scan 2 above can never reach these,
 *      since it filters on `status = 'active'` and these rows aren't.
 *      Probe the PDA:
 *        - `null` (account closed) → something settled it since (a
 *          viewer's own wallet, a previous run of this same crank) — null
 *          `escrow_pda` so the stale "recover" chip clears.
 *        - still Active             → crank settle_beam, same as scan 2.
 *        - Pending                  → shouldn't happen for a DB row that's
 *          already 'expired'; leave for a human to look at rather than
 *          guess at a recovery action here.
 *
 * Idempotent: every write uses a WHERE clause that matches the pre-transition
 * status so repeated runs after the drift is fixed are no-ops.
 *
 * Deployed on a daily schedule (Vercel Hobby cap) — fine for a backstop.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { SOLANA_RPC, WALLET_ADAPTER_CLUSTER } from '@/lib/solana-network';
import { CasiEscrowClient } from '@/lib/casi-escrow';
import { loadCrankerKeypair } from '@/lib/cranker-keypair';
import { logError, logWarn } from '@/lib/observability';

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

// Mirror of PENDING_TIMEOUT_SECS in programs/casi-escrow/src/lib.rs — the
// earliest moment cancel_stale_pending will succeed on-chain. Rows probed
// before this cutoff simply get left in Pending. Small extra buffer (1h) so
// we never race the program's on-chain clock check.
const PENDING_CRANK_CUTOFF_HOURS = 7 * 24 + 1;

type PendingRow = {
  id: number | string;
  escrow_pda: string;
  /** See docs/fable-security-review-2026-08-28.md Finding 1 — falls back to
   *  `id` for rows created before this column existed. */
  escrow_seed: string | null;
  created_at: string;
  image_url: string | null;
  element_id: string | null;
  viewer_wallet: string | null;
};

type ActiveRow = {
  id: number | string;
  escrow_pda: string;
  escrow_seed: string | null;
  started_at: string | null;
  duration_minutes: number | string | null;
  element_id: string | null;
  viewer_wallet: string | null;
  profile_id: string;
};

// A booking DB status can say 'expired' while the escrow is still Active
// on-chain — the viewer-facing "Ended early — USDC recoverable" chip
// (isSolanaKickLeaked in MyBeamsSection.tsx) already surfaces exactly this
// set. Same shape as ActiveRow minus the fields only needed for the
// duration check, which doesn't apply here (an already-'expired' row gets
// probed unconditionally, not gated on wall-clock).
type LeakedRow = {
  id: number | string;
  escrow_pda: string;
  escrow_seed: string | null;
  viewer_wallet: string | null;
  profile_id: string;
  element_id: string | null;
};

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logError('solana-reconciler', 'CRON_SECRET not set');
    return NextResponse.json({ error: 'Misconfigured' }, { status: 500 });
  }
  const auth = req.headers.get('authorization') ?? '';
  const expected = Buffer.from(`Bearer ${cronSecret}`);
  const actual   = Buffer.from(auth);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const connection = new Connection(SOLANA_RPC, 'confirmed');

  // Optional permissionless-crank signer. Unset = we only PROBE the chain,
  // we don't try to close stuck-pending escrows. Any signer with a few
  // thousand lamports works — this is literally the permissionless path
  // the on-chain program allows for anyone.
  const cranker = loadCrankerKeypair('solana-reconciler');
  if (!cranker) {
    logWarn('solana-reconciler', 'SOLANA_CRANKER_KEYPAIR not set — stale-pending cancels and past-duration settles will be skipped');
  }

  const pendingCutoff = new Date(
    Date.now() - PENDING_STALE_AFTER_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const [pending, active, leaked] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, escrow_pda, escrow_seed, created_at, image_url, element_id, viewer_wallet')
      .eq('status', 'pending')
      .eq('payment_method', 'solana')
      .not('escrow_pda', 'is', null)
      .lt('created_at', pendingCutoff)
      .limit(200),
    supabase
      .from('bookings')
      .select('id, escrow_pda, escrow_seed, started_at, duration_minutes, element_id, viewer_wallet, profile_id')
      .eq('status', 'active')
      .eq('payment_method', 'solana')
      .not('escrow_pda', 'is', null)
      .not('started_at', 'is', null)
      .limit(200),
    supabase
      .from('bookings')
      .select('id, escrow_pda, escrow_seed, viewer_wallet, profile_id, element_id')
      .eq('status', 'expired')
      .eq('payment_method', 'solana')
      .not('escrow_pda', 'is', null)
      .limit(200),
  ]);

  if (pending.error) logError('solana-reconciler', pending.error, { scope: 'select pending' });
  if (active.error) logError('solana-reconciler', active.error, { scope: 'select active' });
  if (leaked.error) logError('solana-reconciler', leaked.error, { scope: 'select leaked' });

  // Streamer wallets for whatever active/leaked rows we actually need to
  // consider cranking — a second, cheap query rather than an embedded join
  // (this file doesn't use those anywhere else, so keeping the same
  // plain-select style is more consistent than introducing new join syntax
  // here). Both scans share the same map.
  const neededProfileIds = Array.from(new Set([
    ...((active.data ?? []) as ActiveRow[]).map(r => r.profile_id),
    ...((leaked.data ?? []) as LeakedRow[]).map(r => r.profile_id),
  ].filter(Boolean)));
  const streamerWalletByProfile = new Map<string, string | null>();
  if (neededProfileIds.length) {
    const { data: profiles, error: profilesErr } = await supabase
      .from('profiles')
      .select('id, solana_wallet')
      .in('id', neededProfileIds);
    if (profilesErr) logError('solana-reconciler', profilesErr, { scope: 'select active-profiles' });
    for (const p of profiles ?? []) streamerWalletByProfile.set(p.id, p.solana_wallet);
  }

  const healed = {
    pendingToActive: 0,
    pendingToDenied: 0,
    activeToExpired: 0,
    activeCranked: 0,
    stalePendingCranked: 0,
    leakedCranked: 0,
    leakedCleared: 0,
  };

  for (const row of (pending.data ?? []) as PendingRow[]) {
    try {
      const result = await reconcilePending(connection, row, cranker);
      if (result === 'active') healed.pendingToActive++;
      else if (result === 'denied') healed.pendingToDenied++;
      else if (result === 'cranked') healed.stalePendingCranked++;
    } catch (err) {
      logError('solana-reconciler', err, { booking_id: row.id, stage: 'pending' });
    }
  }

  const now = Date.now();
  for (const row of (active.data ?? []) as ActiveRow[]) {
    try {
      if (!isDurationExceeded(row, now)) continue;
      const streamerWallet = streamerWalletByProfile.get(row.profile_id) ?? null;
      const result = await reconcileActive(connection, row, cranker, streamerWallet);
      if (result === 'expired') healed.activeToExpired++;
      else if (result === 'cranked') healed.activeCranked++;
    } catch (err) {
      logError('solana-reconciler', err, { booking_id: row.id, stage: 'active' });
    }
  }

  for (const row of (leaked.data ?? []) as LeakedRow[]) {
    try {
      const streamerWallet = streamerWalletByProfile.get(row.profile_id) ?? null;
      const result = await reconcileLeaked(connection, row, cranker, streamerWallet);
      if (result === 'cranked') healed.leakedCranked++;
      else if (result === 'cleared') healed.leakedCleared++;
    } catch (err) {
      logError('solana-reconciler', err, { booking_id: row.id, stage: 'leaked' });
    }
  }

  // ── Stale Solana flashes ─────────────────────────────────────────────
  // Streamers expect their queue to be clean every morning, so we deny
  // any pending Solana flash created BEFORE the current UTC day. A flash
  // sent yesterday that the streamer never moderated gets auto-denied at
  // 03:30 UTC; same-day flashes stay pending until the next nightly run.
  //
  // We don't auto-cancel the on-chain escrow — the viewer's overlay
  // surfaces a "Recover USDC" chip on denied rows, and after 7 days the
  // program's cancel_stale_pending crank refunds the viewer
  // permissionlessly. Without this sweep nothing ever denied old Solana
  // flashes (the reconciler previously only touched bookings).
  const todayStartUtc = new Date();
  todayStartUtc.setUTCHours(0, 0, 0, 0);
  const flashCutoff = todayStartUtc.toISOString();
  const { data: staleFlashes } = await supabase
    .from('flashes')
    .select('id')
    .eq('status', 'pending')
    .eq('payment_method', 'solana')
    .lt('created_at', flashCutoff)
    .returns<{ id: string }[]>();
  let flashesDenied = 0;
  if (staleFlashes?.length) {
    const { error: flErr } = await supabase
      .from('flashes')
      .update({ status: 'denied' })
      .in('id', staleFlashes.map(f => f.id));
    if (flErr) {
      logError('solana-reconciler', flErr, { stage: 'stale-flashes' });
    } else {
      flashesDenied = staleFlashes.length;
    }
  }

  return NextResponse.json({
    scanned: {
      pending: pending.data?.length ?? 0,
      active: active.data?.length ?? 0,
      leaked: leaked.data?.length ?? 0,
      staleFlashes: staleFlashes?.length ?? 0,
    },
    healed: { ...healed, flashesDenied },
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
  cranker: Keypair | null,
): Promise<'active' | 'denied' | 'cranked' | 'noop'> {
  const info = await connection.getAccountInfo(new PublicKey(row.escrow_pda));

  if (!info) {
    // Account closed — for a Pending DB row, the only close path is
    // cancel_escrow (viewer refund). Match DB to that. Null escrow_pda
    // in the same write so the viewer's overlay stops surfacing a stale
    // "Recover USDC" chip on a row whose vault is provably empty.
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'denied', escrow_pda: null })
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
  // started. If the row is past PENDING_CRANK_CUTOFF_HOURS and we have a
  // cranker keypair, the on-chain program will let anyone close this PDA
  // and refund the viewer. Fire it — no one else may. (Viewer's reclaim
  // path only runs when the viewer revisits; most don't.)
  const createdMs = Date.parse(row.created_at);
  const ageHours  = Number.isFinite(createdMs)
    ? (Date.now() - createdMs) / (60 * 60 * 1000)
    : 0;
  if (cranker && ageHours >= PENDING_CRANK_CUTOFF_HOURS && row.viewer_wallet) {
    try {
      await crankStalePending(connection, cranker, row);
      // Status flip is handled by the webhook when the on-chain event lands;
      // the cancel_stale_pending discriminator was added in the phase-3 webhook
      // slice. If for any reason the webhook misses this, tomorrow's reconciler
      // run will see the closed PDA and flip DB → denied via the branch above.
      return 'cranked';
    } catch (err) {
      logError('solana-reconciler', err, { booking_id: row.id, stage: 'crank-stale' });
      // Fall through to noop — we'll retry tomorrow.
    }
  }
  return 'noop';
}


// CasiEscrowClient expects an AnchorWallet — this shim is shared by both
// crank helpers below so the cranker keypair can drive it without going
// through the wallet-adapter.
function crankerWallet(cranker: Keypair): import('@solana/wallet-adapter-react').AnchorWallet {
  return {
    publicKey: cranker.publicKey,
    signTransaction: async <T>(t: T): Promise<T> => {
      (t as { partialSign(k: Keypair): void }).partialSign(cranker);
      return t;
    },
    signAllTransactions: async <T>(ts: T[]): Promise<T[]> => {
      for (const t of ts) (t as { partialSign(k: Keypair): void }).partialSign(cranker);
      return ts;
    },
  } as unknown as import('@solana/wallet-adapter-react').AnchorWallet;
}

async function crankStalePending(
  connection: Connection,
  cranker: Keypair,
  row: PendingRow,
): Promise<void> {
  if (!row.viewer_wallet) return;
  const client = new CasiEscrowClient(connection, crankerWallet(cranker), WALLET_ADAPTER_CLUSTER);
  await client.cancelStalePending({
    escrowId: row.escrow_seed ?? row.id,
    viewer:   new PublicKey(row.viewer_wallet),
  });
}

// Past-duration settle_beam is permissionless (see programs/casi-escrow/
// src/lib.rs) — any signer can crank it once elapsed ≥ duration, which pays
// 100% of the vested amount to the streamer. This is the fallback for when
// no one's own wallet ever cranks it (see the doc comment at the top of
// this file for the live incident that motivated adding this). Shared by
// both reconcileActive (DB still says 'active') and reconcileLeaked (DB
// already flipped to 'expired' but the escrow never actually closed) —
// narrowed to just the fields either row shape can supply.
async function crankExpiredActive(
  connection: Connection,
  cranker: Keypair,
  row: { id: number | string; escrow_seed: string | null; viewer_wallet: string | null },
  streamerWallet: string,
): Promise<void> {
  if (!row.viewer_wallet) return;
  const client = new CasiEscrowClient(connection, crankerWallet(cranker), WALLET_ADAPTER_CLUSTER);
  await client.settleBeam({
    escrowId: row.escrow_seed ?? row.id,
    viewer:   new PublicKey(row.viewer_wallet),
    streamer: new PublicKey(streamerWallet),
  });
}

async function reconcileActive(
  connection: Connection,
  row: ActiveRow,
  cranker: Keypair | null,
  streamerWallet: string | null,
): Promise<'expired' | 'cranked' | 'noop'> {
  const info = await connection.getAccountInfo(new PublicKey(row.escrow_pda));
  if (info) {
    // Still Active on chain even though duration has elapsed — permissionless
    // settle_beam window. Crank it ourselves if we have a signer and both
    // wallets; otherwise leave it for the next viewer/streamer action.
    if (cranker && streamerWallet && row.viewer_wallet) {
      try {
        await crankExpiredActive(connection, cranker, row, streamerWallet);
        return 'cranked';
      } catch (err) {
        const { isBenignEscrowRace } = await import('@/lib/casi-errors');
        // A race against something else settling this same escrow between
        // our probe and our tx (a viewer's own wallet action, another
        // reconciler run) isn't a real failure — the escrow's closed
        // either way. Anything else gets logged for a human to look at.
        if (!isBenignEscrowRace(err)) {
          logError('solana-reconciler', err, { booking_id: row.id, stage: 'crank-active' });
        }
      }
    }
    return 'noop';
  }

  // Account closed → settle_beam has run. DB hasn't caught up. Null
  // escrow_pda in the same write so the viewer's overlay stops surfacing
  // a stale "Recover USDC" chip on a row whose vault is empty. Also set
  // ended_at so the activity-list proration math knows this row settled
  // (best-effort — the cron may run hours after the actual on-chain
  // settle, in which case proration will under-credit the streamer; the
  // webhook hits this faster and is the primary writer).
  const { error } = await supabase
    .from('bookings')
    .update({
      status:     'expired',
      image_url:  null,
      escrow_pda: null,
      ended_at:   new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('status', 'active');
  if (error) throw error;
  // Clear the canvas to match admin's expire path (empty string, not null
  // — OBS filters on truthy length).
  if (row.element_id) {
    await supabase
      .from('overlay_elements')
      .update({ image_url: null })
      .eq('id', row.element_id);
  }
  return 'expired';
}

// DB already says 'expired' but escrow_pda is still set — the same set
// that powers the viewer overlay's "Ended early — USDC recoverable" chip
// (isSolanaKickLeaked). reconcileActive can never reach these rows (it
// filters on status = 'active'). See the doc comment at the top of this
// file for the live incident this closes.
// Shared by both branches of reconcileLeaked below — a row that reaches
// either one is, by definition, done: the escrow is closed (or was just
// confirmed-settled) and DB status is already 'expired'. Clears escrow_pda
// (stops the "recover" chip) AND overlay_elements.image_url (stops the
// canvas rendering stale media for the slot) in the same pass — found live
// 2026-09-09: the original pre-#197 bug's DB-flip path never cleared the
// canvas at all (only reconcileActive's "closed" branch does that, and
// this row is invisible to that scan by definition — see the file's top
// doc comment), so a settled beam kept showing its old video/image
// indefinitely until this ran.
async function clearLeakedRow(row: LeakedRow): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update({ escrow_pda: null })
    .eq('id', row.id)
    .eq('status', 'expired')
    .not('escrow_pda', 'is', null);
  if (error) throw error;
  if (row.element_id) {
    await supabase
      .from('overlay_elements')
      .update({ image_url: null })
      .eq('id', row.element_id);
  }
}

async function reconcileLeaked(
  connection: Connection,
  row: LeakedRow,
  cranker: Keypair | null,
  streamerWallet: string | null,
): Promise<'cranked' | 'cleared' | 'noop'> {
  const info = await connection.getAccountInfo(new PublicKey(row.escrow_pda));

  if (!info) {
    // Already closed by something else since — a viewer's own wallet
    // finally going through, a previous run of this same crank.
    await clearLeakedRow(row);
    return 'cleared';
  }

  const status = info.data[ESCROW_STATUS_OFFSET];
  if (status !== ESCROW_STATUS_ACTIVE) {
    // Pending on-chain while DB already says expired is an unexpected
    // combination (a beam that never started can't have "expired") —
    // leave it alone rather than guess at a recovery action here.
    return 'noop';
  }

  if (cranker && streamerWallet && row.viewer_wallet) {
    try {
      await crankExpiredActive(connection, cranker, row, streamerWallet);
      // Settle just confirmed (crankExpiredActive awaits the Anchor .rpc()
      // call) — safe to clear now rather than waiting for next run to
      // re-probe and find it closed.
      await clearLeakedRow(row);
      return 'cranked';
    } catch (err) {
      const { isBenignEscrowRace } = await import('@/lib/casi-errors');
      if (!isBenignEscrowRace(err)) {
        logError('solana-reconciler', err, { booking_id: row.id, stage: 'crank-leaked' });
      }
    }
  }
  return 'noop';
}
