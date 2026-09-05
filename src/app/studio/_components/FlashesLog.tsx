'use client';

import RailIcon from '@/components/icons/RailIcon';

export type FlashLogItem = {
  id: string;
  time: string;
  who: string;
  message: string;
  chip: { kind: 'free' | 'usdc' | 'fiat'; label: string };
  pinned?: boolean;
};

type Props = {
  items: FlashLogItem[];
  /** Today's total in the streamer's chosen display currency, pre-formatted
   *  (e.g. "€48", "5 USDC", or "—" when zero). Other-rail flashes are
   *  excluded from this number — they still appear as rows above so the
   *  streamer sees them, just don't count toward the total. */
  total: string;
};

const CHIP_CLASS: Record<FlashLogItem['chip']['kind'], string> = {
  usdc: 'u',
  fiat: 'e',
  free: 'f',
};

/**
 * v7 .fl-r flat-row list. Time / who / message / amount-chip. Only approved
 * flashes appear — denied rows refund on-chain immediately so there's nothing
 * useful to surface here. Post-approval refund isn't offered: funds have
 * already settled to the streamer (Stripe capture / on-chain approve_flash),
 * and the program has no clawback instruction. Footer tile shows today's
 * totals.
 */
export default function FlashesLog({ items, total }: Props) {
  return (
    <section className="casi-card flex flex-col" style={{ padding: '16px 18px' }}>
      <style>{`
        .casi-fl-r {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 0;
          border-bottom: 1px solid var(--line);
          transition: background .12s;
        }
        .casi-fl-r:last-child { border-bottom: none; }
        .casi-fl-amt.u { color: var(--casi-accent); background: rgba(var(--casi-accent-rgb), 0.07); }
        .casi-fl-amt.e { color: var(--casi-accent); background: rgba(var(--casi-accent-rgb), 0.07); }
        .casi-fl-amt.f { color: var(--casi-text-dim); background: var(--casi-surface-2); }
      `}</style>

      <div
        className="flex items-baseline"
        style={{ gap: '10px', paddingBottom: '13px' }}
      >
        <div style={{ fontFamily: 'var(--H)', fontWeight: 800, fontVariationSettings: '"opsz" 64', fontSize: '20px', letterSpacing: '-0.02em', color: 'var(--text)' }}>
          Flashes
        </div>
        <div className="casi-meta-italic" style={{ fontSize: '13px', flex: 1 }}>
          today
        </div>
        <div style={{ fontFamily: 'var(--M)', fontSize: '13px', color: 'var(--text-3)' }}>
          {items.length}
        </div>
      </div>

      <div>
        {items.length === 0 ? (
          <div
            style={{
              border: '1px dashed var(--line-2)',
              borderRadius: 'var(--radius-card)',
              padding: '20px',
              textAlign: 'center',
            }}
          >
            <span className="casi-meta-italic" style={{ fontSize: '15px' }}>No flashes yet today.</span>
          </div>
        ) : (
          items.map(flash => {
            const chipClass = CHIP_CLASS[flash.chip.kind];
            return (
              <div key={flash.id} className="casi-fl-r">
                <span
                  style={{
                    fontFamily: 'var(--font-casi-mono), monospace',
                    fontSize: '10px',
                    color: 'var(--casi-text-faint)',
                    width: '32px',
                    flexShrink: 0,
                  }}
                >
                  {flash.time}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--B)',
                    fontSize: '15px',
                    fontWeight: 700,
                    color: 'var(--casi-text)',
                    flexShrink: 0,
                    minWidth: '80px',
                  }}
                >
                  {flash.who}
                </span>
                <span
                  className="truncate casi-meta-italic"
                  style={{
                    fontSize: '14px',
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {flash.message}
                </span>
                <span
                  className={`casi-fl-amt ${chipClass}`}
                  style={{
                    fontFamily: 'var(--M), var(--font-casi-mono), monospace',
                    fontSize: '11.5px',
                    flexShrink: 0,
                    padding: '3px 9px',
                    borderRadius: 'var(--radius-chip)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  {flash.chip.kind !== 'free' ? (
                    <RailIcon
                      method={flash.chip.kind === 'usdc' ? 'usdc' : 'stripe'}
                      size={11}
                    />
                  ) : null}
                  {flash.chip.label}
                </span>
              </div>
            );
          })
        )}
        <div
          className="casi-meta-italic"
          style={{
            padding: '13px 0 0',
            marginTop: '3px',
            borderTop: '1px solid var(--line)',
            fontSize: '14px',
            display: 'flex',
            gap: '8px',
          }}
        >
          Today: <strong style={{ color: 'var(--ink)', fontStyle: 'normal', fontWeight: 700, fontFamily: 'var(--M)' }}>{total}</strong>
        </div>
      </div>
    </section>
  );
}
