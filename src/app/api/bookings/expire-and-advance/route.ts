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
 * Request body: { booking_id }
 * Response:     { expired: boolean, advanced?: boolean }
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
    .select('id, element_id, status, started_at, duration_minutes, payment_method, escrow_pda')
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
  // closed — keeps StuckEscrowsPanel from treating this as an orphan.
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
  if (booking.element_id) {
    const { data: next } = await supabase
      .from('bookings')
      .select('id, image_url, element_id')
      .eq('element_id', booking.element_id)
      .eq('status', 'approved_queued')
      .order('approved_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (next) {
      await supabase
        .from('bookings')
        .update({ status: 'active', started_at: new Date().toISOString() })
        .eq('id', next.id);
      await supabase
        .from('overlay_elements')
        .update({ image_url: next.image_url })
        .eq('id', next.element_id);
      advanced = true;
    } else {
      await supabase
        .from('overlay_elements')
        .update({ image_url: '' })
        .eq('id', booking.element_id);
    }
  }

  return NextResponse.json({ expired: true, advanced });
}
