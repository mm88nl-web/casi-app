/**
 * POST /api/flashes/moderate
 *
 * Streamer approves or denies a pending flash. Now handles two rails:
 *
 * Stripe  — captures or cancels the PaymentIntent, then flips DB status.
 * Solana  — client already broadcast `approve_flash` / `deny_flash` on-chain;
 *           this route verifies the tx landed successfully and references
 *           the flash's escrow PDA, then flips DB status.
 *
 * The Solana branch is trust-minimised: the DB only reflects on-chain state.
 * We never mark `approved` on-chain funds unless the tx verifies clean.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Connection, PublicKey } from '@solana/web3.js';
import { stripe } from '@/lib/stripe';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const TX_SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;

const SOLANA_RPC =
  process.env.HELIUS_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  'https://api.devnet.solana.com';

const ESCROW_SEED = Buffer.from('casi-escrow');

let _programId: PublicKey | null = null;
function getProgramId(): PublicKey {
  if (_programId) return _programId;
  // '11111111111111111111111111111111' (System Program) is the safe sentinel
  // when the env var is unset — it keeps the module loadable during build.
  // A real deploy populates NEXT_PUBLIC_CASI_PROGRAM_ID via sync-program-id.mjs.
  const raw = process.env.NEXT_PUBLIC_CASI_PROGRAM_ID || '11111111111111111111111111111111';
  _programId = new PublicKey(raw);
  return _programId;
}

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32) throw new Error(`Invalid UUID: ${uuid}`);
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function deriveEscrowPda(flashId: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [ESCROW_SEED, uuidToBytes(flashId)],
    getProgramId(),
  );
  return pda;
}

/**
 * Verify that a Solana tx signature corresponds to a successful CPI
 * into the CASI escrow program and touches the expected escrow PDA.
 * Returns null on success, or an error string.
 */
async function verifySolanaTx(
  signature: string,
  expectedEscrowPda: PublicKey,
): Promise<string | null> {
  const conn = new Connection(SOLANA_RPC, 'confirmed');
  const tx = await conn.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
  if (!tx)                 return 'Transaction not found on-chain';
  if (tx.meta?.err)        return `Transaction failed on-chain: ${JSON.stringify(tx.meta.err)}`;

  const message = tx.transaction.message;
  const keys = 'staticAccountKeys' in message
    ? message.staticAccountKeys
    : (message as any).accountKeys;
  const touchesProgram = keys.some((k: PublicKey) => k.equals(getProgramId()));
  const touchesPda     = keys.some((k: PublicKey) => k.equals(expectedEscrowPda));
  if (!touchesProgram) return 'Transaction does not invoke the CASI escrow program';
  if (!touchesPda)     return 'Transaction does not reference the expected escrow PDA';

  return null;
}

export async function POST(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { flash_id, action, tx_signature } = body as {
    flash_id?: string;
    action?: 'approve' | 'deny';
    tx_signature?: string;
  };

  if (!flash_id || !action || !['approve', 'deny'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { data: flash } = await supabase
    .from('flashes')
    .select('*')
    .eq('id', flash_id)
    .single();

  if (!flash) {
    return NextResponse.json({ error: 'Flash not found' }, { status: 404 });
  }
  if (flash.profile_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (flash.status !== 'pending') {
    return NextResponse.json({ error: `Flash already ${flash.status}` }, { status: 409 });
  }

  // ── Solana branch ──────────────────────────────────────────────────────
  if (flash.payment_method === 'solana') {
    if (!tx_signature || !TX_SIG_RE.test(tx_signature)) {
      return NextResponse.json({ error: 'Missing or invalid tx_signature' }, { status: 400 });
    }
    if (!flash.escrow_pda) {
      return NextResponse.json({ error: 'Flash has no escrow_pda' }, { status: 409 });
    }

    let expectedPda: PublicKey;
    try {
      expectedPda = deriveEscrowPda(flash.id);
    } catch {
      return NextResponse.json({ error: 'Unable to derive escrow PDA' }, { status: 500 });
    }
    if (expectedPda.toBase58() !== flash.escrow_pda) {
      return NextResponse.json({ error: 'escrow_pda mismatch' }, { status: 409 });
    }

    const verifyErr = await verifySolanaTx(tx_signature, expectedPda);
    if (verifyErr) {
      console.error('[flashes/moderate] solana verify failed:', verifyErr);
      return NextResponse.json({ error: verifyErr }, { status: 400 });
    }

    const nextStatus = action === 'approve' ? 'approved' : 'denied';
    const { error: updErr } = await supabase
      .from('flashes')
      .update({ status: nextStatus, tx_signature })
      .eq('id', flash.id)
      .eq('status', 'pending');
    if (updErr) {
      console.error('[flashes/moderate] update failed:', updErr);
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  // ── Stripe branch (unchanged) ──────────────────────────────────────────
  if (action === 'approve') {
    if (flash.payment_method === 'stripe' && flash.payment_intent_id) {
      try {
        const pi = await stripe.paymentIntents.retrieve(flash.payment_intent_id);
        if (pi.status === 'requires_capture') {
          await stripe.paymentIntents.capture(flash.payment_intent_id);
        }
      } catch (err: any) {
        console.error('[flashes/moderate] Stripe capture failed:', err.message);
        return NextResponse.json({ error: 'Payment capture failed' }, { status: 500 });
      }
    }
    await supabase.from('flashes').update({ status: 'approved' }).eq('id', flash_id);
    return NextResponse.json({ success: true });
  }

  // action === 'deny'
  if (flash.payment_method === 'stripe' && flash.payment_intent_id) {
    try {
      const pi = await stripe.paymentIntents.retrieve(flash.payment_intent_id);
      if (pi.status === 'requires_capture') {
        await stripe.paymentIntents.cancel(flash.payment_intent_id);
      } else if (pi.status === 'succeeded') {
        await stripe.refunds.create({ payment_intent: flash.payment_intent_id });
      }
    } catch (err: any) {
      console.error('[flashes/moderate] Stripe cancel/refund failed:', err.message);
    }
  }
  await supabase.from('flashes').update({ status: 'denied' }).eq('id', flash_id);
  return NextResponse.json({ success: true });
}
