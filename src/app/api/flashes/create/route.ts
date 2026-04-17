/**
 * POST /api/flashes/create
 *
 * Creates a pending flash row and returns the on-ramp for the viewer.
 *
 *   stripe  → { checkout_url, flash_id }        — redirect to Stripe Checkout
 *   solana  → { flash_id, solana_wallet }       — client broadcasts initialize_escrow
 *   free    → { flash_id }                      — no payment, rate-limited server-side
 *
 * Free flashes are gated by:
 *   1. profile.allow_free_flashes = true on the target streamer
 *   2. 1 flash per minute per (streamer, viewer_key) where viewer_key is
 *      auth user id when present, otherwise sha256(ip).
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { stripe } from '@/lib/stripe';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FREE_FLASH_COOLDOWN_MS = 60_000;

type PaymentMethod = 'stripe' | 'solana' | 'free';

/**
 * Returns the hop closest to our server (last entry in x-forwarded-for).
 * A client CAN prepend x-forwarded-for, so trusting the first entry lets a
 * viewer spoof a fresh IP per request and bypass the free-flash cooldown.
 * Vercel/Cloudflare/nginx all append the real peer as the rightmost value.
 */
function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const last = fwd.split(',').pop()?.trim();
    if (last) return last;
  }
  return req.headers.get('x-real-ip') || 'unknown';
}

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

async function resolveViewerKey(req: Request): Promise<string> {
  const auth = req.headers.get('Authorization');
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (user) return `u:${user.id}`;
  }
  return `ip:${hashIp(getClientIp(req))}`;
}

/** Atomic upsert-with-cooldown — returns true if the send is allowed. */
async function claimFreeFlashSlot(streamerId: string, viewerKey: string): Promise<boolean> {
  const { data: existing } = await supabase
    .from('free_flash_rate_limits')
    .select('last_sent_at')
    .eq('streamer_id', streamerId)
    .eq('viewer_key', viewerKey)
    .maybeSingle();

  if (existing?.last_sent_at) {
    const elapsed = Date.now() - new Date(existing.last_sent_at).getTime();
    if (elapsed < FREE_FLASH_COOLDOWN_MS) return false;
  }

  const { error } = await supabase
    .from('free_flash_rate_limits')
    .upsert(
      { streamer_id: streamerId, viewer_key: viewerKey, last_sent_at: new Date().toISOString() },
      { onConflict: 'streamer_id,viewer_key' },
    );
  if (error) {
    console.error('[flashes/create] rate-limit upsert failed:', error);
    return false;
  }
  return true;
}

export async function POST(req: Request) {
  const { profile_id, viewer_name, message, amount_cents, payment_method } = await req.json();

  if (!profile_id || !viewer_name || !message) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (message.trim().length === 0) {
    return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
  }

  const method: PaymentMethod = (payment_method as PaymentMethod) || 'stripe';
  if (!['stripe', 'solana', 'free'].includes(method)) {
    return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 });
  }

  if (method !== 'free' && (!amount_cents || amount_cents < 100)) {
    return NextResponse.json({ error: 'Minimum flash amount is €1.00' }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_account_id, username, solana_wallet, allow_free_flashes')
    .eq('id', profile_id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Streamer not found' }, { status: 404 });
  }

  // ── Free branch ────────────────────────────────────────────────────────────
  if (method === 'free') {
    if (!profile.allow_free_flashes) {
      return NextResponse.json({ error: 'Free flashes are disabled for this streamer' }, { status: 403 });
    }
    const viewerKey = await resolveViewerKey(req);
    const allowed = await claimFreeFlashSlot(profile_id, viewerKey);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Slow down — you can only send one free flash per minute.' },
        { status: 429 },
      );
    }

    const { data: flash, error: insertErr } = await supabase
      .from('flashes')
      .insert({
        profile_id,
        viewer_name,
        message: message.trim(),
        amount_cents: 0,
        currency: 'eur',
        status: 'pending',
        payment_method: 'free',
      })
      .select('id')
      .single();

    if (insertErr || !flash) {
      console.error('[flashes/create] free insert failed:', insertErr);
      return NextResponse.json({ error: 'Failed to create flash' }, { status: 500 });
    }
    return NextResponse.json({ flash_id: flash.id });
  }

  // ── Paid branches (stripe / solana) ────────────────────────────────────────
  const { data: flash, error: flashError } = await supabase
    .from('flashes')
    .insert({
      profile_id,
      viewer_name,
      message: message.trim(),
      amount_cents,
      currency: 'eur',
      status: 'pending',
      payment_method: method,
    })
    .select()
    .single();

  if (flashError || !flash) {
    console.error('[flashes/create] Insert failed:', flashError);
    return NextResponse.json({ error: 'Failed to create flash' }, { status: 500 });
  }

  if (method === 'solana') {
    return NextResponse.json({
      flash_id: flash.id,
      solana_wallet: profile.solana_wallet ?? null,
    });
  }

  // Stripe — create Checkout session with manual capture
  if (!profile.stripe_account_id) {
    await supabase.from('flashes').delete().eq('id', flash.id);
    return NextResponse.json({ error: 'Streamer has no Stripe account connected' }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const truncatedMsg = message.trim().length > 100
    ? message.trim().slice(0, 97) + '…'
    : message.trim();

  // Direct Charge on the streamer's connected account, zero platform fee.
  // SaaS tier is the revenue source — see stripe/authorize/route.ts.
  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      payment_intent_data: {
        capture_method: 'manual',
      },
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `⚡ Flash to @${profile.username}`,
              description: truncatedMsg,
            },
            unit_amount: amount_cents,
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/overlay?s=${profile.username}&flash_success=1&flash_id=${flash.id}`,
      cancel_url:  `${appUrl}/overlay?s=${profile.username}&flash_cancelled=1&flash_id=${flash.id}`,
      metadata: { flash_id: flash.id },
    },
    { stripeAccount: profile.stripe_account_id },
  );

  return NextResponse.json({ checkout_url: session.url, flash_id: flash.id });
}
