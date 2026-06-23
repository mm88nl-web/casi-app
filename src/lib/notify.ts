/**
 * Business event notifications → Discord (DISCORD_NOTIFY_WEBHOOK_URL).
 *
 * Separate from ERROR_WEBHOOK_URL, which is for alerts. This channel gets
 * sales signals: beam purchases and beam start events. All functions are
 * fire-and-forget — they swallow errors internally and never block the
 * caller's response path.
 *
 * Set DISCORD_NOTIFY_WEBHOOK_URL in Vercel env to a dedicated events channel.
 * If the var is absent all calls are silent no-ops.
 */

const CASI_ORANGE = 0xF58220;

/**
 * Returns true if this profile_id should trigger a notification.
 *
 * Set DISCORD_NOTIFY_PROFILE_ID in Vercel env to your Supabase profile UUID.
 * When set, only events on that profile fire — other streamers' purchases are
 * silently ignored. When unset, all profiles fire (useful in a solo instance).
 */
export function shouldNotify(profileId: string | null | undefined): boolean {
  const own = process.env.DISCORD_NOTIFY_PROFILE_ID;
  if (!own) return true;
  return profileId === own;
}

// Stripe (and most payment processors) use zero-decimal representation for
// these currencies — amount_total is already in the major unit, not cents.
const ZERO_DECIMAL_CURRENCIES = new Set([
  'jpy', 'krw', 'bif', 'clp', 'djf', 'gnf', 'kmf', 'mga',
  'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

/** Format a Stripe amount_total (smallest currency unit) as a human string. */
export function formatStripeAmount(amountTotal: number, currency: string): string {
  const c = currency.toLowerCase();
  const major = ZERO_DECIMAL_CURRENCIES.has(c)
    ? amountTotal
    : amountTotal / 100;
  const decimals = ZERO_DECIMAL_CURRENCIES.has(c) ? 0 : 2;
  return `${major.toFixed(decimals)} ${currency.toUpperCase()}`;
}

function trunc(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

export interface FlashNotifyInput {
  viewer_name?: string | null;
  message?: string | null;
  /** Pre-formatted amount string, e.g. "5.00 USD" or "5 USDC" or "free" */
  amount_display?: string | null;
  payment_method?: string | null;
  flash_id?: string | null;
}

export async function notifyFlash(input: FlashNotifyInput): Promise<void> {
  const url = process.env.DISCORD_NOTIFY_WEBHOOK_URL;
  if (!url) return;

  type DiscordField = { name: string; value: string; inline?: boolean };
  const fields: DiscordField[] = [];

  if (input.viewer_name)   fields.push({ name: 'From',    value: trunc(input.viewer_name, 256),  inline: true });
  if (input.amount_display) fields.push({ name: 'Amount', value: trunc(input.amount_display, 256), inline: true });
  if (input.payment_method) fields.push({ name: 'Rail',   value: input.payment_method,            inline: true });
  if (input.flash_id)       fields.push({ name: 'Flash',  value: String(input.flash_id),          inline: true });
  if (input.message)        fields.push({ name: 'Message', value: trunc(input.message, 1024) });

  const body = JSON.stringify({
    embeds: [{
      title: '⚡ New Flash',
      color: CASI_ORANGE,
      fields,
      timestamp: new Date().toISOString(),
      footer: { text: 'casi.gg' },
    }],
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });
  } catch {
    // Swallow — notification is never load-bearing.
  } finally {
    clearTimeout(timer);
  }
}

export interface BeamNotifyInput {
  /** 'purchased' = payment confirmed; 'started' = beam is now live on stream. */
  event: 'purchased' | 'started';
  /** Whether the booked slot is a backdrop (is_background=true on overlay_elements). */
  is_backdrop?: boolean | null;
  viewer_name?: string | null;
  /** Slot / shape label from overlay_elements.label */
  element_label?: string | null;
  /** Pre-formatted price string, e.g. "5.00 USD" or "5 USDC" */
  price_display?: string | null;
  duration_minutes?: number | null;
  message?: string | null;
  payment_method?: string | null;
  booking_id?: string | number | null;
}

export async function notifyBeam(input: BeamNotifyInput): Promise<void> {
  const url = process.env.DISCORD_NOTIFY_WEBHOOK_URL;
  if (!url) return;

  const kind = input.is_backdrop ? 'Backdrop' : 'Beam';
  const title = input.event === 'purchased'
    ? `💰 New ${kind} Purchase`
    : `🔴 ${kind} Started`;

  type DiscordField = { name: string; value: string; inline?: boolean };
  const fields: DiscordField[] = [];

  if (input.viewer_name)
    fields.push({ name: 'Viewer',   value: trunc(input.viewer_name, 256),   inline: true });
  if (input.element_label)
    fields.push({ name: 'Shape',    value: trunc(input.element_label, 256), inline: true });
  if (input.price_display)
    fields.push({ name: 'Price',    value: trunc(input.price_display, 256), inline: true });
  if (input.duration_minutes != null)
    fields.push({ name: 'Duration', value: `${Number(input.duration_minutes)} min`, inline: true });
  if (input.payment_method)
    fields.push({ name: 'Rail',     value: input.payment_method,            inline: true });
  if (input.booking_id)
    fields.push({ name: 'Booking',  value: String(input.booking_id),        inline: true });
  if (input.message)
    fields.push({ name: 'Message',  value: trunc(input.message, 1024) });

  const body = JSON.stringify({
    embeds: [{
      title,
      color: CASI_ORANGE,
      fields,
      timestamp: new Date().toISOString(),
      footer: { text: 'casi.gg' },
    }],
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });
  } catch {
    // Swallow — notification is never load-bearing; local logs are the primary record.
  } finally {
    clearTimeout(timer);
  }
}
