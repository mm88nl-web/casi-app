import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { stripe } from '@/lib/stripe';
import { proRataCaptureCents } from '@/lib/payment-math';
import { stripeMinAmount } from '@/lib/currency';

// Vercel Cron calls this with Authorization: Bearer $CRON_SECRET.
// Runs once per day on Hobby (Hobby plans cap crons at daily). The normal
// end-of-beam capture path runs synchronously via /api/stripe/end-early, so
// this is just a safety net for abandoned bookings — 24h reconciliation is
// acceptable for that edge case. Upgrade to Pro + bump schedule if that
// lag becomes a problem.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[stripe-janitor] CRON_SECRET not set');
    return NextResponse.json({ error: 'Misconfigured' }, { status: 500 });
  }

  const auth = req.headers.get('authorization') ?? '';
  const expected = Buffer.from(`Bearer ${cronSecret}`);
  const actual   = Buffer.from(auth);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Find active Stripe bookings whose timer has run out
  const { data: expired } = await supabase
    .from('bookings')
    .select('*')
    .eq('status', 'active')
    .not('payment_intent_id', 'is', null)
    .neq('payment_method', 'solana');

  // No early return when this is empty: the sweeps below must still run.
  // (An every-minute pg_cron job, expire_stale_bookings, flips overdue rows
  // to 'expired' long before this daily run, so this list is usually empty.)
  const now = Date.now();
  const overdue = (expired ?? []).filter((b: any) => {
    if (!b.started_at || !b.duration_minutes) return false;
    const endsAt = new Date(b.started_at).getTime() + b.duration_minutes * 60 * 1000;
    return now >= endsAt;
  });

  // Look up connected-account ids in bulk so we can target Direct-Charges
  // PaymentIntents on each streamer's account.
  const profileIds = Array.from(new Set(overdue.map((b: { profile_id?: string }) => b.profile_id).filter(Boolean)));
  const stripeAccountByProfile = new Map<string, string>();
  if (profileIds.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, stripe_account_id')
      .in('id', profileIds);
    for (const p of profs || []) {
      if (p.stripe_account_id) stripeAccountByProfile.set(p.id, p.stripe_account_id);
    }
  }

  let captured = 0;
  for (const booking of overdue) {
    try {
      const stripeAccount = stripeAccountByProfile.get(booking.profile_id);
      // Capture the full amount (natural completion)
      if (booking.original_amount_cents && stripeAccount) {
        const opts = { stripeAccount };
        const pi = await stripe.paymentIntents.retrieve(booking.payment_intent_id, undefined, opts);
        if (pi.status === 'requires_capture') {
          await stripe.paymentIntents.capture(
            booking.payment_intent_id,
            { amount_to_capture: booking.original_amount_cents },
            opts,
          );
          captured++;
        }
      }

      // Storage cleanup
      if (booking.storage_path) {
        await supabase.storage.from('beams').remove([booking.storage_path]).catch((err: any) => {
          console.error('[stripe-janitor] storage delete failed:', err.message);
        });
      }

      // Mark expired and clear image
      await supabase
        .from('bookings')
        .update({ status: 'expired', image_url: null })
        .eq('id', booking.id);

      // Advance queue
      if (booking.element_id) {
        const { data: next } = await supabase
          .from('bookings')
          .select('*')
          .eq('element_id', booking.element_id)
          .eq('status', 'approved_queued')
          .order('approved_at', { ascending: true })
          .limit(1)
          .single();

        if (next) {
          await supabase
            .from('bookings')
            .update({ status: 'active', started_at: new Date().toISOString() })
            .eq('id', next.id);
          await supabase
            .from('overlay_elements')
            .update({ image_url: next.image_url })
            .eq('id', next.element_id);
        } else {
          await supabase
            .from('overlay_elements')
            .update({ image_url: null })
            .eq('id', booking.element_id);
        }
      }
    } catch (err: any) {
      console.error(`[stripe-janitor] booking ${booking.id} failed:`, err.message);
    }
  }

  // ── Expired-but-uncaptured sweep ────────────────────────────────────────
  // A Stripe beam that runs its full time is flipped to 'expired' by
  // expire_stale_bookings (pg_cron) or /api/bookings/expire-and-advance,
  // neither of which talks to Stripe. The loop above only sees rows still
  // 'active', so without this sweep the PaymentIntent sat in
  // requires_capture until the card authorization lapsed (~7 days) and the
  // streamer was never paid. Every path that settles a PI on purpose
  // (end-early, cancel, deny) leaves it captured or cancelled, so an expired
  // row whose PI is still requires_capture is one nobody collected.
  type UncapturedRow = {
    id: number; profile_id: string; payment_intent_id: string;
    original_amount_cents: number | null; started_at: string | null;
    ended_at: string | null; duration_minutes: number | string | null;
  };
  const CAPTURE_WINDOW_DAYS = 7;
  const captureCutoff = new Date(Date.now() - CAPTURE_WINDOW_DAYS * 86400 * 1000).toISOString();
  const { data: uncaptured } = await supabase
    .from('bookings')
    .select('id, profile_id, payment_intent_id, original_amount_cents, started_at, ended_at, duration_minutes')
    .eq('status', 'expired')
    .not('payment_intent_id', 'is', null)
    .neq('payment_method', 'solana')
    .gte('started_at', captureCutoff)
    .returns<UncapturedRow[]>();

  let lateCaptured = 0;
  let lateCancelled = 0;
  if (uncaptured?.length) {
    const lateProfileIds = Array.from(new Set(uncaptured.map((b) => b.profile_id).filter(Boolean)));
    const lateProfiles = new Map<string, { stripe_account_id: string | null; settlement_currency: string | null }>();
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, stripe_account_id, settlement_currency')
      .in('id', lateProfileIds);
    for (const p of profs || []) lateProfiles.set(p.id, p);

    for (const b of uncaptured) {
      try {
        const prof = lateProfiles.get(b.profile_id);
        if (!prof?.stripe_account_id || !b.original_amount_cents) continue;
        const opts = { stripeAccount: prof.stripe_account_id };
        const pi = await stripe.paymentIntents.retrieve(b.payment_intent_id, undefined, opts);
        if (pi.status !== 'requires_capture') continue;

        // ended_at is only set when the streamer cut the beam short; charge
        // for the time it actually aired, same rule as /api/stripe/end-early.
        const totalMinutes = Number(b.duration_minutes);
        const airedMinutes = b.ended_at && b.started_at
          ? (new Date(b.ended_at).getTime() - new Date(b.started_at).getTime()) / 60_000
          : totalMinutes;
        const amount = airedMinutes < totalMinutes
          ? proRataCaptureCents(b.original_amount_cents, totalMinutes, airedMinutes)
          : b.original_amount_cents;

        if (amount >= stripeMinAmount(prof.settlement_currency)) {
          await stripe.paymentIntents.capture(b.payment_intent_id, { amount_to_capture: amount }, opts);
          lateCaptured++;
        } else {
          await stripe.paymentIntents.cancel(b.payment_intent_id, undefined, opts);
          lateCancelled++;
        }
      } catch (err) {
        console.error(`[stripe-janitor] expired booking ${b.id} late capture failed:`, err instanceof Error ? err.message : err);
      }
    }
  }

  // ── Abandoned-pending sweep ─────────────────────────────────────────────
  // Stripe manual-capture PaymentIntents auto-expire at ~7 days. Before that
  // happens we void any pending booking older than PENDING_MAX_AGE_HOURS so
  // the viewer's card auth doesn't linger — and flip the row to denied so
  // their overlay doesn't keep showing a stale "⌛ Pending" chip forever.
  const PENDING_MAX_AGE_HOURS = 48;
  const cutoff = new Date(Date.now() - PENDING_MAX_AGE_HOURS * 3600 * 1000).toISOString();
  const { data: stale } = await supabase
    .from('bookings')
    .select('id, profile_id, payment_intent_id, storage_path')
    .eq('status', 'pending')
    .not('payment_intent_id', 'is', null)
    .neq('payment_method', 'solana')
    .lt('created_at', cutoff);

  let cancelled = 0;
  if (stale?.length) {
    // Reuse + extend the profile→stripe_account map so we can hit Direct
    // Charges on each connected account.
    const staleProfileIds = Array.from(new Set(stale.map((b: any) => b.profile_id).filter(Boolean)));
    const missing = staleProfileIds.filter(id => !stripeAccountByProfile.has(id));
    if (missing.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, stripe_account_id')
        .in('id', missing);
      for (const p of profs || []) {
        if (p.stripe_account_id) stripeAccountByProfile.set(p.id, p.stripe_account_id);
      }
    }

    for (const b of stale as any[]) {
      try {
        const stripeAccount = stripeAccountByProfile.get(b.profile_id);
        if (stripeAccount) {
          const opts = { stripeAccount };
          const pi = await stripe.paymentIntents.retrieve(b.payment_intent_id, undefined, opts);
          // Any non-terminal state is safe to cancel. Skip already-captured /
          // already-cancelled PIs — those would throw.
          if (pi.status === 'requires_capture' || pi.status === 'requires_payment_method' || pi.status === 'requires_confirmation' || pi.status === 'requires_action') {
            await stripe.paymentIntents.cancel(b.payment_intent_id, undefined, opts);
            cancelled++;
          }
        }
        if (b.storage_path) {
          await supabase.storage.from('beams').remove([b.storage_path]).catch((err: any) => {
            console.error('[stripe-janitor] storage delete failed:', err.message);
          });
        }
        await supabase
          .from('bookings')
          .update({ status: 'denied', image_url: null })
          .eq('id', b.id);
      } catch (err: any) {
        console.error(`[stripe-janitor] stale booking ${b.id} failed:`, err.message);
      }
    }
  }

  // ── Abandoned Stripe flashes ────────────────────────────────────────────
  // Flash PaymentIntents also sit in `requires_capture` until the streamer
  // moderates (approve captures; deny cancels). If a flash is ignored long
  // enough the PI will auto-void at Stripe's 7-day mark and the row will
  // linger as `pending` forever. Sweep them alongside bookings: void any
  // flash PI older than FLASH_PENDING_MAX_AGE_HOURS and flip the row to
  // `denied` so the feed stays clean.
  const FLASH_PENDING_MAX_AGE_HOURS = 48;
  const flashCutoff = new Date(Date.now() - FLASH_PENDING_MAX_AGE_HOURS * 3600 * 1000).toISOString();
  type StaleFlashRow = { id: string; profile_id: string; payment_intent_id: string };
  const { data: staleFlashes } = await supabase
    .from('flashes')
    .select('id, profile_id, payment_intent_id')
    .eq('status', 'pending')
    .eq('payment_method', 'stripe')
    .not('payment_intent_id', 'is', null)
    .lt('created_at', flashCutoff)
    .returns<StaleFlashRow[]>();

  let flashesCancelled = 0;
  if (staleFlashes?.length) {
    const flashProfileIds = Array.from(new Set(staleFlashes.map((f) => f.profile_id).filter(Boolean)));
    const missingF = flashProfileIds.filter(id => !stripeAccountByProfile.has(id));
    if (missingF.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, stripe_account_id')
        .in('id', missingF);
      for (const p of profs || []) {
        if (p.stripe_account_id) stripeAccountByProfile.set(p.id, p.stripe_account_id);
      }
    }

    for (const f of staleFlashes) {
      try {
        const stripeAccount = stripeAccountByProfile.get(f.profile_id);
        if (stripeAccount) {
          const opts = { stripeAccount };
          const pi = await stripe.paymentIntents.retrieve(f.payment_intent_id, undefined, opts);
          if (pi.status === 'requires_capture' || pi.status === 'requires_payment_method' || pi.status === 'requires_confirmation' || pi.status === 'requires_action') {
            await stripe.paymentIntents.cancel(f.payment_intent_id, undefined, opts);
            flashesCancelled++;
          }
        }
        await supabase
          .from('flashes')
          .update({ status: 'denied' })
          .eq('id', f.id);
      } catch (err) {
        console.error(`[stripe-janitor] stale flash ${f.id} failed:`, err instanceof Error ? err.message : err);
      }
    }
  }

  console.log(`[stripe-janitor] processed ${overdue.length} overdue, captured ${captured}; expired uncaptured ${uncaptured?.length ?? 0}, late-captured ${lateCaptured}, late-cancelled ${lateCancelled}; stale bookings ${stale?.length ?? 0}, cancelled ${cancelled}; stale flashes ${staleFlashes?.length ?? 0}, cancelled ${flashesCancelled}`);
  return NextResponse.json({
    overdue: overdue.length,
    captured,
    lateCaptured,
    lateCancelled,
    stale: stale?.length ?? 0,
    cancelled,
    staleFlashes: staleFlashes?.length ?? 0,
    flashesCancelled,
  });
}
