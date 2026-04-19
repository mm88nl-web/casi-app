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
import { CasiEscrowClient, solscanTxUrl } from '@/lib/casi-escrow';
import { logError, logWarn } from '@/lib/observability';

/**
 * POST /api/solana/delegates/start-beam
 *
 * Server-side crank for `start_beam_delegated`. Flips a Solana booking
 * Pending → Active on-chain using the streamer's installed session key, so
 * the streamer doesn't need a wallet pop-up every time they click Approve.
 *
 * Invariants this route enforces (all BEFORE it touches the chain):
 *   1. Bearer-auth'd streamer owns the booking (profile_id match).
 *   2. Booking is Solana-rail, status='pending', with escrow_pda set.
 *   3. Streamer has a solana_wallet on file (the escrow's `streamer` key).
 *   4. A delegate row exists, is not revoked, and has not expired.
 *
 * Why a separate route from admin/page.tsx's start_beam flow: that path
 * requires the streamer's browser + wallet extension to sign. This one is
 * purely server-held — the secret stays encrypted at rest and only lives in
 * memory for the duration of this request. The on-chain program enforces
 * that the session key can ONLY authorize start_beam_delegated; it can't
 * move funds or settle, so leaking it is bounded damage (unwanted starts).
 *
 * DB writes are NOT performed here — the Helius webhook handles the
 * Pending → Active transition via the start_beam_delegated discriminator,
 * mirroring every other on-chain event. This keeps a single authoritative
 * writer and removes a class of race with the webhook.
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
        .select('id, profile_id, status, payment_method, escrow_pda, tx_signature')
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
  if (booking.status !== 'pending') {
    // Idempotent-ish: the tx may have already landed. The client can ignore.
    return NextResponse.json({ ok: true, alreadyStarted: true, status: booking.status });
  }
  if (!booking.escrow_pda) {
    return NextResponse.json({ error: 'Booking has no escrow_pda', reason: 'no_escrow' }, { status: 400 });
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
    logError('delegates-start-beam', delegateErr, { profile_id: user.id });
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

  // ── Decrypt session key and sign the on-chain instruction ────────────────
  let session: Keypair;
  try {
    const secretBytes = openSessionSecret(delegate.encrypted_secret);
    session = Keypair.fromSecretKey(secretBytes);
  } catch (err) {
    logError('delegates-start-beam', err, { profile_id: user.id, scope: 'decrypt' });
    return NextResponse.json(
      { error: 'Server crypto error', reason: 'decrypt_failed' },
      { status: 500 },
    );
  }

  // Belt-and-braces: the encrypted secret must match the stored pubkey. If
  // these diverge we're about to sign with the wrong key — bail loudly rather
  // than produce a tx that'll silently fail on-chain with SignatureMismatch.
  if (session.publicKey.toBase58() !== delegate.session_pubkey) {
    logError('delegates-start-beam',
      new Error('session keypair / session_pubkey mismatch'),
      { profile_id: user.id });
    return NextResponse.json(
      { error: 'Server crypto error', reason: 'key_mismatch' },
      { status: 500 },
    );
  }

  const connection = new Connection(SOLANA_RPC, 'confirmed');
  const streamer   = new PublicKey(profile.solana_wallet);

  // The CasiEscrowClient constructor demands an AnchorWallet. We only need it
  // to build the instruction — the session key signs and sends the tx
  // ourselves below. Pass a minimal wallet shim backed by the session keypair.
  // Minimal AnchorWallet shim. We only call `.buildStartBeamDelegatedIx()`
  // which bottoms out at `.instruction()` — neither path actually invokes
  // signTransaction through Anchor. The shim exists to satisfy the
  // constructor's type guard; the real signing happens below with
  // `sendAndConfirmTransaction([session])`.
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
  // Cast to the broad AnchorWallet shape (which also accepts VersionedTx).
  // We never hand it a versioned tx in practice.
  } as unknown as import('@solana/wallet-adapter-react').AnchorWallet;

  let sig: string;
  try {
    const client = new CasiEscrowClient(
      connection,
      wallet,
      WALLET_ADAPTER_CLUSTER,
    );
    const ix = await client.buildStartBeamDelegatedIx({
      escrowId:   booking.id,
      streamer,
      sessionKey: session.publicKey,
    });

    const tx = new Transaction().add(ix);
    tx.feePayer = session.publicKey;
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;

    // Session key is both fee payer and the `session` signer on the ix —
    // a single signature covers both roles.
    sig = await sendAndConfirmTransaction(connection, tx, [session], {
      commitment: 'confirmed',
      skipPreflight: false,
    });
  } catch (err) {
    // "already processed" / "Transaction simulation failed: This transaction
    // has already been processed" means our webhook-driven DB state is
    // catching up — surface as success to avoid the client retrying.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('already been processed')) {
      logWarn('delegates-start-beam', 'tx already processed — treating as success', {
        booking_id: booking.id,
      });
      return NextResponse.json({ ok: true, alreadyProcessed: true });
    }
    logError('delegates-start-beam', err, { booking_id: booking.id });
    return NextResponse.json(
      { error: 'On-chain start failed', reason: 'chain_error', message: msg },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    signature:  sig,
    solscanUrl: solscanTxUrl(sig, WALLET_ADAPTER_CLUSTER),
  });
}
