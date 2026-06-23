/**
 * POST /api/flashes/attach-escrow
 *
 * Called by the viewer's browser immediately after a successful
 * `initialize_escrow` on-chain tx. Writes the on-chain metadata back to the
 * flash row so the admin dashboard can call `approve_flash` / `deny_flash`.
 *
 * Trust model
 * -----------
 * This route does NOT custody funds and does NOT change the escrow status —
 * it only stores an index (tx_signature, escrow_pda, viewer_wallet) that the
 * moderation route will later verify on-chain before allowing a DB status
 * flip. If a viewer lies about tx_signature, the streamer's subsequent
 * `approve_flash` tx will simply fail on-chain because no vault exists.
 *
 * We still perform a lightweight validation:
 *   - flash exists and is still pending
 *   - payment_method === 'solana'
 *   - no escrow metadata has been written yet (single-shot)
 *   - escrow_pda / tx_signature / viewer_wallet are well-formed
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PublicKey } from '@solana/web3.js';
import { notifyFlash, shouldNotify } from '@/lib/notify';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const TX_SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;

function isValidPubkey(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  try {
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { flash_id, tx_signature, escrow_pda, viewer_wallet } = body ?? {};

  if (!flash_id || typeof flash_id !== 'string') {
    return NextResponse.json({ error: 'flash_id is required' }, { status: 400 });
  }
  if (typeof tx_signature !== 'string' || !TX_SIG_RE.test(tx_signature)) {
    return NextResponse.json({ error: 'Invalid tx_signature' }, { status: 400 });
  }
  if (!isValidPubkey(escrow_pda)) {
    return NextResponse.json({ error: 'Invalid escrow_pda' }, { status: 400 });
  }
  if (!isValidPubkey(viewer_wallet)) {
    return NextResponse.json({ error: 'Invalid viewer_wallet' }, { status: 400 });
  }

  const { data: flash, error: readErr } = await supabase
    .from('flashes')
    .select('id, status, payment_method, escrow_pda, tx_signature, profile_id, viewer_name, message, amount_cents')
    .eq('id', flash_id)
    .single();

  if (readErr || !flash) {
    return NextResponse.json({ error: 'Flash not found' }, { status: 404 });
  }
  if (flash.payment_method !== 'solana') {
    return NextResponse.json({ error: 'Flash is not a Solana escrow' }, { status: 400 });
  }
  if (flash.status !== 'pending') {
    return NextResponse.json({ error: `Flash already ${flash.status}` }, { status: 409 });
  }
  if (flash.escrow_pda || flash.tx_signature) {
    return NextResponse.json({ error: 'Escrow metadata already set' }, { status: 409 });
  }

  const { error: updErr } = await supabase
    .from('flashes')
    .update({ tx_signature, escrow_pda, viewer_wallet })
    .eq('id', flash_id)
    // Single-shot: this must still be the pristine row we just read.
    .eq('status', 'pending')
    .is('escrow_pda', null);

  if (updErr) {
    console.error('[flashes/attach-escrow] update failed:', updErr);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  // Fire-and-forget: notify on Solana flash (funds are now locked in escrow).
  if (shouldNotify(flash.profile_id)) await notifyFlash({
    viewer_name: flash.viewer_name ?? null,
    message: flash.message ?? null,
    amount_display: flash.amount_cents != null
      ? `${(flash.amount_cents / 100).toFixed(2)} USDC`
      : null,
    payment_method: 'solana',
    flash_id: flash.id,
  });

  return NextResponse.json({ success: true });
}
