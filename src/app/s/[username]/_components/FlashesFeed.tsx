'use client';

export type Flash = {
  id: string;
  time: string;
  who: string;
  message: string;
  chip: { kind: 'free' | 'usdc' | 'eur'; label: string };
  mine?: boolean;
  fresh?: boolean;
};

const CHIP_CLASS: Record<Flash['chip']['kind'], string> = {
  usdc: 'u',
  eur: 'e',
  free: 'f',
};

/**
 * v7 .flash-item flat list. who · message · amount-chip · time. Matches
 * the row pattern used in the studio Dashboard's FlashesLog so streamer
 * + viewer see the same shape.
 */
export default function FlashesFeed({ flashes }: { flashes: Flash[] }) {
  return (
    <section className="flex flex-col">
      <style>{`
        .casi-vf-feed-head {
          font-size: 11px; font-weight: 600;
          color: var(--casi-text-mid);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 8px;
        }
        .casi-vf-item {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 0;
          border-bottom: 1px solid var(--casi-border);
        }
        .casi-vf-item:last-child { border-bottom: none; }
        .casi-vf-who { font-size: 12.5px; font-weight: 600; min-width: 80px; flex-shrink: 0; color: var(--casi-text); }
        .casi-vf-msg { font-size: 12.5px; color: var(--casi-text-mid); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .casi-vf-amt { font-family: var(--font-casi-mono), monospace; font-size: 11px; padding: 2px 8px; border-radius: 4px; flex-shrink: 0; }
        .casi-vf-amt.u { color: var(--casi-accent); background: rgba(var(--casi-accent-rgb), 0.08); }
        .casi-vf-amt.e { color: var(--casi-accent); background: rgba(var(--casi-accent-rgb), 0.08); }
        .casi-vf-amt.f { color: var(--casi-text-dim); background: var(--casi-surface-2); }
        .casi-vf-time { font-family: var(--font-casi-mono), monospace; font-size: 10px; color: var(--casi-text-dim); flex-shrink: 0; }
      `}</style>

      <div className="casi-vf-feed-head">Flashes · live</div>

      <div>
        {flashes.map(flash => (
          <div key={flash.id} className="casi-vf-item">
            <span className="casi-vf-who">{flash.who}</span>
            <span className="casi-vf-msg">{flash.message}</span>
            <span className={`casi-vf-amt ${CHIP_CLASS[flash.chip.kind]}`}>{flash.chip.label}</span>
            <span className="casi-vf-time">{flash.time}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
