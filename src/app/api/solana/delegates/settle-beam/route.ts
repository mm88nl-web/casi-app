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
 * POST /api/solana/delegates/settle-beam
 *
 * Server-side crank for `settle_beam_delegated`. Flips a Solana booking
 * Active → Settled on-chain using the streamer's installed session key, so
 * playNow / kickBeam / deny-on-Active don't need a wallet pop-up.
 *
 * Settle math is enforced on-chain: vested portion goes to the streamer,
 * remainder refunds the viewer, escrow account closes (rent → streamer).
 * The session key is scoped: it authorizes the settle but it's the program
 * that decides how much each party gets based on `start_timestamp` and
 * `duration_secs` — a compromised session key can force an early settle,
 * never steal funds.
 *
 * DB writes happen in the Helius webhook (settle_beam_delegated discriminator
 * mirrors settle_beam). This route does not touch Supabase after the chain tx.
 */

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { booking_id?: unknown } = {};
  try { body = (await req.json()) ?? {}; } catch { /* empty body → 400 below */ }
  const rawId = body.booking_id;
  if (rawId === undefined || rawId === null || rawId === '') {
    return NextResponse.json({ error: 'booking_id required' }, { status: 400 });
  }
  const bookingId = typeof rawId === 'number' ? rawId : String(rawId);

  // ── Load booking and streamer profile in parallel ────────────────────────
  const [{ data: booking, error: bookingErr }, { data: profile, error: profileErr }] =
    await Promise.all([
      supabase
        .from('bookings')
        .select('id, profile_id, status, payment_method, escrow_pda, viewer_wallet')
        .eq('id', bookingId)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('id, solana_wallet')
        .eq('id', user.id)
        .maybeSingle(),
    ]);

  if (bookingErr || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }
  if (profileErr || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }
  if (booking.profile_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (booking.payment_method !== 'solana') {
    return NextResponse.json({ error: 'Not a Solana booking', reason: 'wrong_rail' }, { status: 400 });
  }
  // Settle is only meaningful on an Active escrow. Pending → would hit the
  // NotActive constraint on-chain; Settled/Cancelled → account is already
  // closed. Treat the already-settled case as idempotent success.
  if (booking.status !== 'active') {
    return NextResponse.json({
      ok: true,
      alreadySettled: booking.status !== 'pending',
      status: booking.status,
    });
  }
  if (!booking.escrow_pda) {
    return NextResponse.json({ error: 'Booking has no escrow_pda', reason: 'no_escrow' }, { status: 400 });
  }
  if (!booking.viewer_wallet) {
    return NextResponse.json(
      { error: 'Booking has no viewer_wallet', reason: 'no_viewer_wallet' },
      { status: 400 },
    );
  }
  if (!profile.solana_wallet) {
    return NextResponse.json(
      { error: 'Streamer wallet not on file', reason: 'no_wallet' },
      { status: 400 },
    );
  }

  // ── Load + validate delegate row ─────────────────────────────────────────
  const { data: delegate, error: delegateErr } = await supabase
    .from('streamer_delegates')
    .select('session_pubkey, encrypted_secret, expires_at, revoked_at')
    .eq('profile_id', user.id)
    .maybeSingle();
  if (delegateErr) {
    logError('delegates-settle-beam', delegateErr, { profile_id: user.id });
    return NextResponse.json({ error: 'Delegate lookup failed', reason: 'db_error' }, { status: 500 });
  }
  if (!delegate) {
    return NextResponse.json(
      { error: 'No delegate installed', reason: 'no_delegate' },
      { status: 400 },
    );
  }
  if (delegate.revoked_at) {
    return NextResponse.json(
      { error: 'Delegate has been revoked', reason: 'revoked' },
      { status: 400 },
    );
  }
  const expMs = Date.parse(delegate.expires_at);
  if (!Number.isFinite(expMs) || expMs <= Date.now()) {
    return NextResponse.json(
      { error: 'Delegate has expired — rotate first', reason: 'expired' },
      { status: 400 },
    );
  }

  // ── Decrypt session key ──────────────────────────────────────────────────
  let session: Keypair;
  try {
    const secretBytes = openSessionSecret(delegate.encrypted_secret);
    session = Keypair.fromSecretKey(secretBytes);
  } catch (err) {
    logError('delegates-settle-beam', err, { profile_id: user.id, scope: 'decrypt' });
    return NextResponse.json(
      { error: 'Server crypto error', reason: 'decrypt_failed' },
      { status: 500 },
    );
  }
  if (session.publicKey.toBase58() !== delegate.session_pubkey) {
    logError('delegates-settle-beam',
      new Error('session keypair / session_pubkey mismatch'),
      { profile_id: user.id });
    return NextResponse.json(
      { error: 'Server crypto error', reason: 'key_mismatch' },
      { status: 500 },
    );
  }

  // ── Cranker as fee + ATA-init payer ──────────────────────────────────────
  const cranker = loadCrankerKeypair('delegates-settle-beam');
  if (!cranker) {
    logWarn('delegates-settle-beam',
      'SOLANA_CRANKER_KEYPAIR not set — delegated settle cannot pay fees');
    return NextResponse.json(
      { error: 'Server fee payer not configured', reason: 'no_cranker' },
      { status: 503 },
    );
  }

  const connection = new Connection(SOLANA_RPC, 'confirmed');
  const streamer   = new PublicKey(profile.solana_wallet);
  const viewer     = new PublicKey(booking.viewer_wallet);

  // Minimal AnchorWallet shim — same rationale as start-beam route.
  const wallet = {
    publicKey: session.publicKey,
    signTransaction:    async <T extends Transaction>(t: T): Promise<T> => {
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
    const client = new CasiEscrowClient(
      connection,
      wallet,
      WALLET_ADAPTER_CLUSTER,
    );
    const ix = await client.buildSettleBeamDelegatedIx({
      escrowId:   booking.id,
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
      logWarn('delegates-settle-beam', 'tx already processed — treating as success', {
        booking_id: booking.id,
      });
      return NextResponse.json({ ok: true, alreadyProcessed: true });
    }
    // Pull the Anchor logs off the SendTransactionError so the admin toast
    // can tell the streamer WHICH constraint the program failed — otherwise
    // a generic "On-chain settle failed" leaves us guessing between wallet
    // mismatch, delegate expired, ATA mismatch, etc.
    const anchorLogs = (err as { logs?: unknown })?.logs;
    const casiError = parseCasiError(err);
    logError('delegates-settle-beam', err, {
      booking_id: booking.id,
      casi_error: casiError,
      logs: Array.isArray(anchorLogs) ? anchorLogs : undefined,
    });
    return NextResponse.json(
      {
        error: 'On-chain settle failed',
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
