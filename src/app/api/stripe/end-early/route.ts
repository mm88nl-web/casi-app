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

  // Calculate prorated capture
  if (booking.payment_intent_id && booking.original_amount_cents && booking.started_at) {
    const startedAt = new Date(booking.started_at).getTime();
    const now = Date.now();
    const actualMinutes = Math.max(1, (now - startedAt) / 1000 / 60);
    const captureAmount = Math.min(
      Math.round((actualMinutes / booking.duration_minutes) * booking.original_amount_cents),
      booking.original_amount_cents
    );

    try {
      await stripe.paymentIntents.capture(booking.payment_intent_id, {
        amount_to_capture: captureAmount,
      });
      console.log('End early capture:', captureAmount, 'of', booking.original_amount_cents);
    } catch (err: any) {
      console.error('Stripe capture failed:', err.message);
    }
  }

  // Set expired
  await supabase
    .from('bookings')
    .update({ status: 'expired' })
    .eq('id', booking.id);

  // Auto-start next in queue
  if (booking.element_id) {
    const { data: next } = await supabase
      .from('bookings')
      .select('*')
      .eq('element_id', booking.element_id)
      .eq('status', 'approved_queued')
      .order('approved_at', { ascending: true })
      .limit(1)
      .single();

    if (next) {
      await supabase
        .from('bookings')
        .update({ status: 'active', started_at: new Date().toISOString() })
        .eq('id', next.id);
      await supabase
        .from('overlay_elements')
        .update({ image_url: next.image_url })
        .eq('id', next.element_id);
    } else {
      await supabase
        .from('overlay_elements')
        .update({ image_url: '' })
        .eq('id', booking.element_id);
    }
  }

  return NextResponse.json({ success: true });
}
