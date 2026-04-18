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
  const booking_id = body?.booking_id;
  const claimedToken = body?.cancel_token;
  const nullEscrow = !!body?.null_escrow;

  if (!booking_id || typeof booking_id !== 'string') {
    return NextResponse.json({ error: 'booking_id required' }, { status: 400 });
  }

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

  const update: Record<string, unknown> = { status: 'denied' };
  if (nullEscrow) update.escrow_pda = null;

  await supabase.from('bookings').update(update).eq('id', booking.id);
  return NextResponse.json({ success: true });
}
