import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';

/**
 * Helius webhook for CASI on-chain events.
 *
 * Listens for transactions that invoke the CASI escrow program and logs
 * booking / flash matches for observability. This is **not** the source of
 * truth — the client already posts tx_signature + escrow_pda directly to
 * /api/flashes/attach-escrow (flashes) or updates the booking row itself
 * (beams) after signing. Helius arriving late or dropping a retry cannot
 * break the flow.
 *
 * Configure the Helius webhook to deliver "enhanced" transactions filtered by
 * account = NEXT_PUBLIC_CASI_PROGRAM_ID, and to include the header
 * `authorization: <HELIUS_WEBHOOK_SECRET>`.
 *
 * Always returns 200 so Helius doesn't retry and burn credits.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const OK = () => NextResponse.json({ ok: true });

export async function POST(req: Request) {
  const webhookSecret = process.env.HELIUS_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[solana webhook] HELIUS_WEBHOOK_SECRET is not set — dropping request');
    return OK();
  }
  const authHeader = req.headers.get('authorization') ?? '';
  // Constant-time compare: plain `!==` leaks secret bytes via timing to a
  // remote attacker who can repeatedly probe the endpoint.
  const a = Buffer.from(authHeader);
  const b = Buffer.from(webhookSecret);
  const valid = a.length === b.length && timingSafeEqual(a, b);
  if (!valid) {
    console.warn('[solana webhook] rejected — invalid authorization header');
    return OK();
  }

  // The program ID is configured at build-time (bundle) AND can be overridden
  // per deploy via env. We accept the env-var to avoid a redeploy when the
  // program ID changes between devnet / mainnet.
  const CASI_PROGRAM_ID = process.env.NEXT_PUBLIC_CASI_PROGRAM_ID;
  if (!CASI_PROGRAM_ID || CASI_PROGRAM_ID === '11111111111111111111111111111111') {
    // Program not deployed yet — nothing to observe.
    return OK();
  }

  const body = await req.json().catch(() => null);
  if (!Array.isArray(body) || body.length === 0) return OK();

  for (const event of body) {
    const invokesCasi =
      event.instructions?.some((ix: { programId?: string }) => ix.programId === CASI_PROGRAM_ID) ||
      event.accountData?.some((a: { account?: string }) => a.account === CASI_PROGRAM_ID);
    if (!invokesCasi) continue;

    const txSignature: string | undefined = event.signature;
    if (!txSignature) continue;

    // Best-effort match against flashes and bookings by tx_signature. Nothing
    // depends on this match — it's purely an observability aid for debugging
    // flows where the client request to /api/flashes/attach-escrow or the
    // booking update race failed.
    const [flashMatch, bookingMatch] = await Promise.all([
      supabase.from('flashes').select('id, status').eq('tx_signature', txSignature).maybeSingle(),
      supabase.from('bookings').select('id, status').eq('tx_signature', txSignature).maybeSingle(),
    ]);

    if (flashMatch.data) {
      console.log('[solana webhook] ✓ CASI tx matches flash', flashMatch.data.id, 'status:', flashMatch.data.status);
    }
    if (bookingMatch.data) {
      console.log('[solana webhook] ✓ CASI tx matches booking', bookingMatch.data.id, 'status:', bookingMatch.data.status);
    }
    if (!flashMatch.data && !bookingMatch.data) {
      console.log('[solana webhook] CASI tx with no DB match:', txSignature);
    }
  }

  return OK();
}
