'use client';

import type { ReactNode } from 'react';

type Props = {
  onClick?: () => void;
  children?: ReactNode;
};

/**
 * v9 connect-wallet pill — pre-connect state. Intentionally minimal so per-screen
 * phases can swap in the connected pill (network · balance · identity · dropdown)
 * which lives behind the `wallet-adapter` integration.
 */
export function WalletButton({ onClick, children = 'Connect wallet' }: Props) {
  return (
    <button type="button" className="casi-v9-wlt-connect" onClick={onClick}>
      <svg
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
        <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
        <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
      </svg>
      {children}
    </button>
  );
}
