/**
 * POST /api/flashes/my-status
 *
 * Token-verified read of a viewer's own flashes — the flashes counterpart
 * to /api/bookings/my-status. See that route's header comment for the full
 * rationale; same trust model, same reason it exists (anon RLS on flashes
 * now only exposes approved rows + a narrow Solana stuck-escrow carve-out,
 * see 20260827010000_narrow_anon_select_policies.sql).
 *
 * Verifies each requested flash id against viewer_token
 * (20260827000000_flashes_viewer_token.sql), minted at creation in
 * /api/flashes/create and stored client-side via rememberFlashToken().
 *
 * Request body: { tokens: Record<flash_id, viewer_token> }
 * Response:     { flashes: FlashRow[] }
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const MAX_IDS = 100;

// Matches overlay/page.tsx's FLASH_COLS ∪ HIST_FLASH_COLS, plus viewer_token
// (stripped before responding — see below).
// Must stay a single string literal (no `+` concatenation) — Supabase's
// typed client parses the column list at the type level, which only works
// on a literal, not a runtime-concatenated string.
const SAFE_COLS =
  'id, profile_id, viewer_name, message, amount_cents, currency, status, payment_method, stream_id, tx_signature, created_at, escrow_pda, viewer_wallet, settle_tx_signature, viewer_token';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const tokens = body?.tokens;
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) {
    return NextResponse.json({ error: 'tokens object is required' }, { status: 400 });
  }

  const ids = Object.keys(tokens).slice(0, MAX_IDS);
  if (ids.length === 0) return NextResponse.json({ flashes: [] });

  const { data, error } = await supabase
    .from('flashes')
    .select(SAFE_COLS)
    .in('id', ids);

  if (error) {
    console.error('[flashes/my-status] query failed:', error);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }

  const verified = (data || [])
    .filter((row: { id: string | number; viewer_token: string | null }) => {
      const supplied = tokens[String(row.id)];
      return typeof supplied === 'string' && supplied.length > 0 && supplied === row.viewer_token;
    })
    .map((row: Record<string, unknown> & { viewer_token: unknown }) => {
      const rest = { ...row };
      delete rest.viewer_token;
      return rest;
    });

  return NextResponse.json({ flashes: verified });
}
