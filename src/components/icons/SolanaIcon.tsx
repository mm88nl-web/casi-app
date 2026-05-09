'use client';

import { useId } from 'react';

type Props = {
  size?: number;
  /** Force a flat fill instead of the gradient — useful for monochrome
   *  contexts where the gradient would clash with the surrounding ink color. */
  mono?: string;
  className?: string;
  title?: string;
};

/**
 * Solana network mark. Three angled bars with the official brand gradient
 * (#9945FF → #14F195). Hand-implemented from the publicly available Solana
 * brand mark; if you want the pixel-canonical SVG, swap the paths below
 * with the file from solana.com/branding (they release SVG + PNG packs).
 */
export default function SolanaIcon({ size = 14, mono, className, title = 'Solana' }: Props) {
  const gid = useId();
  const fill = mono ?? `url(#${gid})`;
  return (
    <svg
      width={size}
      height={size * (311 / 397)}
      viewBox="0 0 397 311"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={className}
    >
      <defs>
        <linearGradient id={gid} x1="360.879" y1="-37.4558" x2="141.213" y2="383.972" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#00FFA3" />
          <stop offset="1" stopColor="#DC1FFF" />
        </linearGradient>
      </defs>
      <path
        d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z"
        fill={fill}
      />
      <path
        d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z"
        fill={fill}
      />
      <path
        d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z"
        fill={fill}
      />
    </svg>
  );
}
