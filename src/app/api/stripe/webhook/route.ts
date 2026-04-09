import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return NextResponse.json({ error: 'Webhook signature failed' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;
    const booking_id = session.metadata?.booking_id;
    const payment_intent_id = session.payment_intent;

    if (booking_id && payment_intent_id) {
      await supabase
        .from('bookings')
        .update({ payment_intent_id })
        .eq('id', booking_id);
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    console.error('PaymentIntent failed:', event.data.object);
  }

  return NextResponse.json({ received: true });
}
