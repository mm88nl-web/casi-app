export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';
import { logError, logWarn } from '@/lib/observability';
import { notifyBeam, notifyFlash, formatStripeAmount, shouldNotify } from '@/lib/notify';
import type Stripe from 'stripe';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const body = await req.text();
  const sig  = req.headers.get('stripe-signature');

  // Stripe Connect requires two webhook endpoints for full event coverage:
  //   - Connected accounts scope (payment_intent / charge / checkout events)
  //   - Your account scope       (account.updated / .deauthorized — platform-level)
  // Both endpoints can point at this same route, but each Stripe webhook
  // gets its own signing secret. Try the primary first, fall back to the
  // platform secret if it's set. Either one passing means the event is
  // authentic; we don't care which webhook delivered it.
  const primarySecret  = process.env.STRIPE_WEBHOOK_SECRET;
  const platformSecret = process.env.STRIPE_WEBHOOK_SECRET_PLATFORM;
  if (!primarySecret && !platformSecret) {
    console.error('[stripe webhook] Neither STRIPE_WEBHOOK_SECRET nor STRIPE_WEBHOOK_SECRET_PLATFORM is set — rejecting request');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }
  if (!sig) {
    console.error('[stripe webhook] Missing stripe-signature header');
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event | null = null;
  let lastErr: unknown = null;
  for (const secret of [primarySecret, platformSecret]) {
    if (!secret) continue;
    try {
      event = stripe.webhooks.constructEvent(body, sig, secret);
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (!event) {
    console.error('[stripe webhook] Signature verification failed for all configured secrets:', lastErr instanceof Error ? lastErr.message : lastErr);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // ── Idempotent dedup ─────────────────────────────────────────────────────
  // Stripe retries on timeout / 5xx. Record the event id first; if the
  // insert is a no-op (ignoreDuplicates on conflict) we've already handled
  // this delivery and can return 200 without re-running the handler.
  const { data: inserted, error: dedupErr } = await supabase
    .from('stripe_webhook_events')
    .upsert(
      { event_id: event.id, type: event.type },
      { onConflict: 'event_id', ignoreDuplicates: true },
    )
    .select('event_id')
    .maybeSingle();

  if (dedupErr) {
    // DB is misbehaving — don't swallow the event. 5xx forces Stripe to retry.
    logError('stripe/webhook/dedup', dedupErr, { event_id: event.id, type: event.type });
    return NextResponse.json({ error: 'dedup_failed' }, { status: 500 });
  }
  if (!inserted) {
    console.log('[stripe webhook] duplicate event skipped:', event.id, event.type);
    return NextResponse.json({ received: true, duplicate: true });
  }

  console.log('[stripe webhook] event:', event.type, event.id);

  if (event.type === 'checkout.session.completed') {
    const thinSession = event.data.object as Stripe.Checkout.Session;
    const sessionId = thinSession.id;

    // Under Direct Charges the session lives on the streamer's connected
    // account. Connect-mode webhook events carry `account` — pass it when
    // fetching the full session, otherwise Stripe 404s on the platform acct.
    const connectedAccount = (event as { account?: string }).account;
    const session = connectedAccount
      ? await stripe.checkout.sessions.retrieve(sessionId, undefined, { stripeAccount: connectedAccount })
      : await stripe.checkout.sessions.retrieve(sessionId);
    const booking_id = session.metadata?.booking_id;
    const payment_intent_id = session.payment_intent as string;

    // Critical linkage: attaching the PaymentIntent id is what later lets the
    // booking be approved + captured. If this write fails we must NOT report
    // success — the dedup row was already recorded, so a plain 200 here would
    // let Stripe's retry be skipped as a duplicate, stranding the booking with
    // no payment_intent_id (un-approvable forever). Roll back the dedup marker
    // and return 5xx so the retry re-runs the handler.
    if (booking_id && payment_intent_id) {
      const { error } = await supabase
        .from('bookings')
        .update({ payment_intent_id })
        .eq('id', booking_id);

      if (error) {
        logError('stripe/webhook', error, { event_id: event.id, booking_id, scope: 'booking_pi_attach' });
        await supabase.from('stripe_webhook_events').delete().eq('event_id', event.id);
        return NextResponse.json({ error: 'booking_update_failed' }, { status: 500 });
      }

      // Notify on new Stripe beam purchase. Awaited so the Lambda doesn't
      // get frozen before the Discord POST completes (void is killed on return).
      if (process.env.DISCORD_NOTIFY_WEBHOOK_URL) {
        try {
          const { data: bk } = await supabase
            .from('bookings')
            .select('profile_id, viewer_name, duration_minutes, message, element_id')
            .eq('id', booking_id)
            .maybeSingle();

          if (shouldNotify(bk?.profile_id)) {
            let elementLabel: string | null = null;
            let isBackdrop = false;
            if (bk?.element_id) {
              const { data: el } = await supabase
                .from('overlay_elements')
                .select('shape, is_background')
                .eq('id', bk.element_id)
                .maybeSingle();
              elementLabel = el?.shape ? el.shape.charAt(0).toUpperCase() + el.shape.slice(1) : null;
              isBackdrop = el?.is_background === true;
            }
            const priceDisplay =
              session.amount_total != null && session.currency
                ? formatStripeAmount(session.amount_total, session.currency)
                : null;
            await notifyBeam({
              event: 'purchased',
              is_backdrop: isBackdrop,
              viewer_name: bk?.viewer_name ?? null,
              element_label: elementLabel,
              price_display: priceDisplay,
              duration_minutes: bk?.duration_minutes != null ? Number(bk.duration_minutes) : null,
              message: bk?.message ?? null,
              payment_method: 'stripe',
              booking_id,
            });
          }
        } catch {
          // Swallow — notification is never load-bearing.
        }
      }
    }

    const flash_id = session.metadata?.flash_id;
    if (flash_id && payment_intent_id) {
      const { error: flashErr } = await supabase
        .from('flashes')
        .update({ payment_intent_id })
        .eq('id', flash_id);
      if (flashErr) {
        logError('stripe/webhook', flashErr, { event_id: event.id, flash_id, scope: 'flash_pi_attach' });
        await supabase.from('stripe_webhook_events').delete().eq('event_id', event.id);
        return NextResponse.json({ error: 'flash_update_failed' }, { status: 500 });
      }

      // Notify on new Stripe flash purchase (awaited — see beam notify comment above).
      if (process.env.DISCORD_NOTIFY_WEBHOOK_URL) {
        try {
          const { data: fl } = await supabase
            .from('flashes')
            .select('profile_id, viewer_name, message')
            .eq('id', flash_id)
            .maybeSingle();
          if (shouldNotify(fl?.profile_id)) {
            const amountDisplay =
              session.amount_total != null && session.currency
                ? formatStripeAmount(session.amount_total, session.currency)
                : null;
            await notifyFlash({
              viewer_name: fl?.viewer_name ?? null,
              message: fl?.message ?? null,
              amount_display: amountDisplay,
              payment_method: 'stripe',
              flash_id,
            });
          }
        } catch {
          // Swallow — notification is never load-bearing.
        }
      }
    }

    if (!booking_id && !flash_id) {
      console.error('[stripe webhook] Missing booking_id/flash_id in session metadata', session.metadata);
    }
  }

  // PI cancelled externally (Stripe dashboard, janitor, another process).
  // Flip any matching booking/flash row out of its live state so the UI
  // doesn't show a dead beam / stuck pending flash. We only transition
  // non-terminal statuses to avoid stomping a legitimate later lifecycle.
  if (event.type === 'payment_intent.canceled') {
    const pi = event.data.object as Stripe.PaymentIntent;
    await supabase
      .from('bookings')
      .update({ status: 'denied' })
      .eq('payment_intent_id', pi.id)
      .in('status', ['pending', 'active', 'approved_queued']);
    await supabase
      .from('flashes')
      .update({ status: 'denied' })
      .eq('payment_intent_id', pi.id)
      .eq('status', 'pending');
  }

  if (event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object as Stripe.PaymentIntent;
    logWarn('stripe/webhook', `PaymentIntent failed: ${pi.id}`, {
      last_payment_error: pi.last_payment_error?.message,
    });
  }

  // Post-capture refunds aren't initiated by the app today, so seeing one
  // means a streamer (or Stripe risk) refunded out-of-band. No status
  // column for it yet; surface via log drain so the on-call can reconcile.
  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    logWarn('stripe/webhook', `Charge refunded out-of-band: ${charge.id}`, {
      payment_intent: typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id,
      amount_refunded: charge.amount_refunded,
    });
  }

  // Chargebacks are customer-initiated and need human eyes. Fan this out
  // via ERROR_WEBHOOK_URL if configured so on-call gets pinged.
  if (event.type.startsWith('charge.dispute.')) {
    const dispute = event.data.object as Stripe.Dispute;
    logError('stripe/webhook/dispute', new Error(`Dispute ${event.type}: ${dispute.id}`), {
      amount: dispute.amount,
      reason: dispute.reason,
      status: dispute.status,
      charge: typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id,
    });
  }

  return NextResponse.json({ received: true });
}
