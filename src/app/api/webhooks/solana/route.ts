import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { logError, logWarn } from '@/lib/observability';
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
    if (!booking) {
      // No DB row matches. Either the webhook fired for an escrow we don't
      // know about (foreign client, replay from dev) or create-solana hasn't
      // committed yet. The daily reconciler will catch genuine misses.
      continue;
    }

    await applyTransition({
      kind: parsed.kind,
      booking,
      txSignature,
      feePayer: event.feePayer,
    });
  }
}

type BookingRow = {
  id: number | string;
  status: string;
  escrow_pda: string;
  tx_signature: string | null;
  viewer_wallet: string | null;
  started_at: string | null;
};

async function findBookingByPdaAccounts(accounts: string[]): Promise<BookingRow | null> {
  if (accounts.length === 0) return null;
  const { data, error } = await supabase
    .from('bookings')
    .select('id, status, escrow_pda, tx_signature, viewer_wallet, started_at')
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

    case 'start_beam': {
      // pending → active. Only advance from pending; never regress or
      // re-stamp started_at if the admin already flipped it.
      if (booking.status !== 'pending') return;
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'active', started_at: new Date().toISOString() })
        .eq('id', booking.id)
        .eq('status', 'pending');
      if (error) logError('solana-webhook', error, { kind, booking_id: booking.id });
      return;
    }

    case 'settle_beam': {
      // Natural end OR early-kick from either party. Either way the escrow
      // is Settled on-chain — flip DB to expired. Only advance from active;
      // a late settle on an already-expired booking is a no-op.
      if (booking.status !== 'active') return;
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'expired', image_url: null })
        .eq('id', booking.id)
        .eq('status', 'active');
      if (error) logError('solana-webhook', error, { kind, booking_id: booking.id });
      return;
    }

    case 'cancel_escrow': {
      // Viewer cancelled a pending escrow → refund on chain, DB → denied.
      // Only from pending; a cancel against an active escrow is impossible
      // per the program, so this branch should never run on an active row.
      if (booking.status !== 'pending') return;
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'denied' })
        .eq('id', booking.id)
        .eq('status', 'pending');
      if (error) logError('solana-webhook', error, { kind, booking_id: booking.id });
      return;
    }

    case 'approve_flash':
    case 'deny_flash':
      // Flashes are written by /api/flashes/attach-escrow + moderate.
      // Phase 1B will route them through here too; for now, no-op.
      return;
  }
}
