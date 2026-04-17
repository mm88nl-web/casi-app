import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';

// Vercel Cron calls this with Authorization: Bearer $CRON_SECRET
// Add to vercel.json:
//   "crons": [{ "path": "/api/cron/stripe-janitor", "schedule": "* * * * *" }]

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

  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Find active Stripe bookings whose timer has run out
  const { data: expired } = await supabase
    .from('bookings')
    .select('*')
    .eq('status', 'active')
    .not('payment_intent_id', 'is', null)
    .neq('payment_method', 'solana');

  if (!expired?.length) {
    return NextResponse.json({ captured: 0 });
  }

  const now = Date.now();
  const overdue = expired.filter((b: any) => {
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
            .update({ image_url: '' })
            .eq('id', booking.element_id);
        }
      }
    } catch (err: any) {
      console.error(`[stripe-janitor] booking ${booking.id} failed:`, err.message);
    }
  }

  console.log(`[stripe-janitor] processed ${overdue.length} overdue, captured ${captured}`);
  return NextResponse.json({ overdue: overdue.length, captured });
}
