import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';
import { logError } from '@/lib/observability';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Read-only Stripe Connect status for the streamer's Express account.
 *
 * `/api/stripe/connect` (POST) is the WRITER — creates the account if it
 * doesn't exist and returns an onboarding link. This route never writes; it
 * just retrieves the account from Stripe and reports back what the streamer
 * still needs to do.
 *
 * Status shape:
 *   not_connected — no stripe_account_id on profile
 *   pending       — account exists, requirements outstanding (Stripe will
 *                   refuse charges or payouts until they're completed)
 *   active        — charges_enabled AND payouts_enabled both true
 *   restricted    — account exists but Stripe disabled it (e.g. compliance
 *                   review). Same UX as pending — surface "Manage" so the
 *                   streamer can see Stripe's requirements list.
 */
export async function GET(req: Request) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_account_id')
    .eq('id', user.id)
    .single();

  const accountId = profile?.stripe_account_id ?? null;
  if (!accountId) {
    return NextResponse.json({ status: 'not_connected' as const });
  }

  try {
    const account = await stripe.accounts.retrieve(accountId);
    const chargesEnabled = !!account.charges_enabled;
    const payoutsEnabled = !!account.payouts_enabled;
    // `disabled_reason` is set when Stripe blocks the account outright;
    // currently_due / past_due reflect what the streamer still needs to fill.
    const requirements = account.requirements;
    const disabled = !!requirements?.disabled_reason;
    const dueCount =
      (requirements?.currently_due?.length ?? 0) +
      (requirements?.past_due?.length ?? 0);

    const status = disabled
      ? ('restricted' as const)
      : chargesEnabled && payoutsEnabled
      ? ('active' as const)
      : ('pending' as const);

    return NextResponse.json({
      status,
      accountId,
      chargesEnabled,
      payoutsEnabled,
      dueCount,
      defaultCurrency: account.default_currency ?? null,
    });
  } catch (err) {
    logError('stripe-connect-status', err, { user: user.id });
    // Soft-degrade: surface as "pending" so the UI shows a Manage button
    // rather than a hard error. The streamer can still onboard.
    return NextResponse.json({
      status: 'pending' as const,
      accountId,
      chargesEnabled: false,
      payoutsEnabled: false,
      dueCount: 0,
      defaultCurrency: null,
    });
  }
}
