'use client';

import Nav from '@/components/Nav';
import WalletPill from '@/components/WalletPill';

type Props = {
  liveCount: number;
};

/**
 * Landing-page top bar. Shared <Nav> shell with the live-streamer count
 * and the wallet pill in the right slot. v7 renders the count as plain
 * dim text + a pulsing teal dot — much subtler than the v3 chip.
 */
export default function LandingNav({ liveCount }: Props) {
  return (
    <Nav
      brandHref="/"
      right={
        <>
          <span
            className="flex items-center"
            style={{ gap: '6px', fontSize: '12.5px', color: 'var(--casi-text-mid)' }}
          >
            <span
              aria-hidden
              className="casi-live-dot"
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--casi-accent)',
              }}
            />
            {liveCount} live now
          </span>
          <WalletPill />
          <style>{`
            .casi-live-dot { animation: casi-live-blink 2s ease-in-out infinite; }
            @keyframes casi-live-blink {
              0%, 100% { opacity: 1; }
              50%       { opacity: 0.25; }
            }
          `}</style>
        </>
      }
    />
  );
}
