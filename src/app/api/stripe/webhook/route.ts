import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  // If no webhook secret set, just parse directly (dev fallback)
  let event: any;
  if (!process.env.STRIPE_WEBHOOK_SECRET || !sig) {
    event = JSON.parse(body);
  } else {
    try {
      event = stripe.webhooks.constructEvent(
        body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err: any) {
      console.error('Webhook signature failed:', err.message);
      return NextResponse.json({ error: 'Webhook signature failed' }, { status: 400 });
    }
  }

  console.log('Webhook event received:', event.type);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const booking_id = session.metadata?.booking_id;
    const payment_intent_id = session.payment_intent;

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
    } else {
      console.error('Missing booking_id or payment_intent_id in session metadata');
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    console.error('PaymentIntent failed:', event.data.object.id);
  }

  return NextResponse.json({ received: true });
}

export const config = {
  api: { bodyParser: false },
};
