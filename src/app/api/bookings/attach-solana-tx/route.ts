/**
 * POST /api/bookings/attach-solana-tx
 *
 * Persists Solana payment proof on a booking the viewer just funded:
 * tx_signature (optional — recovery path may not have it), escrow_pda, and
 * viewer_wallet. Replaces direct anon writes that needed
 * bookings_update_anon to grant UPDATE on those columns.
 *
 * Auth: per-booking cancel_token issued by /api/bookings/create-solana.
 *
 * Request:  { booking_id, cancel_token, tx_signature?, escrow_pda, viewer_wallet }
 * Response: { success: true }
 *
 * Value-integrity: escrow_pda and tx_signature used to be trusted verbatim
 * from the client with no verification (see
 * docs/fable-security-review-2026-08-28.md Finding 3). Since a booking's
 * PDA is fully determined by booking_id/escrow_seed (Fable's 2026-08-28
 * Finding 1 fix), the server now derives the correct value itself instead
 * of trusting the client's — a client-supplied escrow_pda is no longer even
 * read. tx_signature, when supplied, is checked against a real confirmed
 * on-chain transaction that actually references the derived PDA before
 * being stored; an unverifiable signature is dropped (not stored) rather
 * than failing the whole request, since this route's own design already
 * treats tx_signature as optional — the PDA-only path (probed later by the
 * webhook/reconciler) completes the booking fine without it.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { Connection } from '@solana/web3.js';
import { deriveEscrowPda } from '@/lib/casi-escrow';
import { SOLANA_RPC } from '@/lib/solana-network';
import { logWarn } from '@/lib/observability';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function tokensMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Confirms `signature` is a real, landed transaction that actually
 * references `expectedPda` among its account keys. Returns false (never
 * throws) on any RPC error, malformed signature, or a real-but-unrelated
 * transaction — every failure mode here should just mean "don't store this
 * signature", not "500 the request".
 */
async function verifyTxReferencesEscrow(signature: string, expectedPda: string): Promise<boolean> {
  try {
    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const tx = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) return false;
    const keys = tx.transaction.message.getAccountKeys({
      accountKeysFromLookups: tx.meta?.loadedAddresses,
    });
    for (let i = 0; i < keys.length; i++) {
      if (keys.get(i)?.toBase58() === expectedPda) return true;
    }
    return false;
  } catch (err) {
    logWarn('attach-solana-tx', 'tx verification failed — dropping signature', {
      signature, reason: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const rawId = body?.booking_id;
  const claimedToken = body?.cancel_token;
  const tx_signature: string | undefined = body?.tx_signature;
  const viewer_wallet: string | undefined = body?.viewer_wallet;

  if (rawId === undefined || rawId === null || rawId === '') {
    return NextResponse.json({ error: 'booking_id required' }, { status: 400 });
  }
  const booking_id = typeof rawId === 'number' ? rawId : String(rawId);
  if (!viewer_wallet) {
    return NextResponse.json({ error: 'viewer_wallet required' }, { status: 400 });
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, cancel_token, escrow_seed')
    .eq('id', booking_id)
    .single();

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }
  if (!tokensMatch(claimedToken, booking.cancel_token)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Never trust a client-supplied escrow_pda — derive the one true value
  // server-side from the same seed every on-chain instruction uses.
  const [derivedPda] = deriveEscrowPda(booking.escrow_seed ?? booking.id);
  const escrow_pda = derivedPda.toBase58();

  const update: Record<string, unknown> = { escrow_pda, viewer_wallet };
  if (tx_signature && (await verifyTxReferencesEscrow(tx_signature, escrow_pda))) {
    update.tx_signature = tx_signature;
  }

  await supabase.from('bookings').update(update).eq('id', booking.id);
  return NextResponse.json({ success: true });
}
