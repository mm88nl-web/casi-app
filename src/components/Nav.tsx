'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import CasiLogo from '@/components/CasiLogo';

type NavProps = {
  /** Where the brand mark links to. Defaults to `/`. */
  brandHref?: string;
  /** Optional content rendered next to the brand (e.g. "12 live now" on landing). */
  left?: ReactNode;
  /** Right-side actions — chips, wallet pill, etc. Caller composes. */
  right?: ReactNode;
};

/**
 * Shared top bar for every v7 surface (landing, viewer, studio, settings,
 * auth). The prototype repeats the same nav markup on each screen with
 * minor right-side variations; this consolidates the shell so each surface
 * only renders the bits that differ.
 */
export default function Nav({ brandHref = '/', left, right }: NavProps) {
  return (
    <nav
      className="flex items-center justify-between"
      style={{
        padding: '0 36px',
        height: '54px',
        borderBottom: '1px solid var(--casi-border)',
        background: 'var(--casi-bg)',
      }}
    >
      <div className="flex items-center" style={{ gap: '14px' }}>
        <Link
          href={brandHref}
          className="flex items-center"
          style={{ gap: '9px', color: 'var(--casi-text)', textDecoration: 'none' }}
        >
          <CasiLogo size={62} />
          <span
            style={{
              fontFamily: 'var(--font-casi-display), var(--font-casi-sans), sans-serif',
              fontSize: '21px',
              fontWeight: 800,
              letterSpacing: '0.5px',
              color: 'var(--casi-accent)',
            }}
          >
            casi
          </span>
        </Link>
        {left ?? null}
      </div>
      {right ? (
        <div className="flex items-center" style={{ gap: '14px' }}>
          {right}
        </div>
      ) : null}
    </nav>
  );
}
