import type { ReactNode } from 'react';
import Link from 'next/link';
import { CasiMark } from './CasiMark';
import { Wordmark } from './Wordmark';
import { WalletButton } from './WalletButton';

type Props = {
  /** Optional live-count indicator (e.g. "12 LIVE NOW"). Hidden when undefined. */
  liveLabel?: string;
  /** Optional right-side slot. Replaces the default `<WalletButton />` when provided. */
  right?: ReactNode;
  /** Additional chips rendered between live indicator and wallet pill. */
  chips?: ReactNode;
  /** Where the logo links to. Defaults to `/`. */
  homeHref?: string;
};

export function NavBar({ liveLabel, right, chips, homeHref = '/' }: Props) {
  return (
    <nav className="casi-v9-nav">
      <Link href={homeHref} className="casi-v9-nav-logo">
        <CasiMark />
        <Wordmark />
      </Link>
      <div className="casi-v9-nav-r">
        {liveLabel ? (
          <div className="casi-v9-nav-live">
            <span className="casi-v9-live-dot" />
            {liveLabel}
          </div>
        ) : null}
        {chips}
        {right ?? <WalletButton />}
      </div>
    </nav>
  );
}
