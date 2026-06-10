/**
 * POST /api/bookings/viewer-deny
 *
 * Viewer-side deny ("cancel my own booking"). Replaces the bare
 * `update({ status: 'denied' })` calls the overlay Solana flow used to make
 * under bookings_update_anon — those let any anon caller deny any booking
 * id (and the viewer_name-filtered cleanup at line 860 let them mass-deny
 * by matching another viewer's name).
 *
 * Auth: per-booking cancel_token issued by /api/bookings/create-solana,
 * /api/bookings/create-free, or /api/stripe/authorize. The viewer stores
 * it in localStorage (BOOKING_TOKENS_KEY).
 *
 * Request:  { booking_id, cancel_token, null_escrow?: boolean }
 * Response: { success: true }
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function tokensMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const rawId = body?.booking_id;
  const claimedToken = body?.cancel_token;
  const nullEscrow = !!body?.null_escrow;

  if (rawId === undefined || rawId === null || rawId === '') {
    return NextResponse.json({ error: 'booking_id required' }, { status: 400 });
  }
  // bookings.id is numeric — accept both number and string (PostgREST is happy
  // either way) so callers don't have to remember to String()-coerce.
  const booking_id = typeof rawId === 'number' ? rawId : String(rawId);

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, status, cancel_token')
    .eq('id', booking_id)
    .single();

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }
  if (!tokensMatch(claimedToken, booking.cancel_token)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Viewers may only cancel a booking that hasn't gone live. Flipping an
  // `active` beam to denied would let a viewer kill a beam mid-stream — and on
  // the Solana rail, desync the DB from an escrow that's still Active on-chain
  // (the funds keep vesting to the streamer while the DB says denied). Ending
  // a live beam is the streamer's action (end-early) or the on-chain settle.
  // Terminal states (denied/expired/cancelled) stay allowed so the overlay's
  // null_escrow recovery cleanup keeps working.
  if (booking.status === 'active') {
    return NextResponse.json(
      { error: 'Beam is already live — it can’t be cancelled here' },
      { status: 409 },
    );
  }

  const update: Record<string, unknown> = { status: 'denied' };
  if (nullEscrow) update.escrow_pda = null;

  await supabase.from('bookings').update(update).eq('id', booking.id);
  return NextResponse.json({ success: true });
}
