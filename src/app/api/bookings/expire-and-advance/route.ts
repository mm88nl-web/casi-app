/**
 * POST /api/bookings/expire-and-advance
 *
 * Viewer-triggered natural expiry + queue advancement. Previously done from
 * the overlay page under `bookings_update_anon`, which let any anon caller
 * flip `status` on arbitrary rows (mass-deny / force-start DoS). This route
 * moves the write to service_role and only acts when the server independently
 * verifies the booking is active and its timer has actually expired.
 *
 * Stripe PaymentIntent capture is NOT handled here — the Vercel cron janitor
 * at /api/cron/stripe-janitor owns that to avoid double-capture races when
 * multiple viewers all hit expiry at the same moment.
 *
 * Solana queue advancement uses the streamer's installed session-key delegate
 * + the server-held cranker to fire `start_beam_delegated` on the next queued
 * booking, so a natural timer expiry auto-promotes the next beam without the
 * streamer being online. If the delegate is missing / revoked / expired, or
 * the cranker isn't configured, or the on-chain call fails, we leave the next
 * booking in `approved_queued` so admin can click Play Now to recover — the
 * queue stalls gracefully rather than corrupting on-chain state.
 *
 * Request body: { booking_id }
 * Response:     { expired: boolean, advanced?: boolean, reason?: string }
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { signStartBeamDelegated } from '@/lib/delegate-start-beam';
import { logError, logWarn } from '@/lib/observability';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const rawId = body?.booking_id;
  if (rawId === undefined || rawId === null || rawId === '') {
    return NextResponse.json({ error: 'booking_id required' }, { status: 400 });
  }
  const booking_id = typeof rawId === 'number' ? rawId : String(rawId);

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, element_id, profile_id, status, started_at, duration_minutes, payment_method, escrow_pda')
    .eq('id', booking_id)
    .single();

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  // Idempotent no-op if admin or the cron already expired it.
  if (booking.status !== 'active') {
    return NextResponse.json({ expired: false, reason: 'not_active' });
  }

  // Two ways to prove the beam is actually over:
  //   1. Clock — the booking's timer has run out (natural expiry).
  //   2. On-chain — for Solana, a closed escrow PDA means settle_beam already
  //      distributed funds (viewer ended early). The program enforces that
  //      only the viewer/streamer can trigger this, so a closed PDA is just
  //      as authoritative as the clock and can't be spoofed by an attacker.
  // A caller that triggers expiry on a still-running booking with an open
  // PDA is doing exactly what the mass-expire attack was.
  const startedMs = booking.started_at ? new Date(booking.started_at).getTime() : 0;
  const durationMs = Number(booking.duration_minutes || 0) * 60 * 1000;
  const timerElapsed = !!startedMs && !!durationMs && Date.now() >= startedMs + durationMs;

  let onChainClosed = false;
  if (!timerElapsed && booking.payment_method === 'solana' && booking.escrow_pda) {
    try {
      const { Connection, PublicKey } = await import('@solana/web3.js');
      const { SOLANA_RPC } = await import('@/lib/solana-network');
      const conn = new Connection(SOLANA_RPC, 'confirmed');
      const info = await conn.getAccountInfo(new PublicKey(booking.escrow_pda));
      onChainClosed = !info;
    } catch (err) {
      console.error('[expire-and-advance] PDA probe failed:', err);
    }
  }

  if (!timerElapsed && !onChainClosed) {
    return NextResponse.json({ expired: false, reason: 'not_overdue' }, { status: 409 });
  }

  // Conditional update — second concurrent caller gets no row back and exits.
  // For Solana end-early paths we also clear escrow_pda since the vault just
  // closed, keeping the DB projection in sync with on-chain state.
  const update: Record<string, unknown> = { status: 'expired', image_url: null };
  if (onChainClosed) update.escrow_pda = null;
  const { data: updated } = await supabase
    .from('bookings')
    .update(update)
    .eq('id', booking.id)
    .eq('status', 'active')
    .select('id')
    .single();

  if (!updated) {
    return NextResponse.json({ expired: false, reason: 'already_handled' });
  }

  let advanced = false;
  let advanceReason: string | undefined;
  if (booking.element_id) {
    const { data: next } = await supabase
      .from('bookings')
      .select('id, profile_id, image_url, element_id, payment_method, escrow_pda')
      .eq('element_id', booking.element_id)
      .eq('status', 'approved_queued')
      .order('approved_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!next) {
      await supabase
        .from('overlay_elements')
        .update({ image_url: null })
        .eq('id', booking.element_id);
    } else if (next.payment_method === 'solana') {
      // Solana queue advancement needs an on-chain start_beam before the DB
      // flip, otherwise the escrow stays in Pending while the UI says Active
      // and settle would revert. Use the streamer's delegate + cranker to
      // crank it server-side. Any failure (no delegate, cranker unfunded,
      // chain revert) leaves the row in approved_queued so admin can Play
      // Now manually — we do NOT flip DB to active on failure.
      if (!next.escrow_pda) {
        advanceReason = 'next_no_escrow';
        logWarn('expire-and-advance',
          'next Solana booking has no escrow_pda — cannot auto-promote',
          { booking_id: next.id });
        await supabase
          .from('overlay_elements')
          .update({ image_url: null })
          .eq('id', booking.element_id);
      } else {
        const { data: nextProfile } = await supabase
          .from('profiles')
          .select('solana_wallet')
          .eq('id', next.profile_id)
          .maybeSingle();
        if (!nextProfile?.solana_wallet) {
          advanceReason = 'next_no_streamer_wallet';
          logWarn('expire-and-advance',
            'next Solana streamer has no wallet on file — cannot auto-promote',
            { booking_id: next.id, profile_id: next.profile_id });
          await supabase
            .from('overlay_elements')
            .update({ image_url: null })
            .eq('id', booking.element_id);
        } else {
          const result = await signStartBeamDelegated({
            supabase,
            scope: 'expire-and-advance',
            profileId: next.profile_id,
            bookingId: next.id,
            escrowId: next.id,
            streamerWallet: nextProfile.solana_wallet,
          });
          if (result.ok) {
            // On-chain Active — safe to flip DB + canvas. Guard the DB update
            // on approved_queued so we don't regress a row the webhook raced
            // us to update (webhook only advances from pending, but belt-
            // and-braces).
            const { data: nextUpdated } = await supabase
              .from('bookings')
              .update({ status: 'active', started_at: new Date().toISOString() })
              .eq('id', next.id)
              .eq('status', 'approved_queued')
              .select('id')
              .single();
            if (nextUpdated) {
              await supabase
                .from('overlay_elements')
                .update({ image_url: next.image_url })
                .eq('id', next.element_id);
              advanced = true;
            } else {
              // Rare: chain succeeded, DB raced. Log loudly — admin must
              // reconcile. The escrow is Active on-chain so the streamer
              // gets paid; the only user-visible symptom is a blank slot.
              logError('expire-and-advance',
                new Error('start_beam_delegated confirmed but DB flip lost the race'),
                { booking_id: next.id, signature: result.signature });
              advanceReason = 'db_race';
            }
          } else {
            advanceReason = result.reason;
            // Clear the slot — the booking waits in approved_queued for
            // admin's Play Now.
            await supabase
              .from('overlay_elements')
              .update({ image_url: null })
              .eq('id', booking.element_id);
          }
        }
      }
    } else {
      // Stripe auto-advance: no on-chain work, just flip status + canvas.
      await supabase
        .from('bookings')
        .update({ status: 'active', started_at: new Date().toISOString() })
        .eq('id', next.id);
      await supabase
        .from('overlay_elements')
        .update({ image_url: next.image_url })
        .eq('id', next.element_id);
      advanced = true;
    }
  }

  return NextResponse.json({ expired: true, advanced, ...(advanceReason ? { reason: advanceReason } : {}) });
}
