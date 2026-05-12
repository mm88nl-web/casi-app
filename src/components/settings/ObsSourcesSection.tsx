'use client';

import { useEffect, useState } from 'react';
import SettingsSection from './SettingsSection';
import CopyRow from '@/components/CopyRow';

function SourceNum({ n }: { n: number }) {
  return (
    <span
      className="mr-2 inline-block align-middle text-center font-mono font-bold"
      style={{
        width: '18px',
        height: '18px',
        lineHeight: '18px',
        borderRadius: 0,
        background: 'rgba(var(--casi-accent-rgb), 0.14)',
        color: 'var(--casi-accent)',
        fontSize: '10px',
      }}
    >
      {n}
    </span>
  );
}

type Props = {
  /** Streamer slug — the `?s=` param the overlay reads. */
  username: string;
};

export default function ObsSourcesSection({ username }: Props) {
  // origin resolves on the client; empty string on server-render avoids a
  // hydration mismatch, then the effect fills it in.
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
  }, []);

  const base = origin || 'https://www.casi.gg';
  const beamsUrl = `${base}/obs?s=${username}&layer=beams`;
  const backdropUrl = `${base}/obs?s=${username}&layer=backdrop`;

  return (
    <SettingsSection
      id="obs-sources"
      title="OBS sources"
      desc={
        <>
          Two Browser Sources at 1920×1080. Stack them in this Z-order: Backdrop at the back,
          Beams on top. Flashes come through the Beams layer, no separate source needed.
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <CopyRow
          label={
            <>
              <SourceNum n={1} /> Backdrop · behind everything
            </>
          }
          value={backdropUrl}
          hint="Full-bleed. Put this at the bottom of your scene."
        />
        <CopyRow
          label={
            <>
              <SourceNum n={2} /> Beams · slot overlays + flashes
            </>
          }
          value={beamsUrl}
          hint="All shaped slots render here, plus the 15s flash popups."
        />
      </div>

      <div
        className="mt-3.5 font-mono uppercase"
        style={{
          fontSize: '10px',
          letterSpacing: '0.1em',
          color: 'var(--casi-text-faint)',
        }}
      >
        Custom CSS for both sources: <code style={{ color: 'var(--casi-text-dim)' }}>body &#123; background-color: rgba(0,0,0,0); &#125;</code>
      </div>
    </SettingsSection>
  );
}
