import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { signStartBeamDelegated } from '@/lib/delegate-start-beam';
import { WALLET_ADAPTER_CLUSTER } from '@/lib/solana-network';
import { solscanTxUrl } from '@/lib/casi-escrow';

/**
 * POST /api/solana/delegates/start-beam
 *
 * Server-side crank for `start_beam_delegated`. Flips a Solana booking's
 * on-chain escrow Pending → Active using the streamer's installed session
 * key, so the streamer doesn't need a wallet pop-up every time they click
 * Approve (or Play Now on a queued booking).
 *
 * Invariants this route enforces BEFORE touching the chain:
 *   1. Bearer-auth'd streamer owns the booking (profile_id match).
 *   2. Booking is Solana-rail, status is pending OR approved_queued
 *      (approved_queued = streamer approved while the slot was occupied;
 *      on-chain is still Pending until we call start_beam here).
 *   3. escrow_pda is set (viewer has funded the vault).
 *   4. Streamer has a solana_wallet on file (the escrow's `streamer` key).
 *
 * The shared helper in @/lib/delegate-start-beam handles delegate lookup,
 * decryption, cranker signing, and tx send. Same helper is used by the
 * viewer-triggered `/api/bookings/expire-and-advance` route so natural
 * timer expiry can auto-promote the next queued Solana beam without the
 * streamer being online.
 *
 * DB writes are NOT performed here — the Helius webhook handles the
 * pending → active transition via the start_beam_delegated discriminator.
 * For approved_queued → active the caller (admin playNow, expire-and-advance)
 * flips DB status itself since the webhook only advances from `pending`.
 */

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { booking_id?: unknown } = {};
  try { body = (await req.json()) ?? {}; } catch { /* empty body → 400 below */ }
  const rawId = body.booking_id;
  if (rawId === undefined || rawId === null || rawId === '') {
    return NextResponse.json({ error: 'booking_id required' }, { status: 400 });
  }
  const bookingId = typeof rawId === 'number' ? rawId : String(rawId);

  const [{ data: booking, error: bookingErr }, { data: profile, error: profileErr }] =
    await Promise.all([
      supabase
        .from('bookings')
        .select('id, profile_id, status, payment_method, escrow_pda')
        .eq('id', bookingId)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('id, solana_wallet')
        .eq('id', user.id)
        .maybeSingle(),
    ]);

  if (bookingErr || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }
  if (profileErr || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }
  if (booking.profile_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (booking.payment_method !== 'solana') {
    return NextResponse.json({ error: 'Not a Solana booking', reason: 'wrong_rail' }, { status: 400 });
  }
  // Only pending (direct-approve) or approved_queued (promote-queued) are
  // valid starts. Active / expired / cancelled means the beam is past the
  // start_beam step — idempotent success so the client can move on.
  if (booking.status !== 'pending' && booking.status !== 'approved_queued') {
    return NextResponse.json({ ok: true, alreadyStarted: true, status: booking.status });
  }
  if (!booking.escrow_pda) {
    return NextResponse.json({ error: 'Booking has no escrow_pda', reason: 'no_escrow' }, { status: 400 });
  }
  if (!profile.solana_wallet) {
    return NextResponse.json(
      { error: 'Streamer wallet not on file', reason: 'no_wallet' },
      { status: 400 },
    );
  }

  const result = await signStartBeamDelegated({
    supabase,
    scope: 'delegates-start-beam',
    profileId: user.id,
    bookingId: booking.id,
    escrowId: booking.id,
    streamerWallet: profile.solana_wallet,
  });

  if (!result.ok) {
    switch (result.reason) {
      case 'no_delegate':
        return NextResponse.json(
          { error: 'No delegate installed', reason: 'no_delegate' },
          { status: 400 },
        );
      case 'revoked':
        return NextResponse.json(
          { error: 'Delegate has been revoked', reason: 'revoked' },
          { status: 400 },
        );
      case 'expired':
        return NextResponse.json(
          { error: 'Delegate has expired — rotate first', reason: 'expired' },
          { status: 400 },
        );
      case 'no_cranker':
        return NextResponse.json(
          { error: 'Server fee payer not configured', reason: 'no_cranker' },
          { status: 503 },
        );
      case 'db_error':
        return NextResponse.json(
          { error: 'Delegate lookup failed', reason: 'db_error' },
          { status: 500 },
        );
      case 'decrypt_failed':
      case 'key_mismatch':
        return NextResponse.json(
          { error: 'Server crypto error', reason: result.reason },
          { status: 500 },
        );
      case 'chain_error':
        return NextResponse.json(
          { error: 'On-chain start failed', reason: 'chain_error', message: result.message },
          { status: 502 },
        );
    }
  }

  if (result.alreadyProcessed) {
    return NextResponse.json({ ok: true, alreadyProcessed: true });
  }

  return NextResponse.json({
    ok: true,
    signature: result.signature,
    solscanUrl: solscanTxUrl(result.signature, WALLET_ADAPTER_CLUSTER),
  });
}
