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
import { createHash } from 'node:crypto';
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

// Kept in lockstep with `uuidToBytes` in src/lib/casi-escrow.ts. The Anchor
// program treats escrow_id as 32 opaque bytes; SHA-256-ing the stringified
// id works whether flashes.id is a uuid string or bookings.id is a bigint.
function uuidToBytes(id: string | number | bigint): Uint8Array {
  return createHash('sha256').update(String(id)).digest();
}

function deriveEscrowPda(flashId: string | number | bigint): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [ESCROW_SEED, uuidToBytes(flashId)],
    getProgramId(),
  );
  return pda;
}

/** Anchor instruction discriminator: sha256("global:<ix_name>").slice(0, 8). */
function anchorDiscriminator(name: string): Buffer {
  return createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
}
const DISC_APPROVE = anchorDiscriminator('approve_flash');
const DISC_DENY    = anchorDiscriminator('deny_flash');

/**
 * Verify that a Solana tx signature is a successful invocation of the CASI
 * escrow program, that the instruction matches the action the streamer
 * claims to be taking (approve vs deny), that the expected escrow PDA is
 * one of its accounts, and that the streamer's own wallet signed the tx.
 *
 * Without the discriminator + signer checks a viewer could submit any
 * self-signed tx that merely touches the program and claim it's an approval.
 *
 * Returns null on success, or an error string.
 */
