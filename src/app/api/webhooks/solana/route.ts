import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { logError, logWarn } from '@/lib/observability';
import { notifyBeam, shouldNotify } from '@/lib/notify';
import {
  parseCasiInstruction,
  type CasiIxKind,
} from '@/lib/casi-escrow-decoder';

/**
 * Helius webhook for CASI on-chain events — authoritative DB writer.
 *
 * Configure the Helius webhook to deliver "enhanced" transactions filtered
 * by account = NEXT_PUBLIC_CASI_PROGRAM_ID, with header
 * `authorization: <HELIUS_WEBHOOK_SECRET>`.
 *
 * For every delivered event we:
 *   1. Verify the shared secret (constant-time compare).
 *   2. Walk both top-level instructions and innerInstructions looking for any
 *      that invoke the CASI program.
 *   3. Match the instruction's first-8-bytes discriminator to a known
 *      instruction name (initialize_escrow / start_beam / settle_beam /
 *      cancel_escrow / approve_flash / deny_flash).
 *   4. Find the booking row by matching any account in the instruction to
 *      `bookings.escrow_pda` — create-solana pre-computes the PDA at insert
 *      time so even the very first initialize_escrow webhook can find the
 *      row.
 *   5. Apply the status transition idempotently with a narrow WHERE clause:
 *      repeated deliveries of the same event are safe; out-of-order arrivals
 *      can't regress state (e.g. a late `initialize_escrow` won't un-start an
 *      already-active beam).
 *
 * Flash DB transitions are deliberately NOT written yet — flashes still go
 * through /api/flashes/attach-escrow and /api/flashes/moderate which already
 * persist status. Phase 1B will fold them in.
 *
 * Always returns 200 so Helius doesn't retry and burn credits. Parse errors
 * and per-event failures are logged via observability but never surfaced.
 */

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const OK = () => NextResponse.json({ ok: true });

type HeliusIx = {
  programId?: string;
  accounts?: string[];
  data?: string;
  innerInstructions?: HeliusIx[];
};

type HeliusEvent = {
  signature?: string;
  timestamp?: number;
  feePayer?: string;
  instructions?: HeliusIx[];
  accountData?: Array<{ account?: string }>;
};

/** Flattens top-level + innerInstructions into one sequence. */
function* walkInstructions(event: HeliusEvent): Generator<HeliusIx> {
  for (const ix of event.instructions ?? []) {
    yield ix;
    for (const inner of ix.innerInstructions ?? []) yield inner;
  }
}

export async function POST(req: Request) {
  const webhookSecret = process.env.HELIUS_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logWarn('solana-webhook', 'HELIUS_WEBHOOK_SECRET is not set — dropping request');
    return OK();
  }
  const authHeader = req.headers.get('authorization') ?? '';
  const a = Buffer.from(authHeader);
  const b = Buffer.from(webhookSecret);
  const valid = a.length === b.length && timingSafeEqual(a, b);
  if (!valid) {
    logWarn('solana-webhook', 'rejected — invalid authorization header');
    return OK();
  }

  const CASI_PROGRAM_ID = process.env.NEXT_PUBLIC_CASI_PROGRAM_ID;
  if (!CASI_PROGRAM_ID || CASI_PROGRAM_ID === '11111111111111111111111111111111') {
    // Program not deployed yet — nothing to observe.
    return OK();
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return OK();
  }
  if (!Array.isArray(body) || body.length === 0) return OK();

  for (const rawEvent of body as HeliusEvent[]) {
    try {
      await processEvent(rawEvent, CASI_PROGRAM_ID);
    } catch (err) {
      logError('solana-webhook', err, { signature: rawEvent?.signature });
    }
  }

  return OK();
}

async function processEvent(event: HeliusEvent, casiProgramId: string): Promise<void> {
  const txSignature = event.signature;
  if (!txSignature) return;

  for (const ix of walkInstructions(event)) {
    const parsed = parseCasiInstruction(ix, casiProgramId);
    if (!parsed) continue;

    // Find the booking by scanning all accounts in this ix against
    // bookings.escrow_pda. PDA is unique per booking so one-per-ix is
    // expected. Scanning accounts (instead of picking a fixed index by
    // instruction kind) insulates us from IDL account-order changes.
    const booking = await findBookingByPdaAccounts(parsed.accounts);
    if (booking) {
      await applyTransition({
        kind: parsed.kind,
        booking,
        txSignature,
        feePayer: event.feePayer,
      });
      continue;
    }

    // No booking matched — could be a Flash (different table), or an escrow
    // this app doesn't know about. Only try the flash lookup for
    // flash-shaped instructions; everything else is a no-op.
    if (FLASH_IX_KINDS.has(parsed.kind)) {
      const flash = await findFlashByPdaAccounts(parsed.accounts);
      if (flash) {
        await applyFlashTransition({ kind: parsed.kind, flash, txSignature });
      }
    }
  }
}

