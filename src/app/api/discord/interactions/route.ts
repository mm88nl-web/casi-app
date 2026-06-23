/**
 * POST /api/discord/interactions
 *
 * Discord Interactions endpoint — handles button clicks (Approve / Deny)
 * from the casi-monitor bot's notification messages.
 *
 * Setup (one-time, must be done in Discord Developer Portal):
 *   https://discord.com/developers/applications/1518891620550967367
 *   → General Information → Interactions Endpoint URL
 *   → paste: https://www.casi.gg/api/discord/interactions
 *
 * Required env vars:
 *   DISCORD_PUBLIC_KEY   — from the Developer Portal "Public Key" field
 *   DISCORD_BOT_TOKEN    — bot token (used to update messages after action)
 *
 * Button custom_id format: "{verb}_{kind}:{entity_id}"
 *   e.g. "approve_booking:42"  "deny_flash:uuid"
 *
 * Supported:
 *   Free bookings    — approve (flip active, project image) / deny
 *   Stripe bookings  — approve (capture PI, flip active) / deny (cancel PI)
 *   Free flashes     — approve / deny
 *   Stripe flashes   — approve (capture PI) / deny (cancel PI)
 *   Solana bookings  — delegate approve via cranker if installed; else studio link
 *   Solana flashes   — delegate approve/deny if installed; else studio link
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse }  from 'next/server';
import { createClient }  from '@supabase/supabase-js';
import { webcrypto }     from 'node:crypto';
import { stripe }        from '@/lib/stripe';
import { logError }      from '@/lib/observability';
// Solana delegate routes require a user session (auth'd client). From the
// interaction handler we only have a service-role client, so Solana actions
// redirect to studio instead. Phase 2: add an internal-secret bypass to the
// delegate routes so the interaction handler can call them directly.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY ?? '';
const BOT_TOKEN          = process.env.DISCORD_BOT_TOKEN  ?? '';
const ALLOWED_GUILD      = '1502624105634074644';
const APP_URL            = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.casi.gg';

// Discord embed colours
const GREEN  = 0x57F287;
const RED    = 0xED4245;
const ORANGE = 0xF58220;
const GREY   = 0x4E5058;

// ── Signature verification ─────────────────────────────────────────────────────

function hexToU8(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function verifySignature(sig: string, ts: string, body: string): Promise<boolean> {
  if (!DISCORD_PUBLIC_KEY) return false;
  try {
    const key = await webcrypto.subtle.importKey(
      'raw',
      hexToU8(DISCORD_PUBLIC_KEY),
      { name: 'Ed25519', namedCurve: 'Ed25519' } as AlgorithmIdentifier,
      false,
      ['verify'],
    );
    return await webcrypto.subtle.verify(
      'Ed25519',
      key,
      hexToU8(sig),
      new TextEncoder().encode(ts + body),
    );
  } catch { return false; }
}

// ── Response helpers ───────────────────────────────────────────────────────────

type Embed = Record<string, unknown>;

/** type 7 — update the message that contained the button */
function updateMsg(embeds: Embed[], components: unknown[] = []) {
  return NextResponse.json({ type: 7, data: { embeds, components } });
}

/** type 4 ephemeral — only the clicker sees it, original message unchanged */
function ephemeral(content: string) {
  return NextResponse.json({ type: 4, data: { content, flags: 64 } });
}

function studioLink() {
  return [{
    type: 1,
    components: [{ type: 2, style: 5, label: '→ Open Studio', url: `${APP_URL}/studio/live` }],
  }];
}

