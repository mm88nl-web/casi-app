import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  // Must be called with a valid streamer session token
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { flash_id, action } = await req.json();
  if (!flash_id || !['approve', 'deny'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { data: flash } = await supabase
    .from('flashes')
    .select('*')
    .eq('id', flash_id)
    .single();

  if (!flash) {
    return NextResponse.json({ error: 'Flash not found' }, { status: 404 });
  }
  if (flash.profile_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (flash.status !== 'pending') {
    return NextResponse.json({ error: `Flash already ${flash.status}` }, { status: 409 });
  }

  if (action === 'approve') {
    // Capture the Stripe PaymentIntent
    if (flash.payment_method === 'stripe' && flash.payment_intent_id) {
      try {
        const pi = await stripe.paymentIntents.retrieve(flash.payment_intent_id);
        if (pi.status === 'requires_capture') {
          await stripe.paymentIntents.capture(flash.payment_intent_id);
        }
      } catch (err: any) {
        console.error('[flashes/moderate] Stripe capture failed:', err.message);
        return NextResponse.json({ error: 'Payment capture failed' }, { status: 500 });
      }
    }
    // Solana: funds are already streaming via Streamflow — no action needed
    await supabase.from('flashes').update({ status: 'approved' }).eq('id', flash_id);
    return NextResponse.json({ success: true });
  }

  // action === 'deny'
  if (flash.payment_method === 'stripe' && flash.payment_intent_id) {
    try {
      const pi = await stripe.paymentIntents.retrieve(flash.payment_intent_id);
      if (pi.status === 'requires_capture') {
        await stripe.paymentIntents.cancel(flash.payment_intent_id);
      } else if (pi.status === 'succeeded') {
        await stripe.refunds.create({ payment_intent: flash.payment_intent_id });
      }
      // if already canceled, nothing to do
    } catch (err: any) {
      console.error('[flashes/moderate] Stripe cancel/refund failed:', err.message);
      // Still mark denied so it's off the queue
    }
  }
  // Solana: just mark denied — viewer-side Streamflow cancellation returns unvested USDC
  await supabase.from('flashes').update({ status: 'denied' }).eq('id', flash_id);
  return NextResponse.json({ success: true });
}
