import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { SOLANA_RPC, WALLET_ADAPTER_CLUSTER } from '@/lib/solana-network';
import { openSessionSecret } from '@/lib/delegate-crypto';
import { loadCrankerKeypair } from '@/lib/cranker-keypair';
import { CasiEscrowClient, solscanTxUrl } from '@/lib/casi-escrow';
import { logError, logWarn } from '@/lib/observability';
import { parseCasiError } from '@/lib/casi-errors';

/**
 * POST /api/solana/delegates/deny-flash
 *
 * Server-side crank for `deny_flash_delegated`. Refunds a pending Solana
 * flash on-chain using the streamer's session key. Mirror of the approve
 * variant except the full balance goes back to the viewer and the viewer
 * closes out the EscrowState rent.
 *
 * DB writes happen in the Helius webhook (deny_flash_delegated
 * discriminator routes into the same handler as deny_flash).
 */

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { flash_id?: unknown } = {};
  try { body = (await req.json()) ?? {}; } catch { /* empty body → 400 below */ }
  const rawId = body.flash_id;
  if (rawId === undefined || rawId === null || rawId === '') {
    return NextResponse.json({ error: 'flash_id required' }, { status: 400 });
  }
  const flashId = typeof rawId === 'number' ? rawId : String(rawId);

  const [{ data: flash, error: flashErr }, { data: profile, error: profileErr }] =
    await Promise.all([
      supabase
        .from('flashes')
        .select('id, profile_id, status, payment_method, escrow_pda, viewer_wallet')
        .eq('id', flashId)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('id, solana_wallet')
        .eq('id', user.id)
        .maybeSingle(),
    ]);

  if (flashErr || !flash) {
    return NextResponse.json({ error: 'Flash not found' }, { status: 404 });
  }
  if (profileErr || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }
  if (flash.profile_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (flash.payment_method !== 'solana') {
    return NextResponse.json({ error: 'Not a Solana flash', reason: 'wrong_rail' }, { status: 400 });
  }
  if (flash.status === 'denied') {
    return NextResponse.json({ ok: true, alreadyProcessed: true, status: flash.status });
  }
  if (flash.status !== 'pending') {
    return NextResponse.json(
      { error: `Cannot deny a ${flash.status} flash`, reason: 'wrong_status' },
      { status: 400 },
    );
  }
  if (!flash.escrow_pda) {
    return NextResponse.json({ error: 'Flash has no escrow_pda', reason: 'no_escrow' }, { status: 400 });
  }
  if (!flash.viewer_wallet) {
    return NextResponse.json({ error: 'Flash has no viewer_wallet', reason: 'no_viewer_wallet' }, { status: 400 });
  }
  if (!profile.solana_wallet) {
    return NextResponse.json({ error: 'Streamer wallet not on file', reason: 'no_wallet' }, { status: 400 });
  }

  const { data: delegate, error: delegateErr } = await supabase
    .from('streamer_delegates')
    .select('session_pubkey, encrypted_secret, expires_at, revoked_at')
    .eq('profile_id', user.id)
    .maybeSingle();
  if (delegateErr) {
    logError('delegates-deny-flash', delegateErr, { profile_id: user.id });
    return NextResponse.json({ error: 'Delegate lookup failed', reason: 'db_error' }, { status: 500 });
  }
  if (!delegate) {
    return NextResponse.json({ error: 'No delegate installed', reason: 'no_delegate' }, { status: 400 });
  }
  if (delegate.revoked_at) {
    return NextResponse.json({ error: 'Delegate has been revoked', reason: 'revoked' }, { status: 400 });
  }
  const expMs = Date.parse(delegate.expires_at);
  if (!Number.isFinite(expMs) || expMs <= Date.now()) {
    return NextResponse.json({ error: 'Delegate has expired — rotate first', reason: 'expired' }, { status: 400 });
  }

  let session: Keypair;
  try {
    const secretBytes = openSessionSecret(delegate.encrypted_secret);
    session = Keypair.fromSecretKey(secretBytes);
  } catch (err) {
    logError('delegates-deny-flash', err, { profile_id: user.id, scope: 'decrypt' });
    return NextResponse.json({ error: 'Server crypto error', reason: 'decrypt_failed' }, { status: 500 });
  }
  if (session.publicKey.toBase58() !== delegate.session_pubkey) {
    logError('delegates-deny-flash',
      new Error('session keypair / session_pubkey mismatch'),
      { profile_id: user.id });
    return NextResponse.json({ error: 'Server crypto error', reason: 'key_mismatch' }, { status: 500 });
  }

  const cranker = loadCrankerKeypair('delegates-deny-flash');
  if (!cranker) {
    logWarn('delegates-deny-flash', 'SOLANA_CRANKER_KEYPAIR not set — delegated deny cannot pay fees');
    return NextResponse.json({ error: 'Server fee payer not configured', reason: 'no_cranker' }, { status: 503 });
  }

  const connection = new Connection(SOLANA_RPC, 'confirmed');
  const streamer   = new PublicKey(profile.solana_wallet);
  const viewer     = new PublicKey(flash.viewer_wallet);

  const wallet = {
    publicKey: session.publicKey,
    signTransaction: async <T extends Transaction>(t: T): Promise<T> => {
      (t as unknown as Transaction).partialSign(session);
      return t;
    },
    signAllTransactions: async <T extends Transaction>(ts: T[]): Promise<T[]> => {
      for (const t of ts) (t as unknown as Transaction).partialSign(session);
      return ts;
    },
  } as unknown as import('@solana/wallet-adapter-react').AnchorWallet;

  let sig: string;
  try {
    const client = new CasiEscrowClient(connection, wallet, WALLET_ADAPTER_CLUSTER);
    const ix = await client.buildDenyFlashDelegatedIx({
      escrowId:   flash.id,
      streamer,
      viewer,
      sessionKey: session.publicKey,
      cranker:    cranker.publicKey,
    });

    const tx = new Transaction().add(ix);
    tx.feePayer = cranker.publicKey;
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;

    sig = await sendAndConfirmTransaction(connection, tx, [cranker, session], {
      commitment: 'confirmed',
      skipPreflight: false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('already been processed')) {
      logWarn('delegates-deny-flash', 'tx already processed — treating as success', {
        flash_id: flash.id,
      });
      return NextResponse.json({ ok: true, alreadyProcessed: true });
    }
    const anchorLogs = (err as { logs?: unknown })?.logs;
    const casiError = parseCasiError(err);
    logError('delegates-deny-flash', err, {
      flash_id: flash.id,
      casi_error: casiError,
      logs: Array.isArray(anchorLogs) ? anchorLogs : undefined,
    });
    return NextResponse.json(
      {
        error: 'On-chain deny failed',
        reason: 'chain_error',
        casiError,
        message: casiError ? `${casiError}: ${msg}` : msg,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    signature:  sig,
    solscanUrl: solscanTxUrl(sig, WALLET_ADAPTER_CLUSTER),
  });
}
