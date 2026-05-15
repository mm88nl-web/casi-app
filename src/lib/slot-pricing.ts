/**
 * Slot pricing display helper
 *
 * Slots store per-rail rates in `prices` JSONB plus a legacy `price_value`
 * column that mirrors the streamer's primary fiat rail. Most UI surfaces
 * previously hardcoded "$${slot.price_value}" — fine when every streamer
 * was on Stripe USD, broken now that streamers can run USDC-only (no
 * Stripe connected) or any Stripe-Connect-supported currency.
 *
 * formatSlotPrice picks the right rail to display from the prices JSONB
 * and falls back to the legacy column for slots predating the JSONB.
 *
 * Selection precedence (highest → lowest priority):
 *   1. Forced rail (opts.prefer or opts.currency) when present and non-zero
 *   2. The first non-zero fiat code we recognise (SUPPORTED_FIAT_ISOS order)
 *   3. USDC rail
 *   4. Legacy price_value (treated as USD — that's what older slots stored)
 *   5. Free
 *
 * Why fiat-first: most viewers think in fiat by default; the booking form
 * lets them switch rails anyway, and a slot with both fiat=5 + USDC=5 set
 * reads more recognisably as "$5/min" than "5 USDC/min" to a typical
 * viewer.
 *
 * Pass `prefer: 'usdc'` to force the USDC label (used by
 * SolanaConfirmModal where the booking is unambiguously on the Solana
 * rail). Pass `currency: 'gbp'` to force a specific fiat rail (used by
 * studio surfaces that already know the streamer's settlement currency
 * from Stripe Connect).
 */

import { SUPPORTED_FIAT_ISOS, fiatSymbol, type IsoCode } from './currency';

export type SlotPriceRail = 'fiat' | 'usdc' | 'free';

export type SlotPriceDisplay = {
  amount: number;
  rail: SlotPriceRail;
  /** Lowercase ISO-4217 code (e.g. 'usd', 'gbp') for the fiat rail; undefined for USDC / free. */
  currency?: IsoCode;
  /** "$5/min", "5 USDC/min", "Free". */
  label: string;
  /** "$5", "5 USDC", "Free" — same as label without the per-unit suffix. */
  amountLabel: string;
};

type PriceLike = {
  prices?: Record<string, number | string | null | undefined> | null;
  price_value?: number | string | null;
  price_unit?: string | null;
};

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

/** Format one rate cleanly. Drops trailing .0, keeps fractional cents. */
function fmtAmount(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}

function fiatLabel(amount: number, iso: IsoCode, unit: string): SlotPriceDisplay {
  const sym = fiatSymbol(iso);
  return {
    amount,
    rail: 'fiat',
    currency: iso,
    label: `${sym}${fmtAmount(amount)}/${unit}`,
    amountLabel: `${sym}${fmtAmount(amount)}`,
  };
}

function usdcLabel(amount: number, unit: string): SlotPriceDisplay {
  return {
    amount,
    rail: 'usdc',
    label: `${fmtAmount(amount)} USDC/${unit}`,
    amountLabel: `${fmtAmount(amount)} USDC`,
  };
}

export function formatSlotPrice(
  slot: PriceLike,
  opts?: {
    /** Force a specific rail label. 'usdc' picks USDC; a fiat code picks that
     *  currency. Falls back to default selection when the forced rail is zero. */
    prefer?: 'usdc' | IsoCode;
    /** Convenience alias for `prefer` when you already have the streamer's
     *  ISO code from Stripe Connect. */
    currency?: IsoCode;
  },
): SlotPriceDisplay {
  const prices = slot.prices ?? {};
  const usdc = num(prices.usdc);
  const legacy = num(slot.price_value);
  const unit = slot.price_unit || 'min';
  const forced = opts?.prefer ?? opts?.currency;

  // Forced rail (e.g. SolanaConfirmModal forces 'usdc'). If the forced
  // rail has a non-zero rate, use it; otherwise fall back to default
  // selection so we don't render "0 USDC" on a slot priced in fiat only.
  if (forced === 'usdc' && usdc > 0) return usdcLabel(usdc, unit);
  if (forced && forced !== 'usdc') {
    const v = num(prices[forced]);
    if (v > 0) return fiatLabel(v, forced, unit);
  }

  // First non-zero fiat code we recognise. SUPPORTED_FIAT_ISOS order
  // controls precedence — EUR before USD before GBP, etc.
  for (const code of SUPPORTED_FIAT_ISOS) {
    const v = num(prices[code]);
    if (v > 0) return fiatLabel(v, code, unit);
  }
  if (usdc > 0) return usdcLabel(usdc, unit);

  // Legacy slots — price_value > 0, prices JSONB empty. Treat as USD,
  // matching the historic mirror behavior in saveRates.
  if (legacy > 0) return fiatLabel(legacy, 'usd', unit);

  return { amount: 0, rail: 'free', label: 'Free', amountLabel: 'Free' };
}
