export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const body = await req.text();
  const sig  = req.headers.get('stripe-signature');

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('[stripe webhook] STRIPE_WEBHOOK_SECRET is not set — rejecting request');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }
  if (!sig) {
    console.error('[stripe webhook] Missing stripe-signature header');
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error('[stripe webhook] Signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  console.log('Webhook event received:', event.type);

  if (event.type === 'checkout.session.completed') {
    const thinSession = event.data.object as any;
    const sessionId = thinSession.id;

    // Fetch full session from Stripe to get metadata (handles Thin payload style)
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const booking_id = session.metadata?.booking_id;
    const payment_intent_id = session.payment_intent as string;

    console.log('Checkout completed — booking_id:', booking_id, 'pi:', payment_intent_id);

    if (booking_id && payment_intent_id) {
      const { error } = await supabase
        .from('bookings')
        .update({ payment_intent_id })
        .eq('id', booking_id);

      if (error) {
        console.error('Supabase update failed:', error);
      } else {
        console.log('payment_intent_id saved to booking', booking_id);
      }
    }

    // Flash checkout completion — store payment_intent_id so streamer can capture
    const flash_id = session.metadata?.flash_id;
    if (flash_id && payment_intent_id) {
      const { error: flashErr } = await supabase
        .from('flashes')
        .update({ payment_intent_id })
        .eq('id', flash_id);
      if (flashErr) {
        console.error('[webhook] Flash payment_intent update failed:', flashErr);
      } else {
        console.log('payment_intent_id saved to flash', flash_id);
      }
    }

    if (!booking_id && !flash_id) {
      console.error('Missing booking_id or flash_id in session metadata', session.metadata);
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    console.error('PaymentIntent failed:', event.data.object.id);
  }

  return NextResponse.json({ received: true });
}