async function verifySolanaTx(
  signature: string,
  expectedEscrowPda: PublicKey,
  action: 'approve' | 'deny',
  expectedStreamerWallet: PublicKey,
): Promise<string | null> {
  const conn = new Connection(SOLANA_RPC, 'confirmed');
  const tx = await conn.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
  if (!tx)          return 'Transaction not found on-chain';
  if (tx.meta?.err) return `Transaction failed on-chain: ${JSON.stringify(tx.meta.err)}`;

  const message = tx.transaction.message;
  const staticKeys: PublicKey[] = 'staticAccountKeys' in message
    ? message.staticAccountKeys
    : (message as any).accountKeys;
  const programId = getProgramId();
  const programIdx = staticKeys.findIndex((k) => k.equals(programId));
  if (programIdx < 0) return 'Transaction does not invoke the CASI escrow program';

  // Signer check — streamer wallet must be in the tx's signer prefix.
  const numSigners = message.header.numRequiredSignatures;
  const signerKeys = staticKeys.slice(0, numSigners);
  if (!signerKeys.some((k) => k.equals(expectedStreamerWallet))) {
    return 'Transaction is not signed by the streamer';
  }

  // Scan compiled instructions for one that targets our program and matches
  // the claimed action's discriminator. Use the `compiledInstructions`
  // accessor so legacy + v0 messages behave uniformly (data as Uint8Array).
  const expectedDisc = action === 'approve' ? DISC_APPROVE : DISC_DENY;
  type CompiledIx = { programIdIndex: number; accountKeyIndexes: number[]; data: Uint8Array };
  const compiled = (message as unknown as { compiledInstructions?: CompiledIx[] }).compiledInstructions;
  if (!compiled || !Array.isArray(compiled)) {
    return 'Unable to decode transaction instructions';
  }

  const pdaIdx = staticKeys.findIndex((k) => k.equals(expectedEscrowPda));
  if (pdaIdx < 0) return 'Transaction does not reference the expected escrow PDA';

  const matching = compiled.find((ix) => {
    if (ix.programIdIndex !== programIdx) return false;
    if (ix.data.length < 8) return false;
    for (let i = 0; i < 8; i++) if (ix.data[i] !== expectedDisc[i]) return false;
    return ix.accountKeyIndexes.includes(pdaIdx);
  });
  if (!matching) {
    return `Transaction has no matching ${action}_flash instruction for this escrow`;
  }

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
  const { flash_id, action, tx_signature, db_only } = body as {
    flash_id?: string;
    action?: 'approve' | 'deny';
    tx_signature?: string;
    /**
     * Drift-recovery path: admin saw a pending flash whose on-chain PDA
     * is either missing (never paid, attach-escrow failed) or already
     * closed (prior approve/deny succeeded but this route failed to
     * update the DB). Request asks us to flip DB status WITHOUT
     * expecting a tx_signature — but we still audit on-chain to make
     * sure the escrow really is gone, so a viewer can't trick us into
     * denying a live flash they paid for.
     */
    db_only?: boolean;
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
    // Drift-recovery: no tx_signature means the client probed the PDA
    // and found it already closed (or never paid). We re-verify that
    // on-chain before flipping the DB, so the route is still trust-
    // minimised — a client can't lie about PDA state.
    if (db_only) {
      // Case A: flash never got an escrow_pda (viewer abandoned / attach
      // failed). Only deny makes sense — there's nothing to approve.
      if (!flash.escrow_pda) {
        if (action !== 'deny') {
          return NextResponse.json(
            { error: 'Cannot approve a flash that was never paid' },
            { status: 409 },
          );
        }
        const { error: updErr } = await supabase
          .from('flashes')
          .update({ status: 'denied' })
          .eq('id', flash.id)
          .eq('status', 'pending');
        if (updErr) {
          console.error('[flashes/moderate] db-only deny (no escrow) update failed:', updErr);
          return NextResponse.json({ error: 'Update failed' }, { status: 500 });
        }
        return NextResponse.json({ success: true, mode: 'db_only' });
      }

      // Case B: flash has an escrow_pda but the PDA is closed on-chain.
      // Probe to confirm, then flip DB. Also validate the stored pda
      // matches what the program would derive — guards against a
      // tampered row pointing somewhere else.
      let derivedPda: PublicKey;
      try {
        derivedPda = deriveEscrowPda(flash.id);
      } catch {
        return NextResponse.json({ error: 'Unable to derive escrow PDA' }, { status: 500 });
      }
      if (derivedPda.toBase58() !== flash.escrow_pda) {
        return NextResponse.json({ error: 'escrow_pda mismatch' }, { status: 409 });
      }

      const conn = new Connection(SOLANA_RPC, 'confirmed');
      const info = await conn.getAccountInfo(derivedPda).catch(() => null);
      if (info) {
        return NextResponse.json(
          { error: 'Escrow is still live on-chain — use the normal approve/deny path' },
          { status: 409 },
        );
      }

      const nextStatus = action === 'approve' ? 'approved' : 'denied';
      const { error: updErr } = await supabase
        .from('flashes')
        .update({ status: nextStatus })
        .eq('id', flash.id)
        .eq('status', 'pending');
      if (updErr) {
        console.error('[flashes/moderate] db-only update failed:', updErr);
        return NextResponse.json({ error: 'Update failed' }, { status: 500 });
      }
      return NextResponse.json({ success: true, mode: 'db_only' });
    }

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

    // Need the streamer's linked wallet as the expected signer.
    const { data: streamerProfile } = await supabase
      .from('profiles')
      .select('solana_wallet')
      .eq('id', flash.profile_id)
      .single();
    if (!streamerProfile?.solana_wallet) {
      return NextResponse.json({ error: 'Streamer has no Solana wallet linked' }, { status: 409 });
    }
    let expectedStreamerKey: PublicKey;
    try {
      expectedStreamerKey = new PublicKey(streamerProfile.solana_wallet);
    } catch {
      return NextResponse.json({ error: 'Invalid streamer wallet on file' }, { status: 500 });
    }

    const verifyErr = await verifySolanaTx(tx_signature, expectedPda, action, expectedStreamerKey);
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

  // ── Stripe branch ──────────────────────────────────────────────────────
  // Flash PaymentIntents live on the streamer's connected account (Direct
  // Charges, see flashes/create/route.ts), so every PI call must target it.
  const { data: stripeProfile } = await supabase
    .from('profiles')
    .select('stripe_account_id')
    .eq('id', flash.profile_id)
    .single();
  const stripeAccount = stripeProfile?.stripe_account_id;

  if (action === 'approve') {
    if (flash.payment_method === 'stripe' && flash.payment_intent_id && stripeAccount) {
      try {
        const opts = { stripeAccount };
        const pi = await stripe.paymentIntents.retrieve(flash.payment_intent_id, undefined, opts);
        if (pi.status === 'requires_capture') {
          await stripe.paymentIntents.capture(flash.payment_intent_id, undefined, opts);
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
  if (flash.payment_method === 'stripe' && flash.payment_intent_id && stripeAccount) {
    try {
      const opts = { stripeAccount };
      const pi = await stripe.paymentIntents.retrieve(flash.payment_intent_id, undefined, opts);
      if (pi.status === 'requires_capture') {
        await stripe.paymentIntents.cancel(flash.payment_intent_id, undefined, opts);
      } else if (pi.status === 'succeeded') {
        await stripe.refunds.create({ payment_intent: flash.payment_intent_id }, opts);
      }
    } catch (err: any) {
      console.error('[flashes/moderate] Stripe cancel/refund failed:', err.message);
    }
  }
  await supabase.from('flashes').update({ status: 'denied' }).eq('id', flash_id);
  return NextResponse.json({ success: true });
}
