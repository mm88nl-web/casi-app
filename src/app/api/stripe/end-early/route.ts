import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';
import { proRataCaptureCents } from '@/lib/payment-math';
import { logError } from '@/lib/observability';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  // ── Auth: verify the caller is a logged-in streamer ──────────────────────
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ─────────────────────────────────────────────────────────────────────────

  const { booking_id } = await req.json();

  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', booking_id)
    .single();

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  // ── Ownership: caller must own the profile this booking belongs to ────────
  if (booking.profile_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Need the streamer's connected account id for Direct-Charges PI calls.
  const { data: bookingProfile } = await supabase
    .from('profiles')
    .select('stripe_account_id')
    .eq('id', booking.profile_id)
    .single();
  const stripeAccount = bookingProfile?.stripe_account_id;

  // Prorated capture. Only fire if the PI is still capturable — if something
  // else (janitor, dashboard, another end-early retry) already settled it we
  // treat the row as already-handled and proceed to expire. Any capture
  // failure on a capturable PI aborts with 502 so the caller keeps the beam
  // live on-chain and in the DB; silent failure here used to make beams
  // vanish while the streamer never got paid.
  if (booking.payment_intent_id && booking.original_amount_cents && booking.started_at && stripeAccount) {
    const opts = { stripeAccount };
    const elapsedMinutes = (Date.now() - new Date(booking.started_at).getTime()) / 60_000;
    const captureAmount = proRataCaptureCents(
      booking.original_amount_cents,
      Number(booking.duration_minutes),
      elapsedMinutes,
    );

    try {
      const pi = await stripe.paymentIntents.retrieve(booking.payment_intent_id, undefined, opts);
      if (pi.status === 'requires_capture' && captureAmount > 0) {
        await stripe.paymentIntents.capture(
          booking.payment_intent_id,
          { amount_to_capture: captureAmount },
          opts,
        );
        console.log('End early capture:', captureAmount, 'of', booking.original_amount_cents);
      }
      // pi.status in {succeeded, canceled, ...}: nothing to capture, fall through.
    } catch (err) {
      logError('stripe/end-early', err, {
        booking_id: booking.id,
        payment_intent_id: booking.payment_intent_id,
        stripeAccount,
      });
      return NextResponse.json(
        { error: 'capture_failed', message: err instanceof Error ? err.message : 'Stripe capture failed' },
        { status: 502 },
      );
    }
  }

  // ── Delete uploaded beam file from storage (if any) ─────────────────────
  if (booking.storage_path) {
    await supabase.storage.from('beams').remove([booking.storage_path]).catch((err: any) => {
      console.error('[end-early] storage delete failed:', err.message);
    });
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Set expired
  await supabase
    .from('bookings')
    .update({ status: 'expired' })
    .eq('id', booking.id);

  // Auto-deny any pending extensions from same viewer on this slot
  if (booking.element_id) {
    const { data: pendingExtensions } = await supabase
      .from('bookings')
      .select('*')
      .eq('element_id', booking.element_id)
      .eq('viewer_name', booking.viewer_name)
      .eq('status', 'pending')
      .eq('is_queued', true);

    for (const ext of (pendingExtensions || [])) {
      if (ext.payment_intent_id && stripeAccount) {
        try {
          const opts = { stripeAccount };
          const pi = await stripe.paymentIntents.retrieve(ext.payment_intent_id, undefined, opts);
          if (pi.status === 'requires_capture') {
            await stripe.paymentIntents.cancel(ext.payment_intent_id, undefined, opts);
          } else if (pi.status === 'succeeded') {
            await stripe.refunds.create({ payment_intent: ext.payment_intent_id }, opts);
          }
        } catch (err: any) {
          console.error('Extension cancel failed:', err.message);
        }
      }
      await supabase
        .from('bookings')
        .update({ status: 'denied' })
        .eq('id', ext.id);
    }
  }

  // Auto-start next in queue
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

  return NextResponse.json({ success: true });
}
