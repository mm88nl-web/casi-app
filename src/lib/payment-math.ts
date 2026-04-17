/**
 * payment-math.ts
 *
 * Single source of truth for converting (price_value, price_unit, duration)
 * into a Stripe-ready integer cent amount. Duplicated formulas drift; keep
 * every route that creates or captures a PaymentIntent using this helper.
 *
 * price_unit semantics:
 *   - 'min' — price_value is euros per minute
 *   - 'hr'  — price_value is euros per hour (converted to per-minute here)
 *
 * Anything else falls back to treating the value as a flat per-minute rate
 * so a mis-configured row can't multiply by NaN.
 */
export type PriceUnit = 'min' | 'hr' | string;

export function calcAmountCents(
  priceValue: number | string | null | undefined,
  priceUnit: PriceUnit | null | undefined,
  durationMinutes: number,
): number {
  const value = Number(priceValue) || 0;
  const minutes = Number(durationMinutes) || 0;
  if (value <= 0 || minutes <= 0) return 0;

  const perMinute = priceUnit === 'hr' ? value / 60 : value;
  return Math.round(perMinute * minutes * 100);
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
