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
    .select('*')
    .eq('id', booking_id)
    .single();

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const { data: element } = await supabase
    .from('overlay_elements')
    .select('price_value, price_unit')
    .eq('id', booking.element_id)
    .single();

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_account_id, username')
    .eq('id', booking.profile_id)
    .single();

  if (!element || !profile?.stripe_account_id) {
    return NextResponse.json({ error: 'Missing element or profile' }, { status: 400 });
  }

  const amount = booking.price_unit === 'min'
    ? Math.round(booking.price_value * booking.duration_minutes * 100)
    : Math.round((booking.price_value / 60) * booking.duration_minutes * 100);

  const platformFee = Math.round(amount * 0.05);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_intent_data: {
      capture_method: 'manual',
      application_fee_amount: platformFee,
      transfer_data: { destination: profile.stripe_account_id },
    },
    line_items: [{
      price_data: {
        currency: 'eur',
        product_data: {
          name: `Queue slot — €${booking.price_value}/${booking.price_unit}`,
          description: `${booking.duration_minutes} min on ${profile.username}'s stream`,
        },
        unit_amount: amount,
      },
      quantity: 1,
    }],
    success_url: `${appUrl}/overlay?s=${profile.username}&payment=success&booking_id=${booking_id}`,
    cancel_url: `${appUrl}/overlay?s=${profile.username}&payment=cancelled&booking_id=${booking_id}`,
    metadata: { booking_id },
  });

  await supabase
    .from('bookings')
    .update({ original_amount_cents: amount })
    .eq('id', booking_id);

  return NextResponse.json({ checkout_url: session.url });
}
