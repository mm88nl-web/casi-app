/**
 * Currency display + Stripe-amount helpers
 *
 * Stripe Connect's `account.default_currency` is a lowercase ISO-4217 code
 * — usd, eur, gbp, jpy, brl, aud, cad, sgd, etc. Earlier code in the studio
 * hardcoded a `'usd' | 'eur'` union because those were the only two
 * currencies that ever flowed through; that breaks the moment a streamer
 * onboards via Stripe Connect from any other supported country.
 *
 * This module is the single place we know:
 *   - which currencies CASI surfaces in its pickers
 *   - what symbol each renders with
 *   - how many minor units a Stripe amount has (most are 100; JPY is 1; BHD
 *     is 1000 — see https://stripe.com/docs/currencies#zero-decimal)
 *   - how to format a fiat amount as a string
 *
 * Adding a currency means adding one row to SUPPORTED_FIAT below. The slot
 * pricing JSONB (`prices`) and Stripe Connect's default_currency field are
 * already free-text-ISO; the only constraint is what we expose in the UI.
 */

export type IsoCode = string; // lowercase ISO-4217. Free-text by design.

type FiatConfig = {
  iso: IsoCode;
  symbol: string;
  /** Number of decimal places Stripe expects on the PaymentIntent amount. */
  stripeDecimals: 0 | 2 | 3;
  /** Sensible per-minute pricing step in the streamer's rate input. */
  rateStep: number;
};

/**
 * Seed list. Picked to cover the obvious Stripe Connect regions; expand as
 * streamers from other countries onboard. Order in this list also drives
 * the dropdown order in Settings → Display currency.
 *
 * Excluded on purpose:
 *   CNY — Stripe doesn't support CN-based Connect accounts; CNY presentment
 *         only works via Alipay/WeChat Pay (different product CASI doesn't
 *         use). Showing it in the picker would let a streamer set a rate
 *         that no PaymentIntent could ever capture.
 *   BTC — CASI's escrow program is USDC-only. Putting BTC in the picker
 *         without a BTC rail is worse than not showing it.
 */
export const SUPPORTED_FIAT: ReadonlyArray<FiatConfig> = [
  { iso: 'eur', symbol: '€',  stripeDecimals: 2, rateStep: 1 },
  { iso: 'usd', symbol: '$',  stripeDecimals: 2, rateStep: 1 },
  { iso: 'gbp', symbol: '£',  stripeDecimals: 2, rateStep: 1 },
  { iso: 'aud', symbol: 'A$', stripeDecimals: 2, rateStep: 1 },
  { iso: 'cad', symbol: 'C$', stripeDecimals: 2, rateStep: 1 },
  { iso: 'brl', symbol: 'R$', stripeDecimals: 2, rateStep: 1 },
  { iso: 'jpy', symbol: '¥',  stripeDecimals: 0, rateStep: 100 },
  { iso: 'sgd', symbol: 'S$', stripeDecimals: 2, rateStep: 1 },
];

/** ISO codes the picker offers (excludes USDC — that's a token, not a fiat). */
export const SUPPORTED_FIAT_ISOS: ReadonlyArray<IsoCode> =
  SUPPORTED_FIAT.map((c) => c.iso);

const BY_ISO: Record<string, FiatConfig> = Object.fromEntries(
  SUPPORTED_FIAT.map((c) => [c.iso, c]),
);

/** Fallback when Stripe Connect returns a currency we don't know yet. */
const FALLBACK: FiatConfig = { iso: 'usd', symbol: '$', stripeDecimals: 2, rateStep: 1 };

/** Look up the config for a currency code; falls back to USD on unknown. */
export function getFiatConfig(iso: string | null | undefined): FiatConfig {
  if (!iso) return FALLBACK;
  return BY_ISO[iso.toLowerCase()] ?? FALLBACK;
}

/** Symbol for a currency, with USD-fallback on unknown. */
export function fiatSymbol(iso: string | null | undefined): string {
  return getFiatConfig(iso).symbol;
}

/**
 * Render a fiat amount as a string. Drops trailing .0 for non-fractional
 * values so "5" → "$5" rather than "$5.00", but keeps "5.42" → "$5.42".
 *
 * For zero-decimal currencies (JPY) the .toFixed pass is skipped entirely.
 */
export function formatFiat(iso: string | null | undefined, amount: number): string {
  const cfg = getFiatConfig(iso);
  if (cfg.stripeDecimals === 0) {
    return `${cfg.symbol}${Math.round(amount).toLocaleString('en-US')}`;
  }
  const isWhole = amount % 1 === 0;
  return `${cfg.symbol}${isWhole ? String(amount) : amount.toFixed(2)}`;
}

/**
 * Convert a human-entered amount (e.g. "5.50") into the minor units Stripe
 * wants on the PaymentIntent (e.g. 550). For zero-decimal currencies (JPY)
 * this is just the rounded integer.
 */
export function toStripeAmount(iso: string | null | undefined, amount: number): number {
  const cfg = getFiatConfig(iso);
  const factor = cfg.stripeDecimals === 0 ? 1 : cfg.stripeDecimals === 3 ? 1000 : 100;
  return Math.round(amount * factor);
}
