'use client';

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { CasiMark, Wordmark } from '@/components/v9';

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
  // Center the logo when there's no right-side action (wallet pill, etc.) —
  // mirrors NavBar's centered variant. With wallet present, fall back to
  // the original space-between layout.
  const centered = !right;
  return (
    // Casi's own nav chrome — pinned to the fixed --chrome-* palette, not
    // whichever streamer skin is currently mutating --ink/--paper on
    // <html> (this page mounts SkinProvider for the profile it's showing —
    // see StreamerProfile.tsx). Shadowing --ink/--paper here (plus
    // data-paper="light") is the same trick globals.css's .casi-v9-nav
    // uses, and covers CasiMark/Wordmark below via the `color: var(--ink)`
    // read. It does NOT cover background/border here, though: unlike
    // --text/--line/--surf (pure color-mix formulas that re-resolve
    // against whichever --paper cascades to a given element),
    // UserSkinProvider/SkinProvider/the anti-FOUC script also write
    // --casi-bg directly as its own inline style on <html> (see
    // applySkinToRoot in UserSkinProvider.tsx) — that bypasses the
    // --paper shadow entirely since it's never re-derived through it, and
    // inherits straight down to any descendant that doesn't ALSO
    // redeclare --casi-bg itself. Confirmed live: simulating a dark skin
    // and screenshotting showed the nav bar go black instead of staying
    // chrome cream before this was pinned to the literal token below.
    // background/border reference --chrome-paper/--chrome-ink directly
    // for the same reason, sidestepping the alias chain entirely instead
    // of trusting it isn't independently mutated somewhere.
    <nav
      className={centered ? 'flex items-center justify-center' : 'flex items-center justify-between'}
      data-paper="light"
      style={{
        '--paper': 'var(--chrome-paper)',
        '--ink': 'var(--chrome-ink)',
        padding: '0 36px',
        height: '54px',
        borderBottom: '1px solid color-mix(in oklab, var(--chrome-ink) 8%, var(--chrome-paper))',
        background: 'var(--chrome-paper)',
        position: centered ? 'relative' : undefined,
      } as CSSProperties}
    >
      <div className="flex items-center" style={{ gap: '14px' }}>
        <Link
          href={brandHref}
          className="flex items-center"
          style={{ gap: '9px', color: 'var(--ink)', textDecoration: 'none' }}
        >
          <CasiMark width={50} height={25} />
          <Wordmark />
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
