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

  if (!booking?.payment_intent_id) {
    return NextResponse.json({ error: 'No payment intent found' }, { status: 404 });
  }

  // Only cancel if not yet active (no proration needed)
  if (booking.status === 'pending' || booking.status === 'approved_queued') {
    await stripe.paymentIntents.cancel(booking.payment_intent_id);
  }

  await supabase
    .from('bookings')
    .update({ status: 'denied' })
    .eq('id', booking_id);

  return NextResponse.json({ success: true });
}
