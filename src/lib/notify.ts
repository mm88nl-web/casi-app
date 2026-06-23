/**
 * Business event notifications → Discord.
 *
 * Purchased beam/flash events are posted via the bot API so they can carry
 * interactive Approve / Deny buttons (regular incoming webhooks can't have
 * components). Requires DISCORD_BOT_TOKEN + DISCORD_NOTIFY_CHANNEL_ID.
 *
 * "Beam Started" and any event without buttons still uses
 * DISCORD_NOTIFY_WEBHOOK_URL as before (zero config change for those paths).
 *
 * All functions are fire-and-forget — they swallow errors internally and
 * never block the caller's response path.
 */

const CASI_ORANGE = 0xF58220;

// ── Zero-decimal currency set ─────────────────────────────────────────────────
const ZERO_DECIMAL_CURRENCIES = new Set([
  'jpy', 'krw', 'bif', 'clp', 'djf', 'gnf', 'kmf', 'mga',
  'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

/** Format a Stripe amount_total (smallest currency unit) as a human string. */
export function formatStripeAmount(amountTotal: number, currency: string): string {
  const c = currency.toLowerCase();
  const major = ZERO_DECIMAL_CURRENCIES.has(c) ? amountTotal : amountTotal / 100;
  const decimals = ZERO_DECIMAL_CURRENCIES.has(c) ? 0 : 2;
  return `${major.toFixed(decimals)} ${currency.toUpperCase()}`;
}

/**
 * Returns true if this profile_id should trigger a notification.
 * Set DISCORD_NOTIFY_PROFILE_ID to your Supabase profile UUID; if unset,
 * all profiles fire (solo instance).
 */
export function shouldNotify(profileId: string | null | undefined): boolean {
  const own = process.env.DISCORD_NOTIFY_PROFILE_ID;
  if (!own) return true;
  return profileId === own;
}

function trunc(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

type DiscordField = { name: string; value: string; inline?: boolean };

// ── Low-level Discord senders ─────────────────────────────────────────────────

/** POST to a Discord incoming webhook URL. Used for non-interactive events. */
async function postToWebhook(webhookUrl: string, payload: unknown): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch {
    // Swallow — notification is never load-bearing.
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST a message via the bot to a specific channel.
 * Supports components (buttons) — incoming webhooks can't do this.
 */
async function postViaBot(channelId: string, payload: unknown): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch {
    // Swallow.
  } finally {
    clearTimeout(timer);
  }
}

/** Build the action row of buttons for an actionable notification. */
function buildComponents(
  kind: 'booking' | 'flash',
  entityId: string | number,
  paymentMethod: string | null | undefined,
): object[] {
  const id = String(entityId);

  // All rails: show approve/deny — the interaction handler cranks Solana on-chain
  // via the delegate if installed, or falls back to a studio link if not.
  return [{
    type: 1,
    components: [
      {
        type: 2,
        style: 3,   // Success (green)
        label: '✅ Approve',
        custom_id: `approve_${kind}:${id}`,
      },
      {
        type: 2,
        style: 4,   // Danger (red)
        label: '❌ Deny',
        custom_id: `deny_${kind}:${id}`,
      },
    ],
  }];
}

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface FlashNotifyInput {
  viewer_name?: string | null;
  /** Pre-formatted amount string, e.g. "5.00 USD" or "5 USDC" or "free" */
  amount_display?: string | null;
  message?: string | null;
  payment_method?: string | null;
  flash_id?: string | null;
}

export async function notifyFlash(input: FlashNotifyInput): Promise<void> {
  const channelId = process.env.DISCORD_NOTIFY_CHANNEL_ID;
  const webhookUrl = process.env.DISCORD_NOTIFY_WEBHOOK_URL;
  if (!channelId && !webhookUrl) return;

  const fields: DiscordField[] = [];
  if (input.viewer_name)    fields.push({ name: 'From',    value: trunc(input.viewer_name, 256),    inline: true });
  if (input.amount_display) fields.push({ name: 'Amount',  value: trunc(input.amount_display, 256), inline: true });
  if (input.payment_method) fields.push({ name: 'Rail',    value: input.payment_method,              inline: true });
  if (input.flash_id)       fields.push({ name: 'Flash',   value: String(input.flash_id),            inline: true });
  if (input.message)        fields.push({ name: 'Message', value: trunc(input.message, 1024) });

  const embed = {
    title: '⚡ New Flash',
    color: CASI_ORANGE,
    fields,
    timestamp: new Date().toISOString(),
    footer: { text: 'casi.gg' },
  };

  // Use bot if possible (supports approve/deny buttons for free + Stripe flashes).
  if (channelId && input.flash_id) {
    const components = buildComponents('flash', input.flash_id, input.payment_method);
    await postViaBot(channelId, { embeds: [embed], components });
    return;
  }

  // Fallback: webhook, no buttons.
  if (webhookUrl) await postToWebhook(webhookUrl, { embeds: [embed] });
}

export interface BeamNotifyInput {
  /** 'purchased' = payment confirmed / actionable; 'started' = beam live on stream. */
  event: 'purchased' | 'started';
  is_backdrop?: boolean | null;
  viewer_name?: string | null;
  element_label?: string | null;
  price_display?: string | null;
  duration_minutes?: number | null;
  message?: string | null;
  payment_method?: string | null;
  booking_id?: string | number | null;
  /** Public URL of the uploaded beam/backdrop image. Shown as preview in Discord. */
  image_url?: string | null;
}

export async function notifyBeam(input: BeamNotifyInput): Promise<void> {
  const channelId = process.env.DISCORD_NOTIFY_CHANNEL_ID;
  const webhookUrl = process.env.DISCORD_NOTIFY_WEBHOOK_URL;
  if (!channelId && !webhookUrl) return;

  const kind = input.is_backdrop ? 'Backdrop' : 'Beam';
  const title = input.event === 'purchased'
    ? `💰 New ${kind} Purchase`
    : `🔴 ${kind} Started`;

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
    fields.push({ name: 'Rail',     value: input.payment_method,             inline: true });
  if (input.booking_id)
    fields.push({ name: 'Booking',  value: String(input.booking_id),         inline: true });
  if (input.message)
    fields.push({ name: 'Message',  value: trunc(input.message, 1024) });

  const embed: Record<string, unknown> = {
    title,
    color: CASI_ORANGE,
    fields,
    timestamp: new Date().toISOString(),
    footer: { text: 'casi.gg' },
  };

  // Embed the uploaded image as a preview for purchased beams/backdrops.
  // Skipped for started events (beam is already live; streamer doesn't need the preview).
  if (input.event === 'purchased' && input.image_url) {
    embed.image = { url: input.image_url };
  }

  // Purchased events: use bot so we can attach Approve / Deny buttons.
  if (input.event === 'purchased' && channelId && input.booking_id) {
    const components = buildComponents('booking', input.booking_id, input.payment_method);
    await postViaBot(channelId, { embeds: [embed], components });
    return;
  }

  // Started events (or no bot config): use incoming webhook, no buttons.
  const target = webhookUrl ?? (channelId ? null : null);
  if (webhookUrl) await postToWebhook(webhookUrl, { embeds: [embed] });
}
