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
    .select('payment_intent_id, status')
    .eq('id', booking_id)
    .single();

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  if (booking.payment_intent_id) {
    const pi = await stripe.paymentIntents.retrieve(booking.payment_intent_id);

    if (pi.status === 'requires_capture') {
      // Authorized but not captured — void it
      await stripe.paymentIntents.cancel(booking.payment_intent_id);
    } else if (pi.status === 'succeeded') {
      // Already captured (end-early ran) — full refund
      await stripe.refunds.create({ payment_intent: booking.payment_intent_id });
    }
    // if already canceled, do nothing
  }

  await supabase
    .from('bookings')
    .update({ status: 'denied' })
    .eq('id', booking_id);

  return NextResponse.json({ success: true });
}
