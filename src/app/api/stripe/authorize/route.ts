import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const { booking_id } = await req.json();

  const { data: booking } = await supabase
    .from('bookings')
    .select(`
      *,
      overlay_elements ( price_value, price_unit ),
      profiles ( stripe_account_id, username )
    `)
    .eq('id', booking_id)
    .single();

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const { price_value, price_unit } = booking.overlay_elements;
  const { stripe_account_id, username } = booking.profiles;

  if (!stripe_account_id) {
    return NextResponse.json({ error: 'Streamer has no Stripe account' }, { status: 400 });
  }

  const amount =
    price_unit === 'min'
      ? Math.round(price_value * booking.duration_minutes * 100)
      : Math.round(price_value * 100);

  const platformFee = Math.round(amount * 0.05);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_intent_data: {
      capture_method: 'manual',
      application_fee_amount: platformFee,
      transfer_data: { destination: stripe_account_id },
    },
    line_items: [
      {
        price_data: {
          currency: 'eur',
          product_data: {
            name: `Beam slot — ${price_value}/${price_unit}`,
            description: `${booking.duration_minutes} min on ${username}'s stream`,
          },
          unit_amount: amount,
        },
        quantity: 1,
      },
    ],
    success_url: `${appUrl}/overlay?s=${username}&payment=success&booking_id=${booking_id}`,
    cancel_url: `${appUrl}/overlay?s=${username}&payment=cancelled&booking_id=${booking_id}`,
    metadata: { booking_id },
  });

  // Store payment intent id (available after checkout completes via webhook)
  await supabase
    .from('bookings')
    .update({ original_amount_cents: amount })
    .eq('id', booking_id);

  return NextResponse.json({ checkout_url: session.url });
}
