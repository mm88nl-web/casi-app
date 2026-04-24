'use client';

import SettingsSection from './SettingsSection';
import GhostButton from './GhostButton';
import CopyRow from '@/components/CopyRow';

function SourceNum({ n }: { n: number }) {
  return (
    <span
      className="mr-2 inline-block align-middle text-center font-mono font-bold"
      style={{
        width: '18px',
        height: '18px',
        lineHeight: '18px',
        borderRadius: '5px',
        background: 'rgba(var(--casi-accent-rgb), 0.14)',
        color: 'var(--casi-accent)',
        fontSize: '10px',
      }}
    >
      {n}
    </span>
  );
}

export default function ObsSourcesSection() {
  const slug = 'pixel_hana';
  const backdropUrl = `https://www.casi.gg/obs/${slug}/backdrop?k=••••••••_bdKx9`;
  const beamsUrl = `https://www.casi.gg/obs/${slug}/beams?k=••••••••_bmRt3`;
  const flashesUrl = `https://www.casi.gg/obs/${slug}/flashes?k=••••••••_flS8w`;

  return (
    <SettingsSection
      id="obs-sources"
      title="OBS sources"
      desc={
        <>
          One URL per surface. Add each as a <b>Browser Source</b> in OBS at 1920×1080. Stack them in
          this Z-order: Backdrop at the back, Beams above your scene, Flashes on top.
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
              <SourceNum n={2} /> Beams · slot overlays
            </>
          }
          value={beamsUrl}
          hint="All shaped slots render here — hex, circle, banner, rect, rounded."
        />
        <CopyRow
          label={
            <>
              <SourceNum n={3} /> Flashes · popup messages
            </>
          }
          value={flashesUrl}
          hint="15-second text pop-ups. Keep on top so they're visible."
        />
      </div>

      <div style={{ marginTop: '14px' }}>
        <GhostButton type="button">Regenerate all keys</GhostButton>
      </div>
    </SettingsSection>
  );
}
