/**
 * POST /api/bookings/my-status
 *
 * Token-verified read of a viewer's own bookings. Replaces the old client
 * pattern of `.eq('viewer_name', name)` direct anon SELECTs — viewer_name is
 * publicly readable and unauthenticated, so it never proved ownership, only
 * convenience. This route proves it instead, the same way
 * /api/bookings/viewer-deny already does for the mutating side: match each
 * requested booking id against the cancel_token minted for it at creation
 * time (create-stripe / create-free / create-solana), stored client-side in
 * localStorage by rememberBookingToken().
 *
 * Runs as service_role and bypasses RLS entirely — this is intentional and
 * safe *because* every returned row is individually token-verified below,
 * not because the route trusts the caller. anon RLS itself only exposes
 * active/approved_queued rows (+ a narrow Solana stuck-escrow carve-out) as
 * of 20260827010000_narrow_anon_select_policies.sql; this route is the
 * replacement path for everything else a legitimate viewer needs to see
 * about their own history (pending / denied / cancelled / expired).
 *
 * Request body: { tokens: Record<booking_id, cancel_token> }
 * Response:     { bookings: BookingRow[] }   — only rows whose stored
 *               cancel_token matches the token supplied for that id.
 *               cancel_token and payment_intent_id are never included in
 *               the response, same columns anon can't SELECT directly.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const MAX_IDS = 100;

// Same shape overlay/page.tsx's BOOKING_COLS already selects, minus
// cancel_token (the credential itself) and payment_intent_id (never used by
// any viewer-facing code — see 20260826120000_scope_bookings_flashes_reads.sql).
// Must stay a single string literal (no `+` concatenation) — Supabase's
// typed client parses the column list at the type level, which only works
// on a literal, not a runtime-concatenated string.
const SAFE_COLS =
  'id, created_at, profile_id, element_id, viewer_name, status, image_url, storage_path, file_type, message, duration_minutes, price_value, price_unit, payment_method, stream_id, tx_signature, original_amount_cents, approved_at, started_at, ended_at, escrow_pda, viewer_wallet, is_queued, queue_position, banner_font_px, banner_speed_secs, media_offset_x, media_offset_y, media_zoom, cancel_token';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const tokens = body?.tokens;
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) {
    return NextResponse.json({ error: 'tokens object is required' }, { status: 400 });
  }

  const ids = Object.keys(tokens).slice(0, MAX_IDS);
  if (ids.length === 0) return NextResponse.json({ bookings: [] });

  const { data, error } = await supabase
    .from('bookings')
    .select(SAFE_COLS)
    .in('id', ids);

  if (error) {
    console.error('[bookings/my-status] query failed:', error);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }

  const verified = (data || [])
    .filter((row: { id: string | number; cancel_token: string | null }) => {
      const supplied = tokens[String(row.id)];
      return typeof supplied === 'string' && supplied.length > 0 && supplied === row.cancel_token;
    })
    // Strip the credential itself out of the response — the client already
    // has it, and there's no reason to echo it back.
    .map((row: Record<string, unknown> & { cancel_token: unknown }) => {
      const rest = { ...row };
      delete rest.cancel_token;
      return rest;
    });

  return NextResponse.json({ bookings: verified });
}