const FLASH_IX_KINDS = new Set<CasiIxKind>([
  'approve_flash',
  'approve_flash_delegated',
  'deny_flash',
  'deny_flash_delegated',
]);

type BookingRow = {
  id: number | string;
  status: string;
  escrow_pda: string;
  tx_signature: string | null;
  viewer_wallet: string | null;
  started_at: string | null;
  image_url: string | null;
  element_id: string | null;
  // Notification fields — present when fetched via findBookingByPdaAccounts.
  profile_id: string | null;
  viewer_name: string | null;
  message: string | null;
  price_value: string | null;
  price_unit: string | null;
  duration_minutes: string | null;
};

async function findBookingByPdaAccounts(accounts: string[]): Promise<BookingRow | null> {
  if (accounts.length === 0) return null;
  const { data, error } = await supabase
    .from('bookings')
    .select('id, status, escrow_pda, tx_signature, viewer_wallet, started_at, image_url, element_id, profile_id, viewer_name, message, price_value, price_unit, duration_minutes')
    .in('escrow_pda', accounts)
    .eq('payment_method', 'solana')
    .limit(1);
  if (error) {
    logError('solana-webhook', error, { scope: 'findBookingByPdaAccounts' });
    return null;
  }
  return data?.[0] ?? null;
}

type TransitionInput = {
  kind: CasiIxKind;
  booking: BookingRow;
  txSignature: string;
  feePayer?: string;
};

