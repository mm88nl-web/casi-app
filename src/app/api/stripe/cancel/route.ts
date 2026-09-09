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
      // Found live 2026-09-09: this used to log-and-continue unconditionally,
      // so a refund that genuinely failed (network blip, Stripe API error,
      // insufficient connected-account balance, a disputed charge) still
      // flipped the booking to 'denied' with the viewer fully charged and no
      // refund ever issued — silently, with no error surfaced to anyone, and
      // no cron rescans denied Stripe bookings the way the Solana reconciler
      // now does for its own rail. Same shape as the settleSolanaBeam bug
      // fixed earlier this session.
      //
      // Stripe's own state is authoritative — a thrown error here doesn't
      // necessarily mean the cancel/refund didn't happen (e.g. the response
      // was lost after Stripe already processed it, or this raced
      // stripe-janitor / the webhook doing the same thing concurrently).
      // Re-check before concluding it's a real failure, mirroring this
      // session's "verify on-chain state, don't trust the thrown error"
      // pattern for the Solana rail.
      const message = err instanceof Error ? err.message : String(err);
      let resolved = false;
      try {
        const fresh = await stripe.paymentIntents.retrieve(booking.payment_intent_id, undefined, opts);
        if (fresh.status === 'canceled') {
          resolved = true;
        } else if (fresh.status === 'succeeded') {
          const refunds = await stripe.refunds.list({ payment_intent: booking.payment_intent_id }, opts);
          resolved = refunds.data.some(r => r.status === 'succeeded' || r.status === 'pending');
        }
      } catch (verifyErr) {
        console.error('[stripe/cancel] verify-after-failure probe also failed:', verifyErr);
      }
      if (!resolved) {
        console.error('[stripe/cancel] stripe call failed and no cancel/refund landed:', message);
        return NextResponse.json(
          { error: 'Could not cancel/refund on Stripe — please try again' },
          { status: 502 },
        );
      }
    }
  }

  await supabase
    .from('bookings')
    .update({ status: 'denied' })
    .eq('id', booking_id);

  return NextResponse.json({ success: true });
}
