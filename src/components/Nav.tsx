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
  /** True on viewer-facing per-streamer surfaces (StreamerProfile) — the
   *  nav adopts that streamer's own --ink/--paper (already mutated by
   *  SkinProvider higher up the tree) instead of Casi's fixed chrome.
   *  Studio/settings (the only other caller) omit this and keep the fixed
   *  chrome — that's Casi's own control room, not a viewer-facing brand
   *  surface, per explicit user confirmation this stays fixed. */
  followSkin?: boolean;
};

/**
 * Shared top bar for every v7 surface (landing, viewer, studio, settings,
 * auth). The prototype repeats the same nav markup on each screen with
 * minor right-side variations; this consolidates the shell so each surface
 * only renders the bits that differ.
 */
export default function Nav({ brandHref = '/', left, right, followSkin = false }: NavProps) {
  // Center the logo when there's no right-side action (wallet pill, etc.) —
  // mirrors NavBar's centered variant. With wallet present, fall back to
  // the original space-between layout.
  const centered = !right;
  return (
    // Two modes, chosen by the caller via `followSkin`:
    //
    // Fixed chrome (studio/settings, followSkin=false — the default):
    // pinned to the --chrome-* palette regardless of whichever streamer
    // skin is mutating --ink/--paper on <html>. --paper/--ink are SWAPPED
    // (chrome-ink for paper, chrome-paper for ink), not just pinned: the
    // design-source prototype's shared nav template is a solid dark-green
    // bar with cream content. data-paper="light" pins the derived scale
    // (--text/--line/--surf/etc, which UserSkinProvider/SkinProvider/the
    // anti-FOUC script mutate via --ink/--paper AND a separate --casi-bg
    // override on <html>) to Casi's own light formula regardless of the
    // active skin — confirmed live: without this a dark skin turned the
    // nav black instead of staying chrome green.
    //
    // Skin-following (StreamerProfile, followSkin=true — this streamer's
    // own viewer-facing brand surface, not Casi's chrome): no shadow, no
    // data-paper pin — inherits the real skin's --ink/--paper exactly as
    // SkinProvider set them, so the nav reads as part of that streamer's
    // own page instead of Casi's chrome bleeding into their brand.
    <nav
      className={centered ? 'flex items-center justify-center' : 'flex items-center justify-between'}
      data-paper={followSkin ? undefined : 'light'}
      style={{
        ...(followSkin
          ? {
              // No chrome shadow, no data-paper pin — inherit the real
              // streamer skin's --ink/--paper (and their derived --line/
              // --text/etc) exactly as SkinProvider set them higher up.
              // Background matches the page's own paper (nav blends into
              // the page rather than sitting in its own colored bar) with
              // a subtle ink-tinted hairline so it's still legible as a
              // distinct bar.
              background: 'var(--paper)',
              borderBottom: '1px solid color-mix(in oklab, var(--ink) 12%, var(--paper))',
            }
          : {
              '--paper': 'var(--chrome-ink)',
              '--ink': 'var(--chrome-paper)',
              borderBottom: 'none',
              background: 'var(--chrome-ink)',
            }),
        display: 'flex',
        flexWrap: 'wrap',
        rowGap: '8px',
        padding: '10px 36px',
        minHeight: '54px',
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
        // flex-wrap here specifically -- on a narrow viewport the
        // MobileWalletPicker deeplink buttons don't fit alongside the
        // Dashboard link. min-height above (was a fixed height) lets this
        // whole bar grow instead of the overflow spilling onto the page
        // content below it -- confirmed on a real device screenshot.
        <div className="flex items-center" style={{ gap: '8px 14px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {right}
        </div>
      ) : null}
    </nav>
  );
}
