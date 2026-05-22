/**
 * POST /api/bookings/create-stripe
 *
 * Server-gated insert for Stripe-paid booking rows. The pre-existing flow
 * inserted directly from the browser under bookings_insert_public and ran a
 * stale-pending UPDATE(status='denied') right before the insert, which was
 * the last remaining anon UPDATE on bookings. Moving both writes here under
 * service_role lets us revoke anon UPDATE(status) entirely (see
 * 20260422000000_revoke_anon_booking_update.sql).
 *
 * Stale-pending cleanup: prior pending Stripe bookings for the same
 * (profile_id, element_id, viewer_name) without a payment_intent_id are
 * denied inside the same request. viewer_name comes from the client and is
 * therefore mass-deny capable; capped with a per-IP rate limit on this
 * route (re-uses free_flash_rate_limits, prefix "stripe:").
 *
 * Duplicate check: if a row already exists for this viewer on this slot in
 * {pending(with PI), active, approved_queued}, return 409 so the UI can
 * show "You already have a booking for this slot" and bail.
 *
 * cancel_token is NOT issued here — /api/stripe/authorize mints it just
 * before the checkout redirect so the token only reaches the client if
 * Stripe session creation succeeded.
 *
 * Request body:
 *   { profile_id, element_id, viewer_name, image_url?, storage_path?,
 *     file_type?, message?, duration_minutes, price_value, price_unit,
 *     is_queued?, queue_position?, is_extend? }
 *
 * Response: { booking_id } | { error: 'already_booked' } (409)
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { validateBannerBooking, sanitizeBookingCustomization } from '@/lib/banner';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const STRIPE_BOOKING_COOLDOWN_MS = 5_000;

function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const last = fwd.split(',').pop()?.trim();
    if (last) return last;
  }
  return req.headers.get('x-real-ip') || 'unknown';
}

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

async function claimSlot(streamerId: string, viewerKey: string): Promise<boolean> {
  const { data: existing } = await supabase
    .from('free_flash_rate_limits')
    .select('last_sent_at')
    .eq('streamer_id', streamerId)
    .eq('viewer_key', viewerKey)
    .maybeSingle();

  if (existing?.last_sent_at) {
    const elapsed = Date.now() - new Date(existing.last_sent_at).getTime();
    if (elapsed < STRIPE_BOOKING_COOLDOWN_MS) return false;
  }

  const { error } = await supabase
    .from('free_flash_rate_limits')
    .upsert(
      { streamer_id: streamerId, viewer_key: viewerKey, last_sent_at: new Date().toISOString() },
      { onConflict: 'streamer_id,viewer_key' },
    );
  if (error) {
    console.error('[bookings/create-stripe] rate-limit upsert failed:', error);
    return false;
  }
  return true;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const {
    profile_id,
    element_id,
    viewer_name,
    image_url,
    storage_path,
    file_type,
    message,
    duration_minutes,
    price_value,
    price_unit,
    is_queued,
    queue_position,
    is_extend,
  } = body;
  const customization = sanitizeBookingCustomization(body);

  if (!profile_id || !element_id || !viewer_name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const viewerKey = `stripe:${hashIp(getClientIp(req))}`;
  const allowed = await claimSlot(profile_id, viewerKey);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Slow down — wait a few seconds before booking again.' },
      { status: 429 },
    );
  }

  const { data: streamerProfile } = await supabase
    .from('profiles')
    .select('suspended_at')
    .eq('id', profile_id)
    .single();
  if (streamerProfile?.suspended_at) {
    return NextResponse.json({ error: 'This streamer is unavailable' }, { status: 403 });
  }

  const { data: element } = await supabase
    .from('overlay_elements')
    .select('id, profile_id, price_value, price_unit, max_duration_minutes, shape')
    .eq('id', element_id)
    .single();

  if (!element) return NextResponse.json({ error: 'Slot not found' }, { status: 404 });
  if (element.profile_id !== profile_id) {
    return NextResponse.json({ error: 'Slot does not belong to this streamer' }, { status: 400 });
  }

  // Banner slots require a non-empty message capped at BANNER_MAX_MESSAGE.
  // Non-banner slots short-circuit inside the validator.
  const bannerCheck = validateBannerBooking(element.shape, message);
  if (!bannerCheck.ok) {
    return NextResponse.json({ error: bannerCheck.error }, { status: 400 });
  }

  const dur = Math.min(
    Number(duration_minutes) || 0,
    Number(element.max_duration_minutes) || Number(duration_minutes) || 0,
  );
  if (dur <= 0) return NextResponse.json({ error: 'Invalid duration' }, { status: 400 });

  // Stale cleanup: prior pending Stripe rows for this viewer+slot that never
  // got a PaymentIntent (viewer closed the tab before authorize ran).
  await supabase
    .from('bookings')
    .update({ status: 'denied' })
    .eq('profile_id', profile_id)
    .eq('element_id', element_id)
    .eq('viewer_name', viewer_name)
    .eq('status', 'pending')
    .eq('payment_method', 'stripe')
    .is('payment_intent_id', null);

  // Duplicate check: block a second concurrent booking on the same slot by
  // the same viewer. Extensions are exempt because they intentionally queue
  // behind the viewer's own active booking.
  if (!is_extend) {
    const { data: dup } = await supabase
      .from('bookings')
      .select('id')
      .eq('profile_id', profile_id)
      .eq('element_id', element_id)
      .eq('viewer_name', viewer_name)
      .in('status', ['pending', 'active', 'approved_queued'])
      .maybeSingle();
    if (dup) {
      return NextResponse.json({ error: 'already_booked' }, { status: 409 });
    }
  }

  const { data: booking, error: insertErr } = await supabase
    .from('bookings')
    .insert({
      profile_id,
      element_id,
      viewer_name,
      image_url: image_url || null,
      storage_path: storage_path || null,
      file_type: file_type || null,
      message: message || null,
      duration_minutes: dur,
      price_value: Number(price_value) || Number(element.price_value) || 0,
      price_unit: price_unit || element.price_unit,
      status: 'pending',
      payment_method: 'stripe',
      is_queued: !!is_queued,
      queue_position: is_queued ? queue_position ?? null : null,
      ...customization,
    })
    .select('id')
    .single();

  if (insertErr || !booking) {
    console.error('[bookings/create-stripe] insert failed:', insertErr);
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
  }

  return NextResponse.json({ booking_id: booking.id });
}
