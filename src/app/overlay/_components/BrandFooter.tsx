import { CasiMark } from '@/components/v9';

export default function BrandFooter() {
  return (
    // Casi's own brand watermark at the foot of the booking flow — follows
    // the active streamer skin here, same as Nav's `followSkin` mode,
    // since this sits on the same viewer-facing page. Was pinned to the
    // fixed chrome ink/paper (dark green on cream), which on a dark
    // streamer skin meant a near-invisible dark-green mark with a bright
    // cutout dot floating on it — read as a broken logo, not a watermark.
    // CasiMark's outer stroke/fill reads `currentColor` (set via `color`
    // below); its cutout circle reads ambient `--paper` directly via an
    // SVG presentation attribute, so no shadowing is needed here.
    <div style={{
      marginTop: 24,
      marginBottom: 8,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--ink)',
    }}>
      <CasiMark width={56} height={28} className="" />
    </div>
  );
}
