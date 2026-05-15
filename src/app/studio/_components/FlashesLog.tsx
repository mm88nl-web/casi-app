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
    <section className="flex flex-col">
      <style>{`
        .casi-fl-r {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 16px;
          border-bottom: 1px solid var(--casi-border);
          transition: background .12s;
        }
        .casi-fl-r:last-child { border-bottom: none; }
        .casi-fl-r:hover { background: rgba(255,255,255,0.01); }
        .casi-fl-amt.u { color: var(--casi-accent); background: rgba(var(--casi-accent-rgb), 0.07); }
        .casi-fl-amt.e { color: var(--casi-accent); background: rgba(var(--casi-accent-rgb), 0.07); }
        .casi-fl-amt.f { color: var(--casi-text-dim); background: var(--casi-surface-2); }
      `}</style>

      <div
        className="font-mono uppercase flex items-center"
        style={{
          gap: '8px',
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--casi-text-mid)',
          letterSpacing: '0.08em',
          paddingBottom: '10px',
        }}
      >
        Flashes · today
      </div>

      <div
        style={{
          border: '1px solid var(--line)',
          borderRadius: 0,
          background: 'var(--surf)',
          overflow: 'hidden',
        }}
      >
        {items.length === 0 ? (
          <div
            className="font-mono uppercase text-center"
            style={{
              padding: '40px 16px',
              fontSize: '10px',
              letterSpacing: '0.15em',
              color: 'var(--casi-text-faint)',
            }}
          >
            No flashes yet today
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
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--casi-text)',
                    flexShrink: 0,
                    minWidth: '80px',
                  }}
                >
                  {flash.who}
                </span>
                <span
                  className="truncate"
                  style={{
                    fontSize: '12.5px',
                    color: 'var(--casi-text-mid)',
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
                    padding: '2px 8px',
                    borderRadius: 0,
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
          style={{
            padding: '10px 16px',
            borderTop: '1px solid var(--casi-border)',
            fontSize: '12px',
            color: 'var(--casi-text-mid)',
            display: 'flex',
            gap: '16px',
            background: 'rgba(255,255,255,0.01)',
          }}
        >
          Today: <strong style={{ color: 'var(--ink)', fontWeight: 500, marginLeft: '4px', fontFamily: 'var(--M), var(--font-casi-mono), monospace' }}>{total}</strong>
        </div>
      </div>
    </section>
  );
}
