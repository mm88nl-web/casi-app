import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';
import { logError } from '@/lib/observability';

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

  // Defensive: refuse to call accountLinks.create with a placeholder URL.
  // Without NEXT_PUBLIC_APP_URL set, refresh_url becomes "undefined/profile/..."
  // and Stripe returns "url_invalid" with no actionable detail in the UI.
  // Fail fast with a clear message instead so the streamer / operator knows
  // exactly which env var to set.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl || !/^https?:\/\//.test(appUrl)) {
    logError('stripe-connect', new Error('NEXT_PUBLIC_APP_URL missing or invalid'), {
      user: user.id,
      appUrl: appUrl ?? '(unset)',
    });
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_APP_URL is not configured on the server. Add it in Vercel → Project → Settings → Environment Variables → Production.' },
      { status: 500 },
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_account_id, username')
    .eq('id', user.id)
    .single();

  let accountId = profile?.stripe_account_id;

  // Wrap the two Stripe calls in a single try/catch so the actual Stripe
  // error message ('platform not activated', 'url_invalid', 'account_invalid',
  // etc.) reaches the streamer instead of an opaque 500. Stripe errors carry
  // a `message` and a `code` — we surface both.
  try {
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
      refresh_url: `${appUrl}/profile/edit?stripe=refresh`,
      return_url: `${appUrl}/profile/edit?stripe=success`,
      type: 'account_onboarding',
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (err) {
    // Stripe SDK errors include `.message`, `.code`, `.type`, `.statusCode`.
    // Surface the message in the response body so the toast in PayoutsSection
    // shows something useful. Self-heal one common case below.
    const stripeErr = err as { message?: string; code?: string; type?: string; statusCode?: number };
    const message = stripeErr?.message || 'Stripe API error';
    const code    = stripeErr?.code;

    logError('stripe-connect', err, {
      user: user.id,
      accountId,
      stripeCode: code,
      stripeType: stripeErr?.type,
    });

    // Self-heal the test→live mismatch: if the stored account_id was created
    // in test mode and we're now in live mode (or vice-versa), Stripe returns
    // 'account_invalid' or 'resource_missing'. Clear the stale id so the next
    // click re-runs as a fresh create.
    if (
      accountId &&
      profile?.stripe_account_id === accountId &&
      (code === 'account_invalid' || code === 'resource_missing')
    ) {
      await supabase
        .from('profiles')
        .update({ stripe_account_id: null, settlement_currency: null })
        .eq('id', user.id);
      return NextResponse.json(
        { error: 'Saved Stripe account belongs to a different mode (test vs live). Cleared — click Connect again to create a fresh one.' },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: message, code },
      { status: stripeErr?.statusCode ?? 500 },
    );
  }
}
