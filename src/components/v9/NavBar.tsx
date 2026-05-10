import type { ReactNode } from 'react';
import Link from 'next/link';
import { CasiMark } from './CasiMark';
import { Wordmark } from './Wordmark';

type Props = {
  /** Optional live-count indicator (e.g. "12 LIVE NOW"). Hidden when undefined. */
  liveLabel?: string;
  /** Optional right-side slot (typically the WalletPill). When omitted the
   *  nav renders without a right block and centers the logo to balance the
   *  layout — used on every surface except /studio* and /overlay where the
   *  wallet pill is the canonical connect surface. */
  right?: ReactNode;
  /** Additional chips rendered between live indicator and right slot. */
  chips?: ReactNode;
  /** Where the logo links to. Defaults to `/`. */
  homeHref?: string;
};

export function NavBar({ liveLabel, right, chips, homeHref = '/' }: Props) {
  // The presence of a `right` slot (typically the wallet pill) drives the
  // overall layout. With wallet → space-between (logo left, content right).
  // Without wallet → centered logo, with the live indicator absolute-
  // positioned on the right edge so it doesn't disrupt the centering.
  const centered = !right;
  const hasSecondary = !!(liveLabel || chips);
  return (
    <nav className={`casi-v9-nav${centered ? ' casi-v9-nav-centered' : ''}`}>
      <Link href={homeHref} className="casi-v9-nav-logo">
        <CasiMark />
        <Wordmark />
      </Link>
      {(right || hasSecondary) && (
        <div className="casi-v9-nav-r">
          {liveLabel ? (
            <div className="casi-v9-nav-live">
              <span className="casi-v9-live-dot" />
              {liveLabel}
            </div>
          ) : null}
          {chips}
          {right}
        </div>
      )}
    </nav>
  );
}
