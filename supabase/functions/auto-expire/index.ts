// supabase/functions/auto-expire/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
});

Deno.serve(async () => {
  const now = new Date().toISOString();

  // 1. Find all expired active bookings
  const { data: expired } = await supabase
    .from('bookings')
    .select('*')
    .eq('status', 'active')
    .not('started_at', 'is', null)
    .lt(
      'started_at',
      new Date(Date.now() - 0).toISOString() // checked via duration below
    );

  for (const booking of expired ?? []) {
    const expireAt = new Date(
      new Date(booking.started_at).getTime() + booking.duration_minutes * 60 * 1000
    );

    if (new Date() < expireAt) continue; // not expired yet

    // Proration capture
    if (booking.payment_intent_id && booking.original_amount_cents) {
      const actualMinutes =
        (Date.now() - new Date(booking.started_at).getTime()) / 60000;
      const ratio = Math.min(actualMinutes / booking.duration_minutes, 1);
      const captureAmount = Math.max(Math.round(booking.original_amount_cents * ratio), 50);
      const platformFee = Math.round(captureAmount * 0.05);

      try {
        await stripe.paymentIntents.capture(booking.payment_intent_id, {
          amount_to_capture: captureAmount,
          application_fee_amount: platformFee,
        });
      } catch (e) {
        console.error('Capture failed for', booking.id, e);
      }
    }

    await supabase
      .from('bookings')
      .update({ status: 'expired' })
      .eq('id', booking.id);
  }

  // 2. Auto-advance approved_queued → active
  const { data: queued } = await supabase
    .from('bookings')
    .select('*')
    .eq('status', 'approved_queued')
    .order('queue_position', { ascending: true });

  for (const booking of queued ?? []) {
    // Check no other booking is currently active for this element
    const { data: active } = await supabase
      .from('bookings')
      .select('id')
      .eq('element_id', booking.element_id)
      .eq('status', 'active')
      .maybeSingle();

    if (!active) {
      await supabase
        .from('bookings')
        .update({ status: 'active', started_at: now })
        .eq('id', booking.id);
    }
  }

  return new Response('ok', { status: 200 });
});
