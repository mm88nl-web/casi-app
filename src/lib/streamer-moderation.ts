/**
 * Streamer-side moderation for booked beams — approve and reject handlers
 * split out of admin/page.tsx so /studio can reuse the same flow without
 * duplicating the Stripe / Solana branches.
 *
 * Flash moderation is NOT here yet — it goes through /api/flashes/moderate
 * with an on-chain approve_flash / deny_flash transaction (see
 * admin/page.tsx moderateSolanaFlash). Porting that is a follow-up.
 *
 * Approve decision tree:
 *   slot already occupied or booking.is_queued
 *     → DB status='approved_queued'. Program beam starts later when
 *       the slot frees up (admin's playNow handler takes care of that).
 *   otherwise
 *     → startSolanaBeamOnChain (solana rail only; stripe is a no-op).
 *       Then DB status='active', started_at=now(), copy image_url onto
 *       the overlay_elements row.
 *
 * Reject decision tree (matches admin denyBooking):
 *   payment_method === 'solana'
 *     → probe the escrow PDA. Pending state: DB 'denied' + leave PDA so
 *       the viewer can cancel_escrow. Active state: call settle_beam via
 *       delegate first, wallet-signed on fallback. Settled or already-
 *       closed: DB 'denied' + clear escrow_pda.
 *   otherwise (stripe)
 *     → POST /api/stripe/cancel. Server cancels the PaymentIntent +
 *       flips DB status.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

export type ModerationResult =
  | { ok: true; optimistic?: 'active' | 'approved_queued' | 'denied' }
  | { ok: false; message: string };

export type BookingLike = {
  id: string | number;
  element_id?: string | null;
  is_queued?: boolean | null;
  payment_method?: string | null;
  image_url?: string | null;
  escrow_pda?: string | null;
  viewer_wallet?: string | null;
};

export type WalletSigner = {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions?<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
};

export type ModerationContext = {
  supabase: SupabaseClient;
  connection: Connection;
  /** Profile of the streamer logged in on this session. */
  profile: { id: string; solana_wallet: string | null };
  /** Active bookings for this streamer — used to decide queue vs. direct start. */
  activeBookings: Array<{ element_id: string | null }>;
  /** Wallet-adapter sign hooks. Null if the user hasn't connected a wallet. */
  wallet: WalletSigner | null;
  cluster: 'devnet' | 'mainnet-beta';
};

export async function approveBooking(
  ctx: ModerationContext,
  booking: BookingLike,
): Promise<ModerationResult> {
  const slotOccupied =
    !!booking.element_id && ctx.activeBookings.some((b) => b.element_id === booking.element_id);

  if (slotOccupied || booking.is_queued) {
    // Queued branch: the beam stays un-started on-chain until the current
    // slot holder finishes. DB status just records the streamer OK'd it.
    const { error } = await ctx.supabase
      .from('bookings')
      .update({ status: 'approved_queued', approved_at: new Date().toISOString() })
      .eq('id', booking.id);
    if (error) return { ok: false, message: error.message };
    return { ok: true, optimistic: 'approved_queued' };
  }

  // Direct branch: beam goes live. For solana we MUST start the on-chain
  // beam BEFORE flipping DB status so the vesting clock and the UI
  // countdown stay in lockstep. A failed chain call leaves the row
  // 'pending' so the streamer can retry.
  if (booking.payment_method === 'solana') {
    const chainResult = await startSolanaBeamOnChain(ctx, booking);
    if (!chainResult.ok) return chainResult;
  }

  const updates = await Promise.all([
    ctx.supabase
      .from('bookings')
      .update({ status: 'active', started_at: new Date().toISOString() })
      .eq('id', booking.id),
    booking.element_id && booking.image_url
      ? ctx.supabase
          .from('overlay_elements')
          .update({ image_url: booking.image_url })
          .eq('id', booking.element_id)
      : Promise.resolve({ error: null }),
  ]);
  for (const { error } of updates) {
    if (error) return { ok: false, message: error.message };
  }
  return { ok: true, optimistic: 'active' };
}

export async function denyBooking(
  ctx: ModerationContext,
  bookingId: string,
  paymentMethod: string | null | undefined,
): Promise<ModerationResult> {
  if (paymentMethod === 'solana') {
    // Fetch the escrow fields fresh — they may have changed since the row
    // was rendered (viewer reclaim, crank refund).
    const { data: b } = await ctx.supabase
      .from('bookings')
      .select('id, escrow_pda, viewer_wallet, status')
      .eq('id', bookingId)
      .single();

    const settleOutcome = b?.escrow_pda
      ? await settleOrClearSolanaEscrow(ctx, b as BookingLike)
      : { outcome: 'closed' as const };

    if (settleOutcome.outcome === 'no-wallet') {
      return { ok: false, message: 'Connect your streamer wallet to deny this beam.' };
    }
    if (settleOutcome.outcome === 'error') {
      return { ok: false, message: 'Could not settle escrow on-chain. Beam stays live — retry later.' };
    }

    const update: Record<string, unknown> = { status: 'denied' };
    if (settleOutcome.outcome === 'settled' || settleOutcome.outcome === 'closed') {
      update.escrow_pda = null;
    }
    const { error } = await ctx.supabase.from('bookings').update(update).eq('id', bookingId);
    if (error) return { ok: false, message: error.message };
    return { ok: true, optimistic: 'denied' };
  }

  // Stripe rail: let the server cancel the PaymentIntent and flip status.
  const { data: { session } } = await ctx.supabase.auth.getSession();
  const res = await fetch('/api/stripe/cancel', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ booking_id: bookingId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, message: body?.error || `Stripe cancel failed (${res.status}).` };
  }
  return { ok: true, optimistic: 'denied' };
}