async function applyTransition({
  kind,
  booking,
  txSignature,
  feePayer,
}: TransitionInput): Promise<void> {
  switch (kind) {
    case 'initialize_escrow': {
      // Fill in tx_signature + viewer_wallet while the booking is still
      // pending. If the row has already advanced (streamer approved fast,
      // viewer cancelled, etc.) the webhook is late and we leave status
      // alone — we only touch the identity fields.
      const patch: Record<string, unknown> = {};
      if (!booking.tx_signature) patch.tx_signature = txSignature;
      if (!booking.viewer_wallet && feePayer) patch.viewer_wallet = feePayer;
      if (Object.keys(patch).length === 0) return;

      const { error } = await supabase
        .from('bookings')
        .update(patch)
        .eq('id', booking.id);
      if (error) logError('solana-webhook', error, { kind, booking_id: booking.id });
      return;
    }

    case 'start_beam':
    case 'start_beam_delegated': {
      // pending → active. Only advance from pending; never regress or
      // re-stamp started_at if the admin already flipped it. The delegated
      // variant lands here too — on-chain it's identical (flips status to
      // Active, stamps start_timestamp), and we want the same DB + overlay
      // projection regardless of whether the streamer or their session key
      // signed.
      if (booking.status !== 'pending') return;
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'active', started_at: new Date().toISOString() })
        .eq('id', booking.id)
        .eq('status', 'pending');
      if (error) {
        logError('solana-webhook', error, { kind, booking_id: booking.id });
        return;
      }
      // Mirror the beam onto the streamer's canvas. Historically the admin
      // client did this right after signing start_beam; with the webhook now
      // authoritative, the admin's browser can race/fail and leave OBS blank
      // despite DB status='active'. Projection belongs on the server.
      if (booking.element_id && booking.image_url) {
        const { error: elErr } = await supabase
          .from('overlay_elements')
          .update({ image_url: booking.image_url })
          .eq('id', booking.element_id);
        if (elErr) logError('solana-webhook', elErr, { kind, booking_id: booking.id, scope: 'overlay_elements' });
      }

      // Notify: beam is now live on stream (fire-and-forget).
      void (async () => {
        if (!shouldNotify(booking.profile_id)) return;
        try {
          let elementLabel: string | null = null;
          let isBackdrop = false;
          if (booking.element_id) {
            const { data: el } = await supabase
              .from('overlay_elements')
              .select('label, is_background')
              .eq('id', booking.element_id)
              .maybeSingle();
            elementLabel = el?.label ?? null;
            isBackdrop = el?.is_background === true;
          }
          const priceDisplay = booking.price_value
            ? `${booking.price_value} USDC${booking.price_unit === 'per_min' ? '/min' : ''}`
            : null;
          await notifyBeam({
            event: 'started',
            is_backdrop: isBackdrop,
            viewer_name: booking.viewer_name ?? null,
            element_label: elementLabel,
            price_display: priceDisplay,
            duration_minutes: booking.duration_minutes != null ? Number(booking.duration_minutes) : null,
            message: booking.message ?? null,
            payment_method: 'solana',
            booking_id: booking.id,
          });
        } catch {
          // Swallow — notification is never load-bearing.
        }
      })();
      return;
    }

    case 'settle_beam':
    case 'settle_beam_delegated': {
      // Natural end OR early-kick from either party (wallet-signed OR via
      // session-key crank). Either way the escrow is Settled on-chain — flip
      // DB to expired. Only advance from active; a late settle on an
      // already-expired booking is a no-op.
      //
      // Set ended_at so the activity-list proration math knows this row
      // didn't run its full duration. Streamer-driven end-early already
      // writes ended_at directly in endBeamEarly (and short-circuits before
      // this webhook fires), so this branch covers viewer-driven end-early
      // and any cranker / cron settle paths. now() is close enough — webhook
      // lag is single-digit seconds — and accurate to the rounding the
      // proration formula already does.
      if (booking.status !== 'active') return;
      const { error } = await supabase
        .from('bookings')
        .update({
          status:     'expired',
          image_url:  null,
          escrow_pda: null,
          ended_at:   new Date().toISOString(),
        })
        .eq('id', booking.id)
        .eq('status', 'active');
      if (error) {
        logError('solana-webhook', error, { kind, booking_id: booking.id });
        return;
      }
      // Clear the canvas. Match admin's expire path (line 359) which writes
      // empty string rather than null — OBS filters on truthy length.
      if (booking.element_id) {
        const { error: elErr } = await supabase
          .from('overlay_elements')
          .update({ image_url: '' })
          .eq('id', booking.element_id);
        if (elErr) logError('solana-webhook', elErr, { kind, booking_id: booking.id, scope: 'overlay_elements' });
      }
      return;
    }

    case 'cancel_escrow':
    case 'cancel_stale_pending': {
      // Viewer cancelled a pending escrow (or the permissionless timeout
      // crank fired) → refund on chain, PDA closed. The streamer may have
      // already flipped DB status to 'denied' (admin deny while Pending),
      // OR the booking may have been streamer-approved into the queue
      // ('approved_queued') with the escrow staying Pending on-chain
      // until the slot frees up. All three lifecycle stops resolve to
      // 'denied' once the on-chain refund lands; null the stale PDA
      // pointer in every case so the admin's stuck-escrows panel and
      // the viewer's recover-USDC chip stop misclassifying the row.
      // A cancel against an active escrow is impossible per the program.
      if (
        booking.status !== 'pending' &&
        booking.status !== 'denied' &&
        booking.status !== 'approved_queued'
      ) return;
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'denied', escrow_pda: null })
        .eq('id', booking.id)
        .in('status', ['pending', 'denied', 'approved_queued']);
      if (error) logError('solana-webhook', error, { kind, booking_id: booking.id });
      return;
    }

    case 'approve_flash':
    case 'approve_flash_delegated':
    case 'deny_flash':
    case 'deny_flash_delegated':
      // Flash transitions run on a parallel path (applyFlashTransition)
      // because the row lives in `flashes`, not `bookings`. If execution
      // reaches this branch it means a flash-shaped instruction landed
      // with a booking.escrow_pda match — treat as a no-op so a foreign
      // tx can't scribble on an unrelated booking.
      return;

    case 'set_delegate':
    case 'revoke_delegate':
      // Delegate lifecycle lives in streamer_delegates (written by
      // /api/solana/delegates/*); we don't mirror it onto bookings.
      return;
  }
}

type FlashRow = {
  id: string;
  status: string;
  escrow_pda: string;
};

async function findFlashByPdaAccounts(accounts: string[]): Promise<FlashRow | null> {
  if (accounts.length === 0) return null;
  const { data, error } = await supabase
    .from('flashes')
    .select('id, status, escrow_pda')
    .in('escrow_pda', accounts)
    .eq('payment_method', 'solana')
    .limit(1);
  if (error) {
    logError('solana-webhook', error, { scope: 'findFlashByPdaAccounts' });
    return null;
  }
  return data?.[0] ?? null;
}

async function applyFlashTransition({
  kind,
  flash,
}: {
  kind: CasiIxKind;
  flash: FlashRow;
  txSignature: string;
}): Promise<void> {
  // Both wallet-signed and delegate-signed paths land here. Only advance
  // from 'pending'; never regress a row that /api/flashes/moderate has
  // already flipped via its tx_signature verification (races are OK —
  // first writer wins via the status=pending WHERE clause).
  if (flash.status !== 'pending') return;

  const nextStatus =
    kind === 'approve_flash' || kind === 'approve_flash_delegated'
      ? 'approved'
      : 'denied';

  const { error } = await supabase
    .from('flashes')
    .update({ status: nextStatus })
    .eq('id', flash.id)
    .eq('status', 'pending');
  if (error) logError('solana-webhook', error, { kind, flash_id: flash.id });
}