// ── Main handler ───────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  if (!DISCORD_PUBLIC_KEY) {
    logError('discord/interactions', new Error('DISCORD_PUBLIC_KEY not set'), {});
    return new Response('Not configured', { status: 500 });
  }

  const sig  = req.headers.get('x-signature-ed25519')  ?? '';
  const ts   = req.headers.get('x-signature-timestamp') ?? '';
  const body = await req.text();

  if (!await verifySignature(sig, ts, body)) {
    return new Response('Invalid signature', { status: 401 });
  }

  const ix = JSON.parse(body);

  // PING — Discord verifies the endpoint is live
  if (ix.type === 1) return NextResponse.json({ type: 1 });

  // Message Component interaction (button click)
  if (ix.type === 3) {
    if (ix.guild_id !== ALLOWED_GUILD) return ephemeral('⛔ Unauthorized guild.');

    const customId: string = ix.data?.custom_id ?? '';
    const colon = customId.lastIndexOf(':');
    const action   = customId.slice(0, colon);     // e.g. 'approve_booking'
    const entityId = customId.slice(colon + 1);    // e.g. '42' or UUID

    const underscore = action.indexOf('_');
    const verb = action.slice(0, underscore) as 'approve' | 'deny';   // 'approve' | 'deny'
    const kind = action.slice(underscore + 1) as 'booking' | 'flash'; // 'booking' | 'flash'

    if (!verb || !kind || !entityId) return ephemeral('⚠️ Unknown action.');

    const originalEmbed: Embed = ix.message?.embeds?.[0] ?? {};

    if (kind === 'booking') return bookingAction(verb, entityId, originalEmbed);
    if (kind === 'flash')   return flashAction(verb, entityId, originalEmbed);
    return ephemeral('⚠️ Unknown entity type.');
  }

  return NextResponse.json({ type: 1 });
}

// ── Booking moderation ─────────────────────────────────────────────────────────

async function bookingAction(
  verb: 'approve' | 'deny',
  id: string,
  orig: Embed,
): Promise<NextResponse> {
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('id, status, payment_method, payment_intent_id, element_id, image_url, profile_id')
    .eq('id', id)
    .single();

  if (error || !booking) {
    return updateMsg([{ ...orig, color: RED, footer: { text: '⚠️ Booking not found.' } }]);
  }
  if (booking.status !== 'pending') {
    const statusLabels: Record<string, string> = { active: 'already live', approved_queued: 'queued', denied: 'denied', expired: 'expired' };
    const label = statusLabels[booking.status] ?? booking.status;
    return updateMsg([{ ...orig, color: GREY, footer: { text: `ℹ️ Booking ${label} — no action taken.` } }]);
  }

  return verb === 'approve' ? approveBooking(booking, orig) : denyBooking(booking, orig);
}

async function approveBooking(booking: Record<string, any>, orig: Embed): Promise<NextResponse> {
  const { id, payment_method, payment_intent_id, element_id, image_url, profile_id } = booking;

  // ── Solana: needs on-chain signing — send to studio ───────────────────────
  if (payment_method === 'solana') {
    return updateMsg(
      [{ ...orig, color: ORANGE, footer: { text: '🔑 Solana beam — approve from studio (wallet or delegate)' } }],
      studioLink(),
    );
  }

  // ── Stripe: capture the payment intent ────────────────────────────────────
  if (payment_method === 'stripe') {
    if (!payment_intent_id) {
      return updateMsg([{ ...orig, color: RED, footer: { text: '⚠️ No payment intent — cannot approve.' } }]);
    }
    try {
      const { data: prof } = await supabase.from('profiles').select('stripe_account_id').eq('id', profile_id).single();
      await stripe.paymentIntents.capture(
        payment_intent_id,
        {},
        { stripeAccount: prof?.stripe_account_id },
      );
    } catch (err: any) {
      logError('discord/interactions', err, { booking_id: id, action: 'approve_stripe' });
      return updateMsg([{ ...orig, color: RED, footer: { text: `⚠️ Stripe error: ${err?.message ?? 'unknown'}` } }]);
    }
  }

  // ── DB: check if slot is occupied; queue if so ────────────────────────────
  let nextStatus: 'active' | 'approved_queued' = 'active';
  if (element_id) {
    const { data: active } = await supabase
      .from('bookings')
      .select('id')
      .eq('element_id', element_id)
      .eq('status', 'active')
      .limit(1);
    if (active && active.length > 0) nextStatus = 'approved_queued';
  }

  const patch: Record<string, unknown> = { status: nextStatus };
  if (nextStatus === 'active') patch.started_at = new Date().toISOString();

  const { error: updErr } = await supabase.from('bookings')
    .update(patch).eq('id', id).eq('status', 'pending');

  if (updErr) {
    logError('discord/interactions', updErr, { booking_id: id, action: 'approve_db' });
    return updateMsg([{ ...orig, color: RED, footer: { text: '⚠️ DB update failed.' } }]);
  }

  // Project image onto the overlay element (skip if queued — not live yet)
  if (nextStatus === 'active' && element_id && image_url) {
    await supabase.from('overlay_elements').update({ image_url }).eq('id', element_id);
  }

  const label = nextStatus === 'active' ? '✅ Approved' : '✅ Approved (queued — slot busy)';
  return updateMsg([{
    ...orig, color: GREEN,
    footer: { text: `${label} via Discord · ${new Date().toUTCString()}` },
  }]);
}