/* ──────────────────────────────────────────────────────────────────────────
   Internals — mirror admin/page.tsx's startSolanaBeamOnChain and
   settleOrClearSolanaEscrow. Kept here (rather than in @/lib/casi-escrow)
   because they blend web3 signing with Supabase session calls.
   ────────────────────────────────────────────────────────────────────────── */

async function startSolanaBeamOnChain(
  ctx: ModerationContext,
  booking: BookingLike,
): Promise<ModerationResult> {
  if (booking.payment_method !== 'solana') return { ok: true };
  if (!booking.escrow_pda) {
    // No escrow = viewer paid via stripe but row mis-flagged, or attach-escrow
    // failed. Skip chain work; DB flip is still safe.
    return { ok: true };
  }

  // Prefer the server-held session-key delegate. The route rejects with a
  // known reason if the delegate is missing / expired / revoked / cranker
  // unfunded; we tolerate any non-200 and fall through to wallet signing.
  try {
    const { data: { session } } = await ctx.supabase.auth.getSession();
    if (session?.access_token) {
      const res = await fetch('/api/solana/delegates/start-beam', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ booking_id: booking.id }),
      });
      if (res.ok) return { ok: true };
    }
  } catch (err) {
    console.warn('[studio-moderation] delegate start-beam failed, falling back to wallet', err);
  }

  if (!ctx.wallet) {
    return { ok: false, message: 'Connect your streamer wallet to approve this beam.' };
  }
  if (ctx.profile.solana_wallet && ctx.wallet.publicKey.toBase58() !== ctx.profile.solana_wallet) {
    return { ok: false, message: 'Connected wallet does not match the streamer wallet on file.' };
  }

  try {
    const { CasiEscrowClient } = await import('@/lib/casi-escrow');
    const anchorWallet = {
      publicKey: ctx.wallet.publicKey,
      signTransaction: ctx.wallet.signTransaction,
      signAllTransactions:
        ctx.wallet.signAllTransactions ||
        (async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
          const out: T[] = [];
          for (const tx of txs) out.push(await ctx.wallet!.signTransaction(tx));
          return out;
        }),
    };
    const client = new CasiEscrowClient(ctx.connection, anchorWallet as never, ctx.cluster);
    await client.startBeam({ escrowId: booking.id, streamer: ctx.wallet.publicKey });
    return { ok: true };
  } catch (err) {
    const { formatEscrowError } = await import('@/lib/casi-errors');
    return { ok: false, message: formatEscrowError(err) };
  }
}

type SettleOutcome =
  | { outcome: 'settled' | 'closed' | 'pending-chain' | 'no-wallet' }
  | { outcome: 'error'; error: unknown };

async function settleOrClearSolanaEscrow(
  ctx: ModerationContext,
  booking: BookingLike,
): Promise<SettleOutcome> {
  if (!booking.escrow_pda) return { outcome: 'closed' };

  const { PublicKey } = await import('@solana/web3.js');
  const pdaInfo = await ctx.connection
    .getAccountInfo(new PublicKey(booking.escrow_pda))
    .catch(() => null);
  if (!pdaInfo) return { outcome: 'closed' };

  // Status byte at offset 161 of EscrowState; see programs/casi-escrow/src/lib.rs.
  if (pdaInfo.data[161] === 0) return { outcome: 'pending-chain' };

  // Try the delegated crank first — no wallet popup if a healthy session
  // key is installed.
  try {
    const { data: { session } } = await ctx.supabase.auth.getSession();
    if (session?.access_token) {
      const res = await fetch('/api/solana/delegates/settle-beam', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ booking_id: booking.id }),
      });
      if (res.ok) return { outcome: 'settled' };
    }
  } catch (err) {
    console.warn('[studio-moderation] delegate settle-beam failed, falling back to wallet', err);
  }

  if (!ctx.wallet || !booking.viewer_wallet) return { outcome: 'no-wallet' };
  if (ctx.profile.solana_wallet && ctx.wallet.publicKey.toBase58() !== ctx.profile.solana_wallet) {
    return { outcome: 'no-wallet' };
  }

  try {
    const { CasiEscrowClient } = await import('@/lib/casi-escrow');
    const anchorWallet = {
      publicKey: ctx.wallet.publicKey,
      signTransaction: ctx.wallet.signTransaction,
      signAllTransactions:
        ctx.wallet.signAllTransactions ||
        (async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
          const out: T[] = [];
          for (const tx of txs) out.push(await ctx.wallet!.signTransaction(tx));
          return out;
        }),
    };
    const client = new CasiEscrowClient(ctx.connection, anchorWallet as never, ctx.cluster);
    await client.settleBeam({
      escrowId: booking.id,
      viewer: new PublicKey(booking.viewer_wallet),
      streamer: ctx.wallet.publicKey,
    });
    return { outcome: 'settled' };
  } catch (err) {
    const { parseCasiError, isAlreadyProcessed } = await import('@/lib/casi-errors');
    if (parseCasiError(err) === 'NotActive') return { outcome: 'pending-chain' };
    if (isAlreadyProcessed(err)) return { outcome: 'settled' };
    return { outcome: 'error', error: err };
  }
}
