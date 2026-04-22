/**
 * POST /api/flashes/viewer-recover
 *
 * Viewer-side reconciliation for a stuck Solana flash. Two scenarios:
 *
 *   1. The viewer just signed `cancel_escrow` themselves to get their
 *      funds back. PDA is now closed on-chain, but the DB row still
 *      reads status=pending. They want it off their "stuck" list.
 *
 *   2. A prior moderation tx closed the PDA but `/api/flashes/moderate`
 *      failed mid-flight (the same drift class we cover for the streamer
 *      side in admin/page.tsx::moderateSolanaFlash). The viewer notices
 *      the PDA is gone via the recovery UI and asks us to reflect it.
 *
 * Trust model: this route is unauthenticated (no Bearer token required).
 * That's safe because the only mutation it performs is flipping a
 * pending row to `denied` after independently verifying on-chain that
 * the escrow PDA no longer exists. A live PDA = no DB write. So an
 * attacker can't fake-deny a flash whose escrow is still live.
 *
 * The "denied" target status mirrors what would happen if the streamer
 * pressed Deny — it doesn't matter who actually closed the PDA; the
 * outcome is the same (funds left the vault, no payout to streamer).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Connection, PublicKey } from '@solana/web3.js';
import { createHash } from 'node:crypto';
import { logError, logWarn } from '@/lib/observability';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SOLANA_RPC =
  process.env.HELIUS_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  'https://api.devnet.solana.com';

const ESCROW_SEED = Buffer.from('casi-escrow');

let _programId: PublicKey | null = null;
function getProgramId(): PublicKey {
  if (_programId) return _programId;
  const raw = process.env.NEXT_PUBLIC_CASI_PROGRAM_ID || '11111111111111111111111111111111';
  _programId = new PublicKey(raw);
  return _programId;
}

function uuidToBytes(id: string | number | bigint): Uint8Array {
  return createHash('sha256').update(String(id)).digest();
}

function deriveEscrowPda(flashId: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [ESCROW_SEED, uuidToBytes(flashId)],
    getProgramId(),
  );
  return pda;
}

export async function POST(req: Request) {
  let body: { flash_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const flashId = body.flash_id;
  if (!flashId || typeof flashId !== 'string') {
    return NextResponse.json({ error: 'flash_id is required' }, { status: 400 });
  }

  const { data: flash, error: readErr } = await supabase
    .from('flashes')
    .select('id, status, payment_method, escrow_pda')
    .eq('id', flashId)
    .single();

  if (readErr || !flash) {
    return NextResponse.json({ error: 'Flash not found' }, { status: 404 });
  }
  if (flash.payment_method !== 'solana') {
    return NextResponse.json(
      { error: 'Recovery only applies to Solana flashes' },
      { status: 400 },
    );
  }
  if (flash.status !== 'pending') {
    // Already settled — nothing to do, return success so the client UI
    // clears the row regardless.
    return NextResponse.json({ success: true, mode: 'already_settled' });
  }
  if (!flash.escrow_pda) {
    // No on-chain reference at all. Just mark it denied so the viewer's
    // stuck list clears (this case is the viewer abandoned mid-payment
    // before initializeFlash landed).
    const { error: updErr } = await supabase
      .from('flashes')
      .update({ status: 'denied' })
      .eq('id', flashId)
      .eq('status', 'pending');
    if (updErr) {
      logError('flashes/viewer-recover', updErr, { flash_id: flashId, branch: 'no_escrow' });
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
    return NextResponse.json({ success: true, mode: 'no_escrow' });
  }

  // Validate the stored escrow_pda matches what the program would derive.
  // Defends against tampered rows pointing the probe somewhere else.
  let derived: PublicKey;
  try {
    derived = deriveEscrowPda(flashId);
  } catch (err) {
    logError('flashes/viewer-recover', err, { flash_id: flashId });
    return NextResponse.json({ error: 'Unable to derive PDA' }, { status: 500 });
  }
  if (derived.toBase58() !== flash.escrow_pda) {
    logWarn('flashes/viewer-recover', 'escrow_pda mismatch', {
      flash_id: flashId,
      stored: flash.escrow_pda,
      derived: derived.toBase58(),
    });
    return NextResponse.json({ error: 'escrow_pda mismatch' }, { status: 409 });
  }

  // Probe the PDA. Live = refuse (viewer should sign cancel_escrow first
  // to refund themselves; this route only reflects an already-closed
  // state). Closed = flip DB to denied.
  const conn = new Connection(SOLANA_RPC, 'confirmed');
  const info = await conn.getAccountInfo(derived).catch(() => null);
  if (info) {
    return NextResponse.json(
      { error: 'Escrow is still live on-chain — cancel it first to refund yourself' },
      { status: 409 },
    );
  }

  const { error: updErr } = await supabase
    .from('flashes')
    .update({ status: 'denied' })
    .eq('id', flashId)
    .eq('status', 'pending');
  if (updErr) {
    logError('flashes/viewer-recover', updErr, { flash_id: flashId });
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true, mode: 'closed_on_chain' });
}
