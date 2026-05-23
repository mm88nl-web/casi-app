import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { stripe } from '@/lib/stripe';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Cancels (voids or refunds) a booking's PaymentIntent and marks it denied.
 *
 * Two caller types:
 *   1. Streamer (admin page) — presents a Supabase bearer token. Allowed to
 *      cancel any booking on their own profile.
 *   2. Viewer (overlay page) — anonymous, but must present the booking's
 *      cancel_token (random UUID issued once by /api/stripe/authorize or
 *      /api/bookings/create-free and stored in the viewer's localStorage).
 *      viewer_name was previously used here but is publicly readable via
 *      bookings_select_public, which allowed mass enumeration + cancel.
 *
 * Direct Charges note: PaymentIntents live on the streamer's connected
 * account (see stripe/authorize/route.ts), so every Stripe call here must
 * pass { stripeAccount } to target the right account.
 */
function tokensMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export async function POST(req: Request) {
  const { booking_id, cancel_token: claimedToken } = await req.json();
  if (!booking_id) {
    return NextResponse.json({ error: 'booking_id required' }, { status: 400 });
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, profile_id, payment_intent_id, status, cancel_token')
    .eq('id', booking_id)
    .single();

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  // ── Authz: streamer-token OR viewer cancel_token match ──────────────────
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  let streamerAuthorized = false;
  let viewerAuthorized = false;

  if (token) {
    const { data: { user } } = await supabase.auth.getUser(token);
    if (user && user.id === booking.profile_id) streamerAuthorized = true;
  }
  if (!streamerAuthorized && tokensMatch(claimedToken, booking.cancel_token)) {
    viewerAuthorized = true;
  }
  if (!streamerAuthorized && !viewerAuthorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // Viewers can only cancel pre-active bookings — voiding a PI on an active
  // beam would let them watch free and receive a full refund. Streamers may
  // cancel at any status (early-end flow calls this for active beams).
  if (viewerAuthorized && booking.status !== 'pending' && booking.status !== 'approved_queued') {
    return NextResponse.json(
      { error: 'Beam is already active — contact the streamer to end it early' },
      { status: 409 },
    );
  }
  // ────────────────────────────────────────────────────────────────────────

  // Need the streamer's connected account id to target their PaymentIntent.
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_account_id')
    .eq('id', booking.profile_id)
    .single();

  if (booking.payment_intent_id && profile?.stripe_account_id) {
    const opts = { stripeAccount: profile.stripe_account_id };
    try {
      const pi = await stripe.paymentIntents.retrieve(booking.payment_intent_id, undefined, opts);
      if (pi.status === 'requires_capture') {
        await stripe.paymentIntents.cancel(booking.payment_intent_id, undefined, opts);
      } else if (pi.status === 'succeeded') {
        await stripe.refunds.create({ payment_intent: booking.payment_intent_id }, opts);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[stripe/cancel] stripe call failed:', message);
    }
  }

  await supabase
    .from('bookings')
    .update({ status: 'denied' })
    .eq('id', booking_id);

  return NextResponse.json({ success: true });
}
