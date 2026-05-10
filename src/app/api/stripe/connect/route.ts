import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  // ── Auth: derive user identity from session token, never from request body ─
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ─────────────────────────────────────────────────────────────────────────

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_account_id, username')
    .eq('id', user.id)
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
      .eq('id', user.id);
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
