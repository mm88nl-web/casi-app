/**
 * POST /api/bookings/attach-solana-tx
 *
 * Persists Solana payment proof on a booking the viewer just funded:
 * tx_signature (optional — recovery path may not have it), escrow_pda, and
 * viewer_wallet. Replaces direct anon writes that needed
 * bookings_update_anon to grant UPDATE on those columns.
 *
 * Auth: per-booking cancel_token issued by /api/bookings/create-solana.
 *
 * Request:  { booking_id, cancel_token, tx_signature?, escrow_pda, viewer_wallet }
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
  const tx_signature: string | undefined = body?.tx_signature;
  const escrow_pda: string | undefined = body?.escrow_pda;
  const viewer_wallet: string | undefined = body?.viewer_wallet;

  if (rawId === undefined || rawId === null || rawId === '') {
    return NextResponse.json({ error: 'booking_id required' }, { status: 400 });
  }
  const booking_id = typeof rawId === 'number' ? rawId : String(rawId);
  if (!escrow_pda || !viewer_wallet) {
    return NextResponse.json({ error: 'escrow_pda + viewer_wallet required' }, { status: 400 });
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, cancel_token')
    .eq('id', booking_id)
    .single();

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }
  if (!tokensMatch(claimedToken, booking.cancel_token)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const update: Record<string, unknown> = { escrow_pda, viewer_wallet };
  if (tx_signature) update.tx_signature = tx_signature;

  await supabase.from('bookings').update(update).eq('id', booking.id);
  return NextResponse.json({ success: true });
}
