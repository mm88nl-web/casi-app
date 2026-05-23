/**
 * POST /api/bookings/create-free
 *
 * Server-gated path for free-tier booking creation (price_value = 0 slots).
 * Paid bookings continue to insert directly from the client under RLS;
 * Stripe Checkout provides the friction there. Free bookings need explicit
 * content + captcha gating, which is enforced here.
 *
 * Request body:
 *   {
 *     profile_id, element_id, viewer_name, message?, image_url?,
 *     storage_path?, file_type?, duration_minutes, turnstile_token
 *   }
 *
 * Response: { booking_id }  (or 4xx error with { error })
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import { moderateText, LIMITS } from '@/lib/content-moderation';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { validateBannerBooking, sanitizeBookingCustomization } from '@/lib/banner';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FREE_BOOKING_COOLDOWN_MS = 60_000;

function getClientIp(req: Request): string {
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return 'unknown';
}

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

/** Re-uses the free_flash_rate_limits table — one row per (streamer, viewer). */
async function claimFreeSlot(streamerId: string, viewerKey: string): Promise<boolean> {
  const { data: existing } = await supabase
    .from('free_flash_rate_limits')
    .select('last_sent_at')
    .eq('streamer_id', streamerId)
    .eq('viewer_key', viewerKey)
    .maybeSingle();

  if (existing?.last_sent_at) {
    const elapsed = Date.now() - new Date(existing.last_sent_at).getTime();
    if (elapsed < FREE_BOOKING_COOLDOWN_MS) return false;
  }

  const { error } = await supabase
    .from('free_flash_rate_limits')
    .upsert(
      { streamer_id: streamerId, viewer_key: viewerKey, last_sent_at: new Date().toISOString() },
      { onConflict: 'streamer_id,viewer_key' },
    );
  if (error) {
    console.error('[bookings/create-free] rate-limit upsert failed:', error);
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
    message,
    image_url,
    storage_path,
    file_type,
    duration_minutes,
    is_queued,
    queue_position,
    turnstile_token,
  } = body;
  const customization = sanitizeBookingCustomization(body);

  if (!profile_id || !element_id || !viewer_name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // P0 guard: free slots are image-only until automated video moderation
  // (NSFW.js frame-scan) lands. Paid slots still accept video.
  if (file_type === 'video') {
    return NextResponse.json(
      { error: 'Videos are paid-slots only for now' },
      { status: 400 },
    );
  }

  const nameCheck = moderateText(viewer_name, 'viewer_name');
  if (!nameCheck.ok) return NextResponse.json({ error: nameCheck.reason }, { status: 400 });

  if (message && message.trim().length > 0) {
    if (message.length > LIMITS.bookingMessage) {
      return NextResponse.json({ error: `Message too long (max ${LIMITS.bookingMessage} chars)` }, { status: 400 });
    }
    const msgCheck = moderateText(message, 'message');
    if (!msgCheck.ok) return NextResponse.json({ error: msgCheck.reason }, { status: 400 });
  }

  const captcha = await verifyTurnstileToken(turnstile_token, getClientIp(req));
  if (!captcha.ok) return NextResponse.json({ error: captcha.reason }, { status: 400 });

  // Re-read the element server-side to verify: (a) it belongs to profile_id,
  // (b) it really is free (price_value = 0), (c) duration is within max.
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
  if (Number(element.price_value) !== 0) {
    return NextResponse.json({ error: 'This slot is not free — use paid checkout' }, { status: 400 });
  }

  const dur = Math.min(
    Number(duration_minutes) || 0,
    Number(element.max_duration_minutes) || Number(duration_minutes) || 0,
  );
  if (dur <= 0) return NextResponse.json({ error: 'Invalid duration' }, { status: 400 });

  // Per-streamer rate limit (1/min per viewer key). Re-uses the table that
  // already exists for free flashes.
  const viewerKey = `ip:${hashIp(getClientIp(req))}`;
  const allowed = await claimFreeSlot(profile_id, viewerKey);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Slow down — one free booking per minute.' },
      { status: 429 },
    );
  }

  // cancel_token: see stripe/authorize/route.ts — random secret returned
  // once to the viewer so /api/stripe/cancel can authorize viewer-branch
  // cancellation without trusting the public viewer_name column.
  const cancelToken = randomUUID();

  const { data: booking, error: insertErr } = await supabase
    .from('bookings')
    .insert({
      profile_id,
      element_id,
      viewer_name: viewer_name.trim(),
      image_url: image_url || null,
      storage_path: storage_path || null,
      file_type: file_type || null,
      message: message?.trim() || null,
      duration_minutes: dur,
      price_value: 0,
      price_unit: element.price_unit,
      status: 'pending',
      payment_method: 'free',
      is_queued: !!is_queued,
      queue_position: is_queued ? queue_position ?? null : null,
      cancel_token: cancelToken,
      ...customization,
    })
    .select('id')
    .single();

  if (insertErr || !booking) {
    console.error('[bookings/create-free] insert failed:', insertErr);
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
  }

  return NextResponse.json({ booking_id: booking.id, cancel_token: cancelToken });
}
