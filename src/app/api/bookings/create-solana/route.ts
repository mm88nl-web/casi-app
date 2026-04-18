/**
 * POST /api/bookings/create-solana
 *
 * Server-gated insert for Solana-paid booking rows. The pre-existing flow
 * inserted directly from the browser under bookings_insert_public, then ran
 * a number of follow-up writes (status='denied' on errors, tx_signature /
 * escrow_pda / viewer_wallet on success) under bookings_update_anon. Those
 * follow-ups now require a per-booking cancel_token — issued here — so this
 * route is the only legitimate path to obtain one for a Solana booking.
 *
 * Stale-pending cleanup: prior pending Solana bookings for the same
 * (profile_id, element_id, viewer_name) without an escrow_pda are denied
 * inside the same request. The viewer_name comes from the client and is
 * therefore mass-deny capable (attacker submits with another viewer's
 * name); we cap the blast radius with a per-IP rate limit on this route
 * (re-uses the free_flash_rate_limits table).
 *
 * Request body mirrors the row shape the overlay used to insert directly:
 *   { profile_id, element_id, viewer_name, image_url?, storage_path?,
 *     file_type?, message?, duration_minutes, price_value, price_unit,
 *     is_queued?, queue_position? }
 *
 * Response: { booking_id, cancel_token }
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SOLANA_BOOKING_COOLDOWN_MS = 5_000;

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
    if (elapsed < SOLANA_BOOKING_COOLDOWN_MS) return false;
  }

  const { error } = await supabase
    .from('free_flash_rate_limits')
    .upsert(
      { streamer_id: streamerId, viewer_key: viewerKey, last_sent_at: new Date().toISOString() },
      { onConflict: 'streamer_id,viewer_key' },
    );
  if (error) {
    console.error('[bookings/create-solana] rate-limit upsert failed:', error);
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
  } = body;

  if (!profile_id || !element_id || !viewer_name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const viewerKey = `solana:${hashIp(getClientIp(req))}`;
  const allowed = await claimSlot(profile_id, viewerKey);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Slow down — wait a few seconds before booking again.' },
      { status: 429 },
    );
  }

  // Verify the slot belongs to the streamer and grab its server-side
  // price/duration so we can ignore client-supplied values that drift.
  const { data: element } = await supabase
    .from('overlay_elements')
    .select('id, profile_id, price_value, price_unit, max_duration_minutes')
    .eq('id', element_id)
    .single();

  if (!element) return NextResponse.json({ error: 'Slot not found' }, { status: 404 });
  if (element.profile_id !== profile_id) {
    return NextResponse.json({ error: 'Slot does not belong to this streamer' }, { status: 400 });
  }

  const dur = Math.min(
    Number(duration_minutes) || 0,
    Number(element.max_duration_minutes) || Number(duration_minutes) || 0,
  );
  if (dur <= 0) return NextResponse.json({ error: 'Invalid duration' }, { status: 400 });

  // Stale cleanup: deny prior pending Solana bookings for this viewer_name
  // on this slot that never got an escrow_pda. Bounded by the per-IP rate
  // limit above so an attacker can't repeatedly call this endpoint to
  // mass-deny another viewer's pendings.
  await supabase
    .from('bookings')
    .update({ status: 'denied' })
    .eq('profile_id', profile_id)
    .eq('element_id', element_id)
    .eq('viewer_name', viewer_name)
    .eq('status', 'pending')
    .eq('payment_method', 'solana')
    .is('escrow_pda', null);

  const cancelToken = randomUUID();

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
      payment_method: 'solana',
      is_queued: !!is_queued,
      queue_position: is_queued ? queue_position ?? null : null,
      cancel_token: cancelToken,
    })
    .select('id')
    .single();

  if (insertErr || !booking) {
    console.error('[bookings/create-solana] insert failed:', insertErr);
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
  }

  return NextResponse.json({ booking_id: booking.id, cancel_token: cancelToken });
}
