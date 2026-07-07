/**
 * POST /api/bookings/streamer-publish
 *
 * Lets an authenticated streamer put their own content directly on their own
 * overlay slot — no payment, no approval queue. This is NOT a "free tier"
 * booking (that's /api/bookings/create-free, viewer-facing, captcha-gated,
 * still lands pending for approval): this route only ever writes to the
 * caller's own profile_id, verified from the bearer token, and returns the
 * inserted row so the client can immediately call the existing
 * playNowBooking() — same activation path a normal queue "Play Now" uses,
 * so kicking whatever's currently active on that slot is handled identically
 * (including Solana settlement via the delegate/cranker if that's what's live).
 *
 * Request body: { element_id, image_url, storage_path?, file_type?, duration_minutes }
 * Response: { booking } | { error }
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateMediaUrl } from '@/lib/banner';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const MAX_DURATION_MINUTES = 24 * 60; // sanity cap — no "indefinite" state exists

export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { element_id, image_url, storage_path, file_type, duration_minutes } = body;
  if (!element_id || !image_url) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const mediaCheck = validateMediaUrl(image_url);
  if (!mediaCheck.ok) {
    return NextResponse.json({ error: mediaCheck.error }, { status: 400 });
  }

  const dur = Math.min(Math.max(Number(duration_minutes) || 0, 0), MAX_DURATION_MINUTES);
  if (dur <= 0) return NextResponse.json({ error: 'Invalid duration' }, { status: 400 });

  // The slot must belong to the authenticated streamer — this route can
  // only ever publish to the caller's own overlay, never anyone else's.
  const { data: element } = await supabase
    .from('overlay_elements')
    .select('id, profile_id, price_unit')
    .eq('id', element_id)
    .single();

  if (!element) return NextResponse.json({ error: 'Slot not found' }, { status: 404 });
  if (element.profile_id !== user.id) {
    return NextResponse.json({ error: 'Slot does not belong to this streamer' }, { status: 403 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, username')
    .eq('id', user.id)
    .maybeSingle();

  const { data: booking, error: insertErr } = await supabase
    .from('bookings')
    .insert({
      profile_id: user.id,
      element_id,
      viewer_name: profile?.display_name || profile?.username || 'Streamer',
      image_url: mediaCheck.value,
      storage_path: storage_path || null,
      file_type: file_type || null,
      duration_minutes: dur,
      price_value: 0,
      price_unit: element.price_unit,
      status: 'pending',
      payment_method: 'streamer',
    })
    .select('*')
    .single();

  if (insertErr || !booking) {
    console.error('[bookings/streamer-publish] insert failed:', insertErr);
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
  }

  return NextResponse.json({ booking });
}
