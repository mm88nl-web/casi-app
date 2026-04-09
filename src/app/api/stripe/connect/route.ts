import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const { user_id } = await req.json();

  // Check if streamer already has a Stripe account
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_account_id, username')
    .eq('id', user_id)
    .single();

  let accountId = profile?.stripe_account_id;

  if (!accountId) {
    // Create new Express account
    const account = await stripe.accounts.create({
      type: 'express',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });
    accountId = account.id;

    await supabase
      .from('profiles')
      .update({ stripe_account_id: accountId })
      .eq('id', user_id);
  }

  // Create onboarding link
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/profile/edit?stripe=refresh`,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/profile/edit?stripe=success`,
    type: 'account_onboarding',
  });

  return NextResponse.json({ url: accountLink.url });
}
