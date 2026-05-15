/**
 * payment-math.ts
 *
 * Single source of truth for converting (price_value, price_unit, duration)
 * into a Stripe-ready integer minor-unit amount. Duplicated formulas drift;
 * keep every route that creates or captures a PaymentIntent using this
 * helper.
 *
 * price_unit semantics:
 *   - 'min' — price_value is currency-units per minute
 *   - 'hr'  — price_value is currency-units per hour (converted to per-minute here)
 *
 * Anything else falls back to treating the value as a flat per-minute rate
 * so a mis-configured row can't multiply by NaN.
 *
 * Currency: pass the streamer's Stripe Connect default_currency so the
 * minor-unit multiplier is right (100 for USD/EUR/etc, 1 for JPY/KRW,
 * 1000 for BHD/JOD). Default 'usd' keeps existing 2-decimal behaviour
 * for legacy callers that haven't been threaded through yet.
 */
import { getFiatConfig } from './currency';

export type PriceUnit = 'min' | 'hr' | string;

export function calcAmountCents(
  priceValue: number | string | null | undefined,
  priceUnit: PriceUnit | null | undefined,
  durationMinutes: number,
  currency: string | null | undefined = 'usd',
): number {
  const value = Number(priceValue) || 0;
  const minutes = Number(durationMinutes) || 0;
  if (value <= 0 || minutes <= 0) return 0;

  const cfg = getFiatConfig(currency);
  const factor = cfg.stripeDecimals === 0 ? 1 : cfg.stripeDecimals === 3 ? 1000 : 100;
  const perMinute = priceUnit === 'hr' ? value / 60 : value;
  return Math.round(perMinute * minutes * factor);
}

/**
 * Pro-rated capture: how many cents to actually charge given the original
 * authorization and the minutes actually consumed. Clamped to the original
 * amount so we can never capture more than we authorized.
 */
export function proRataCaptureCents(
  originalAmountCents: number,
  totalMinutes: number,
  elapsedMinutes: number,
): number {
  if (originalAmountCents <= 0 || totalMinutes <= 0) return 0;
  const minutes = Math.max(0, elapsedMinutes);
  const raw = Math.round((minutes / totalMinutes) * originalAmountCents);
  return Math.min(Math.max(raw, 0), originalAmountCents);
}
