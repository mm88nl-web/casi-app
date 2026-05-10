/**
 * Slot pricing display helper
 *
 * Slots store per-rail rates in `prices` JSONB ({ usd, eur, usdc, ... })
 * plus a legacy `price_value` column that mirrors the USD rail. Most UI
 * surfaces previously hardcoded "$${slot.price_value}" — fine when every
 * streamer was on Stripe USD, broken now that streamers can run USDC-only
 * (no Stripe connected) or EUR-via-Stripe.
 *
 * formatSlotPrice picks the right rail to display from the prices JSONB
 * and falls back to the legacy column for slots predating the JSONB.
 *
 * Selection precedence (highest → lowest priority):
 *   1. USD rail   → "$5/min"
 *   2. EUR rail   → "€5/min"
 *   3. USDC rail  → "5 USDC/min"
 *   4. Legacy price_value (treated as USD)
 *   5. Free
 *
 * Why fiat-first: most viewers think in fiat by default; the booking form
 * lets them switch rails anyway, and a slot with both USD=5 + USDC=5 set
 * reads more recognisably as "$5/min" than "5 USDC/min" to a typical
 * viewer.
 *
 * Pass `prefer: 'usdc'` to force the USDC label (used by
 * SolanaConfirmModal where the booking is unambiguously on the Solana
 * rail).
 */

export type SlotPriceRail = 'usd' | 'eur' | 'usdc' | 'free';

export type SlotPriceDisplay = {
  amount: number;
  rail: SlotPriceRail;
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

export function formatSlotPrice(
  slot: PriceLike,
  opts?: { prefer?: 'usd' | 'eur' | 'usdc' },
): SlotPriceDisplay {
  const prices = slot.prices ?? {};
  const usd = num(prices.usd);
  const eur = num(prices.eur);
  const usdc = num(prices.usdc);
  const legacy = num(slot.price_value);
  const unit = slot.price_unit || 'min';

  if (usd === 0 && eur === 0 && usdc === 0 && legacy === 0) {
    return { amount: 0, rail: 'free', label: 'Free', amountLabel: 'Free' };
  }

  // Forced rail (e.g. SolanaConfirmModal forces 'usdc'). If the forced
  // rail has a non-zero rate, use it; otherwise fall back to default
  // selection so we don't render "0 USDC" on a slot priced in fiat only.
  if (opts?.prefer === 'usdc' && usdc > 0) {
    return {
      amount: usdc,
      rail: 'usdc',
      label: `${fmtAmount(usdc)} USDC/${unit}`,
      amountLabel: `${fmtAmount(usdc)} USDC`,
    };
  }
  if (opts?.prefer === 'usd' && usd > 0) {
    return { amount: usd, rail: 'usd', label: `$${fmtAmount(usd)}/${unit}`, amountLabel: `$${fmtAmount(usd)}` };
  }
  if (opts?.prefer === 'eur' && eur > 0) {
    return { amount: eur, rail: 'eur', label: `€${fmtAmount(eur)}/${unit}`, amountLabel: `€${fmtAmount(eur)}` };
  }

  if (usd > 0) {
    return { amount: usd, rail: 'usd', label: `$${fmtAmount(usd)}/${unit}`, amountLabel: `$${fmtAmount(usd)}` };
  }
  if (eur > 0) {
    return { amount: eur, rail: 'eur', label: `€${fmtAmount(eur)}/${unit}`, amountLabel: `€${fmtAmount(eur)}` };
  }
  if (usdc > 0) {
    return {
      amount: usdc,
      rail: 'usdc',
      label: `${fmtAmount(usdc)} USDC/${unit}`,
      amountLabel: `${fmtAmount(usdc)} USDC`,
    };
  }
  // Legacy slots — price_value > 0, prices JSONB empty. Treat as USD,
  // matching the historic mirror behavior in saveRates.
  return { amount: legacy, rail: 'usd', label: `$${fmtAmount(legacy)}/${unit}`, amountLabel: `$${fmtAmount(legacy)}` };
}
