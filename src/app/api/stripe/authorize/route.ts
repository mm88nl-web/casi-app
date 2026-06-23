import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';
import { calcAmountCents } from '@/lib/payment-math';
import { inMemoryRateLimit, clientIpFrom } from '@/lib/rate-limit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  // This route is unauthenticated and creates a Stripe Checkout Session on the
  // streamer's connected account, so unbounded calls = Checkout-object spam.
  // Speed-bump per IP (per-instance; the real gate on booking creation is the
  // per-IP cooldown in /api/bookings/create-stripe).
  if (!inMemoryRateLimit('stripe-authorize', clientIpFrom(req), 30, 60_000)) {
    return NextResponse.json({ error: 'Too many requests — slow down' }, { status: 429 });
  }

  const { booking_id } = await req.json();

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, profile_id, element_id, duration_minutes, status')
    .eq('id', booking_id)
    .single();

  if (!booking || bookingError) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }
  if (booking.status !== 'pending') {
    return NextResponse.json({ error: 'Booking is no longer pending', status: booking.status }, { status: 409 });
  }

  // Price is re-read from the element, NEVER from the booking row — viewers
  // can write any price_value/price_unit on insert via RLS, so trusting the
  // booking row is an amount-tampering vulnerability. See payment-math.ts.
  const { data: element } = await supabase
    .from('overlay_elements')
    .select('price_value, price_unit, max_duration_minutes')
    .eq('id', booking.element_id)
    .single();

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_account_id, username')
    .eq('id', booking.profile_id)
    .single();

  if (!element || !profile?.stripe_account_id) {
    return NextResponse.json({ error: 'Missing element or Stripe-connected streamer' }, { status: 400 });
  }

  // Clamp duration to the slot's configured max so a viewer can't
  // request a 9999-minute booking against a 60-minute slot.
  const durationMinutes = Math.min(
    Number(booking.duration_minutes) || 0,
    Number(element.max_duration_minutes) || Number(booking.duration_minutes) || 0,
  );
  if (durationMinutes <= 0) {
    return NextResponse.json({ error: 'Invalid duration' }, { status: 400 });
  }

  // Charge in the streamer's Stripe Connect default currency, not USD.
  // A Dutch streamer with an EUR Connect account that we charge in USD
  // loses ~2-3% to FX on every booking; same shape for any non-USD
  // account. Pulling default_currency at authorize time means the PI
  // settles 1:1 into their account.
  const account = await stripe.accounts.retrieve(profile.stripe_account_id);
  const currency = (account.default_currency || 'usd').toLowerCase();

  // Mirror onto profiles.settlement_currency so viewer-facing surfaces
  // can read it without their own Stripe round-trip. Fire-and-forget;
  // a failure here must not block authorize.
  void supabase
    .from('profiles')
    .update({ settlement_currency: currency })
    .eq('id', booking.profile_id);

  const amount = calcAmountCents(element.price_value, element.price_unit, durationMinutes, currency);
  if (amount <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  // Direct Charge: money goes straight to the streamer's Stripe balance on
  // their connected account. We take no application_fee_amount — revenue
  // comes from the SaaS subscription tier, not per-transaction fees, which
  // keeps us out of MSB/PSP territory. See AGENTS.md.
  //
  // payment_method_types: ['card'] is required when capture_method is 'manual'.
  // Without it, Stripe defaults to automatic_payment_methods which does not
  // support manual capture and throws a 400 ("The Checkout Session's
  // payment_intent_data.capture_method may only be manual when
  // payment_method_types is also set").
  let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
  try {
    session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        payment_intent_data: {
          capture_method: 'manual',
        },
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                name: `Beam slot — ${element.price_value}/${element.price_unit}`,
                description: `${durationMinutes} min on ${profile.username}'s stream`,
              },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        success_url: `${appUrl}/overlay?s=${profile.username}&payment=success&booking_id=${booking_id}`,
        cancel_url: `${appUrl}/overlay?s=${profile.username}&payment=cancelled&booking_id=${booking_id}`,
        metadata: { booking_id },
      },
      { stripeAccount: profile.stripe_account_id },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[stripe/authorize] checkout.sessions.create failed:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Persist the authorized amount for later proration. cancel_token is NOT
  // written or returned here: it's minted once in /api/bookings/create-stripe
  // and handed to the viewer at booking-creation time. Because this route is
  // unauthenticated, echoing the token back to anyone who supplies a
  // (sequential, guessable) booking_id would disclose the per-booking
  // capability that gates /api/bookings/viewer-deny, /attach-solana-tx, and
  // /api/stripe/cancel — letting an attacker enumerate ids and cancel/deny or
  // corrupt arbitrary bookings. The legitimate viewer already holds the token.
  const { error: amountErr } = await supabase
    .from('bookings')
    .update({ original_amount_cents: amount })
    .eq('id', booking_id);
  if (amountErr) {
    return NextResponse.json({ error: 'Failed to persist booking amount' }, { status: 500 });
  }

  return NextResponse.json({ checkout_url: session.url });
}
