import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const { profile_id, viewer_name, message, amount_cents, payment_method } = await req.json();

  if (!profile_id || !viewer_name || !message || !amount_cents) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (amount_cents < 100) {
    return NextResponse.json({ error: 'Minimum flash amount is €1.00' }, { status: 400 });
  }
  if (message.trim().length === 0) {
    return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_account_id, username, solana_wallet')
    .eq('id', profile_id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Streamer not found' }, { status: 404 });
  }

  const method = payment_method || 'stripe';

  // Insert flash record first
  const { data: flash, error: flashError } = await supabase
    .from('flashes')
    .insert({
      profile_id,
      viewer_name,
      message: message.trim(),
      amount_cents,
      currency: 'eur',
      status: 'pending',
      payment_method: method,
    })
    .select()
    .single();

  if (flashError || !flash) {
    console.error('[flashes/create] Insert failed:', flashError);
    return NextResponse.json({ error: 'Failed to create flash' }, { status: 500 });
  }

  // Solana: return flash_id so the client creates the Streamflow stream
  if (method === 'solana') {
    return NextResponse.json({
      flash_id: flash.id,
      solana_wallet: profile.solana_wallet ?? null,
    });
  }

  // Stripe: create Checkout session with manual capture
  if (!profile.stripe_account_id) {
    // Clean up the orphaned flash row
    await supabase.from('flashes').delete().eq('id', flash.id);
    return NextResponse.json({ error: 'Streamer has no Stripe account connected' }, { status: 400 });
  }

  const platformFee = Math.round(amount_cents * 0.05);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const truncatedMsg = message.trim().length > 100
    ? message.trim().slice(0, 97) + '…'
    : message.trim();

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_intent_data: {
      capture_method: 'manual',
      application_fee_amount: platformFee,
      transfer_data: { destination: profile.stripe_account_id },
    },
    line_items: [
      {
        price_data: {
          currency: 'eur',
          product_data: {
            name: `⚡ Flash to @${profile.username}`,
            description: truncatedMsg,
          },
          unit_amount: amount_cents,
        },
        quantity: 1,
      },
    ],
    success_url: `${appUrl}/overlay?s=${profile.username}&flash_success=1&flash_id=${flash.id}`,
    cancel_url:  `${appUrl}/overlay?s=${profile.username}&flash_cancelled=1&flash_id=${flash.id}`,
    metadata: { flash_id: flash.id },
  });

  return NextResponse.json({ checkout_url: session.url, flash_id: flash.id });
}
