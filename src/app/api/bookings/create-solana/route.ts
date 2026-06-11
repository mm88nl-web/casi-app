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
import { SystemProgram } from '@solana/web3.js';
import { createHash, randomUUID } from 'node:crypto';
import { deriveEscrowPda, PROGRAM_ID } from '@/lib/casi-escrow';
import { validateBannerBooking, sanitizeBookingCustomization, validateMediaUrl } from '@/lib/banner';
import { logError, logWarn } from '@/lib/observability';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SOLANA_BOOKING_COOLDOWN_MS = 5_000;

function getClientIp(req: Request): string {
  // x-real-ip is set by Vercel to the actual client IP and is most reliable.
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  // x-forwarded-for is a comma-separated list; the FIRST entry is the original
  // client. Taking the last entry risks using a proxy/CDN address which would
  // bucket all users into the same rate-limit slot.
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
    logError('bookings/create-solana/rate-limit', error, { streamerId, viewerKey });
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
    wallet_app,
  } = body;
  const customization = sanitizeBookingCustomization(body);
  // Telemetry only: which wallet app the viewer used (phantom|solflare|…).
  // Sanitized to a short slug; nullable; never gates anything.
  const walletApp =
    typeof wallet_app === 'string'
      ? wallet_app.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24) || null
      : null;

  if (!profile_id || !element_id || !viewer_name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const mediaCheck = validateMediaUrl(image_url);
  if (!mediaCheck.ok) {
    return NextResponse.json({ error: mediaCheck.error }, { status: 400 });
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

  const maxDur = Number(element.max_duration_minutes) || 0;
  if (maxDur <= 0) return NextResponse.json({ error: 'Slot has no duration limit configured' }, { status: 400 });
  const dur = Math.min(Number(duration_minutes) || 0, maxDur);
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
      image_url: mediaCheck.value,
      storage_path: storage_path || null,
      file_type: file_type || null,
      message: message || null,
      duration_minutes: dur,
      price_value: Number(element.price_value) || 0,
      price_unit: element.price_unit,
      status: 'pending',
      payment_method: 'solana',
      is_queued: !!is_queued,
      queue_position: is_queued ? queue_position ?? null : null,
      cancel_token: cancelToken,
      ...customization,
    })
    .select('id')
    .single();

  if (insertErr || !booking) {
    // Fan out to the error webhook (Discord/Slack) so we see this without
    // tailing Vercel logs, and include the Supabase error detail in the
    // response so the failed-to-create-booking toast actually tells the
    // viewer (and us) what went wrong instead of swallowing the cause.
    logError('bookings/create-solana', insertErr ?? new Error('insert returned no booking'), {
      profile_id, element_id, viewer_name, duration_minutes: dur,
      price_value, price_unit,
    });
    return NextResponse.json(
      { error: 'Failed to create booking — please try again' },
      { status: 500 },
    );
  }

  // Best-effort telemetry write, intentionally decoupled from the insert so a
  // not-yet-applied migration (the wallet_app column) can never break booking
  // creation. Fire-and-forget; swallow any error (incl. missing column).
  if (walletApp) {
    void supabase
      .from('bookings')
      .update({ wallet_app: walletApp })
      .eq('id', booking.id)
      .then(({ error }) => {
        if (error) logWarn('bookings/create-solana', 'wallet_app telemetry write skipped', { reason: error.message });
      });
  }

  // Pre-compute and store the escrow PDA server-side. The derivation is
  // deterministic (sha256(booking_id) → PDA), so the server and client end up
  // with the same address. Storing it at insert time is what lets the Helius
  // webhook (/api/webhooks/solana) look up the booking by PDA on the very
  // first event — before the client has a chance to POST /attach-solana-tx.
  // Without this, initialize_escrow webhooks would miss and we'd rely on the
  // client-side race-prone attach path.
  //
  // Fail soft: if PROGRAM_ID is unset (sandbox / misconfigured deploy) we log
  // and skip. The client will still attach via /attach-solana-tx on the happy
  // path; only the webhook-only path is affected.
  if (!PROGRAM_ID.equals(SystemProgram.programId)) {
    try {
      const [escrowPda] = deriveEscrowPda(booking.id);
      const { error: pdaErr } = await supabase
        .from('bookings')
        .update({ escrow_pda: escrowPda.toBase58() })
        .eq('id', booking.id)
        .is('escrow_pda', null);
      if (pdaErr) {
        logError('bookings/create-solana/escrow-pda', pdaErr, { booking_id: booking.id });
      }
    } catch (err) {
      logError('bookings/create-solana/derive-pda', err, { booking_id: booking.id });
    }
  } else {
    logWarn('bookings/create-solana', 'NEXT_PUBLIC_CASI_PROGRAM_ID unset — skipping server-side escrow_pda');
  }

  return NextResponse.json({ booking_id: booking.id, cancel_token: cancelToken });
}