async function denyBooking(booking: Record<string, any>, orig: Embed): Promise<NextResponse> {
  const { id, payment_method, payment_intent_id, profile_id } = booking;

  if (payment_method === 'solana') {
    // Pending Solana escrow: only the viewer (or the 7-day crank) can refund.
    // Just flip DB; viewer's overlay chip will show "recover USDC".
    await supabase.from('bookings').update({ status: 'denied' }).eq('id', id).eq('status', 'pending');
    return updateMsg(
      [{ ...orig, color: RED, footer: { text: '❌ Denied in DB. Viewer can recover USDC via overlay.' } }],
    );
  }

  if (payment_method === 'stripe' && payment_intent_id) {
    try {
      const { data: prof } = await supabase.from('profiles').select('stripe_account_id').eq('id', profile_id).single();
      await stripe.paymentIntents.cancel(
        payment_intent_id,
        {},
        { stripeAccount: prof?.stripe_account_id },
      );
    } catch (err: any) {
      logError('discord/interactions', err, { booking_id: id, action: 'deny_stripe' });
      // Log but continue — still flip DB status
    }
  }

  const { error } = await supabase.from('bookings')
    .update({ status: 'denied' }).eq('id', id).eq('status', 'pending');

  if (error) {
    logError('discord/interactions', error, { booking_id: id, action: 'deny_db' });
    return updateMsg([{ ...orig, color: RED, footer: { text: '⚠️ DB update failed.' } }]);
  }

  return updateMsg([{
    ...orig, color: RED,
    footer: { text: `❌ Denied via Discord · ${new Date().toUTCString()}` },
  }]);
}

// ── Flash moderation ───────────────────────────────────────────────────────────

async function flashAction(
  verb: 'approve' | 'deny',
  id: string,
  orig: Embed,
): Promise<NextResponse> {
  const { data: flash, error } = await supabase
    .from('flashes')
    .select('id, status, payment_method, payment_intent_id, profile_id, escrow_pda, viewer_wallet')
    .eq('id', id)
    .single();

  if (error || !flash) {
    return updateMsg([{ ...orig, color: RED, footer: { text: '⚠️ Flash not found.' } }]);
  }
  if (flash.status !== 'pending') {
    return updateMsg([{ ...orig, color: GREY, footer: { text: `ℹ️ Flash already ${flash.status}.` } }]);
  }

  // ── Solana: needs on-chain signing — send to studio ───────────────────────
  if (flash.payment_method === 'solana') {
    return updateMsg(
      [{ ...orig, color: ORANGE, footer: { text: '🔑 Solana flash — approve from studio (wallet or delegate)' } }],
      studioLink(),
    );
  }

  // ── Stripe: capture or cancel PI ──────────────────────────────────────────
  if (flash.payment_method === 'stripe' && flash.payment_intent_id) {
    try {
      const { data: prof } = await supabase.from('profiles').select('stripe_account_id').eq('id', flash.profile_id).single();
      if (verb === 'approve') {
        await stripe.paymentIntents.capture(flash.payment_intent_id, {}, { stripeAccount: prof?.stripe_account_id });
      } else {
        await stripe.paymentIntents.cancel(flash.payment_intent_id, {}, { stripeAccount: prof?.stripe_account_id });
      }
    } catch (err: any) {
      logError('discord/interactions', err, { flash_id: id, action: `${verb}_stripe` });
      if (verb === 'approve') {
        return updateMsg([{ ...orig, color: RED, footer: { text: `⚠️ Stripe error: ${err?.message ?? 'unknown'}` } }]);
      }
    }
  }

  const nextStatus = verb === 'approve' ? 'approved' : 'denied';
  const { error: updErr } = await supabase.from('flashes')
    .update({ status: nextStatus }).eq('id', id).eq('status', 'pending');

  if (updErr) {
    logError('discord/interactions', updErr, { flash_id: id, action: `${verb}_db` });
    return updateMsg([{ ...orig, color: RED, footer: { text: '⚠️ DB update failed.' } }]);
  }

  const label = verb === 'approve' ? '✅ Approved' : '❌ Denied';
  return updateMsg([{
    ...orig,
    color: verb === 'approve' ? GREEN : RED,
    footer: { text: `${label} via Discord · ${new Date().toUTCString()}` },
  }]);
}
