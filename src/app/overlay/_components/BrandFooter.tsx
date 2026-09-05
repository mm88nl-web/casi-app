import { CasiMark } from '@/components/v9';

export default function BrandFooter() {
  return (
    // Casi's own brand watermark at the foot of the booking flow — pinned
    // to the fixed chrome ink/paper, like the nav logo, not the active
    // streamer skin. CasiMark's outer stroke/fill reads `currentColor`
    // (set via `color` below); its cutout circle reads `--paper` directly
    // via an SVG presentation attribute, so that also has to be shadowed
    // here even though `className=""` already opts this instance out of
    // .casi-v9-mark's own CSS rule. See the --chrome-* comment in
    // globals.css for the underlying mechanism.
    <div style={{
      marginTop: 24,
      marginBottom: 8,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--chrome-ink)',
      ['--paper' as string]: 'var(--chrome-paper)',
    }}>
      <CasiMark width={56} height={28} className="" />
    </div>
  );
}
