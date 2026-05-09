'use client';

import SolanaIcon from './SolanaIcon';
import UsdcIcon from './UsdcIcon';
import StripeIcon from './StripeIcon';

/**
 * Maps a booking/flash `payment_method` string to a rail-branded icon so
 * dashboard rows are scannable at a glance instead of relying on currency
 * symbol or trailing "USDC" text. Two-icon convention:
 *   - 'usdc' / 'solana' rows → USDC mark (the unit of account on the rail)
 *   - 'stripe' rows           → Stripe S badge (the rail name; viewer's
 *                                actual currency lives in price_unit)
 *   - 'free' / null           → no icon (caller should hide rail column)
 *
 * For the Solana network mark itself (e.g. footer "Powered by Solana"),
 * import SolanaIcon directly. RailIcon is for per-row rail tagging only.
 */
export default function RailIcon({
  method,
  size = 14,
  mono,
  className,
}: {
  method: string | null | undefined;
  size?: number;
  mono?: string;
  className?: string;
}) {
  if (!method || method === 'free') return null;
  if (method === 'stripe') {
    return <StripeIcon size={size} mono={mono} className={className} />;
  }
  // Treat 'usdc' and 'solana' identically — both indicate the on-chain rail.
  if (method === 'usdc' || method === 'solana') {
    return <UsdcIcon size={size} mono={mono} className={className} />;
  }
  return null;
}
