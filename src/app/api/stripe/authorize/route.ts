import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { stripe } from '@/lib/stripe';
import { calcAmountCents } from '@/lib/payment-math';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const { booking_id } = await req.json();

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, profile_id, element_id, duration_minutes, status')
    .eq('id', booking_id)
    .single();

  if (!booking || bookingError) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
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

  const amount = calcAmountCents(element.price_value, element.price_unit, durationMinutes, currency);
  if (amount <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  // Direct Charge: money goes straight to the streamer's Stripe balance on
  // their connected account. We take no application_fee_amount — revenue
  // comes from the SaaS subscription tier, not per-transaction fees, which
  // keeps us out of MSB/PSP territory. See AGENTS.md.
  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
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

  // cancel_token: random secret returned once to the viewer. /api/stripe/cancel
  // requires this token to match on the viewer branch so viewer_name (which is
  // publicly readable via bookings_select_public) can no longer authorize
  // cancellation of arbitrary bookings. Only set if not already present so a
  // retry of authorize on the same booking doesn't rotate the token out from
  // under the viewer who stored the original.
  const cancelToken = randomUUID();
  const { data: updated } = await supabase
    .from('bookings')
    .update({ original_amount_cents: amount, cancel_token: cancelToken })
    .eq('id', booking_id)
    .is('cancel_token', null)
    .select('cancel_token')
    .maybeSingle();

  // If the row already had a token (authorize retried), re-read it so we
  // return the existing one rather than nothing.
  let finalToken = updated?.cancel_token ?? cancelToken;
  if (!updated) {
    const { data: existing } = await supabase
      .from('bookings')
      .select('cancel_token')
      .eq('id', booking_id)
      .single();
    if (existing?.cancel_token) finalToken = existing.cancel_token;
  }

  return NextResponse.json({ checkout_url: session.url, cancel_token: finalToken });
}
