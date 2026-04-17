import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { USDC_MINT } from '@/lib/solana-network';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Streamflow uses the same program ID on devnet and mainnet, so no switch needed here.
const STREAMFLOW_PROGRAM_ID = 'strmRqUvRpeYvH9bZfBy86M8nmUqh5pGEF2p9Vv4v';

// Always return 200 — Helius retries on non-2xx which burns credits.
const OK = () => NextResponse.json({ ok: true });

export async function POST(req: Request) {
  // ── Signature verification ────────────────────────────────────────────────
  // Helius sends the webhook secret you configured in the dashboard as the
  // Authorization header value.  We always enforce it — a missing env var is
  // a deployment misconfiguration that must be fixed, not silently bypassed.
  // We still return 200 on failure so Helius doesn't exhaust retries and burn
  // credits, but we bail out before touching the database.
  const webhookSecret = process.env.HELIUS_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[solana webhook] HELIUS_WEBHOOK_SECRET is not set — dropping request without processing');
    return OK();
  }
  const authHeader = req.headers.get('authorization') ?? '';
  if (authHeader !== webhookSecret) {
    console.warn('[solana webhook] rejected request — invalid authorization header');
    return OK();
  }
  // ─────────────────────────────────────────────────────────────────────────

  const body = await req.json().catch(() => null);
  if (!Array.isArray(body) || body.length === 0) return OK();

  for (const event of body) {
    // ── Layer 1: is this a Streamflow USDC transfer? ──────────────────────
    const isStreamflow = event.instructions?.some(
      (ix: any) => ix.programId === STREAMFLOW_PROGRAM_ID,
    );
    const isUsdc = event.tokenTransfers?.some(
      (t: any) => t.mint === USDC_MINT,
    );
    if (!isStreamflow || !isUsdc) continue;   // not our program — skip silently

    // ── Layer 2: does the receiver belong to one of our streamers? ────────
    // Enhanced payload: tokenTransfers[].toUserAccount is the recipient wallet.
    const receivers: string[] = (event.tokenTransfers ?? [])
      .map((t: any) => t.toUserAccount)
      .filter(Boolean);

    if (receivers.length === 0) continue;

    const { data: matchedProfile } = await supabase
      .from('profiles')
      .select('id')
      .in('solana_wallet', receivers)
      .maybeSingle();

    if (!matchedProfile) {
      // USDC Streamflow tx but receiver isn't one of our streamers — ignore
      console.log('[solana webhook] no profile match for receivers', receivers);
      continue;
    }

    // ── Layer 3: match the exact booking by tx_signature ──────────────────
    const txSignature: string = event.signature;
    if (!txSignature) continue;

    const { data: booking } = await supabase
      .from('bookings')
      .select('id')
      .eq('tx_signature', txSignature)
      .eq('status', 'pending')
      .maybeSingle();

    if (!booking) {
      console.warn('[solana webhook] tx matched a streamer but no pending booking:', txSignature);
      continue;
    }

    // Payment confirmed on-chain. Leave status='pending' so the streamer
    // reviews and approves via the admin dashboard (same UX as Stripe).
    // The tx_signature already stored in the booking row is the payment proof
    // that unlocks the admin Approve button.
    console.log('[solana webhook] ✓ payment confirmed for booking', booking.id, 'tx:', txSignature);
  }

  return OK();
}
