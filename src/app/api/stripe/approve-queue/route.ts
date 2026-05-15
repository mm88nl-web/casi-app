import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';
import { calcAmountCents } from '@/lib/payment-math';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  // ── Auth: only the streamer who owns the profile can approve queued bookings ──
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ─────────────────────────────────────────────────────────────────────────────

  const { booking_id } = await req.json();

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, profile_id, element_id, duration_minutes, viewer_name')
    .eq('id', booking_id)
    .single();

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }
  if (booking.profile_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Price is always re-read from the element (see authorize/route.ts for
  // the rationale — booking rows are viewer-writable via RLS).
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

  const durationMinutes = Math.min(
    Number(booking.duration_minutes) || 0,
    Number(element.max_duration_minutes) || Number(booking.duration_minutes) || 0,
  );
  if (durationMinutes <= 0) {
    return NextResponse.json({ error: 'Invalid duration' }, { status: 400 });
  }

  // Charge in the streamer's Stripe Connect default currency. See
  // authorize/route.ts for the rationale — same fix here so a queue-spot
  // top-up matches the original booking's currency.
  const account = await stripe.accounts.retrieve(profile.stripe_account_id);
  const currency = (account.default_currency || 'usd').toLowerCase();

  // Mirror onto profiles.settlement_currency so viewer-facing surfaces
  // can read it without their own Stripe round-trip.
  void supabase
    .from('profiles')
    .update({ settlement_currency: currency })
    .eq('id', booking.profile_id);

  const amount = calcAmountCents(element.price_value, element.price_unit, durationMinutes, currency);
  if (amount <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  // Direct Charge on the streamer's connected account — no platform fee.
  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      payment_intent_data: {
        capture_method: 'manual',
      },
      line_items: [{
        price_data: {
          currency,
          product_data: {
            name: `Queue slot — ${element.price_value}/${element.price_unit}`,
            description: `${durationMinutes} min on ${profile.username}'s stream`,
          },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      success_url: `${appUrl}/overlay?s=${profile.username}&payment=success&booking_id=${booking_id}`,
      cancel_url: `${appUrl}/overlay?s=${profile.username}&payment=cancelled&booking_id=${booking_id}`,
      metadata: { booking_id },
    },
    { stripeAccount: profile.stripe_account_id },
  );

  await supabase
    .from('bookings')
    .update({ original_amount_cents: amount })
    .eq('id', booking_id);

  return NextResponse.json({ checkout_url: session.url });
}
