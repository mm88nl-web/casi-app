'use client';

import SlotMedia from '@/components/SlotMedia';

export type AiringItem = {
  id: string;
  icon: string;
  name: string;
  subtitle: string;
  /** Countdown for timed items (beams). */
  remaining?: string;
  /** How many bookings are queued behind this active one. */
  queueCount?: number;
  /** End-early handler — only for items the streamer can actually kick. */
  onEndEarly?: () => void;
  /** True while end-early is in flight. Disables the button. */
  endingEarly?: boolean;
  /** The viewer's uploaded image / video URL. When present, renders as the
   *  row thumbnail with the slot's shape mask so each airing row looks
   *  distinct — "circle with cat pic" vs "hex with logo" at a glance. */
  mediaUrl?: string | null;
  /** File type hint for SlotMedia (image vs video branch). */
  fileType?: string | null;
  /** Slot shape for the mask: circle | hex | rounded | banner | backdrop | rect. */
  shape?: string | null;
};

type Props = {
  items: AiringItem[];
};

/**
 * v7 .air-r flat-row list. Section title + count above; rounded
 * border-shell wraps the rows inside.
 */
export default function AiringNow({ items }: Props) {
  return (
    <section className="flex flex-col">
      <style>{`
        .casi-air-r { display: flex; align-items: center; gap: 14px; padding: 13px 16px; border-bottom: 1px solid var(--casi-border); transition: background .12s; }
        .casi-air-r:last-child { border-bottom: none; }
        .casi-air-r:hover { background: rgba(255,255,255,0.01); }
        .casi-air-end:hover { border-color: rgba(239,68,68,0.3) !important; color: #f87171 !important; }
      `}</style>

      <SectionTitle title="Airing now" count={items.length} />

      <div
        style={{
          border: '1px solid var(--casi-border)',
          borderRadius: '10px',
          overflow: 'hidden',
          background: 'var(--casi-surface)',
          maxHeight: '380px',
          overflowY: 'auto',
        }}
      >
        {items.map(item => (
          <div key={item.id} className="casi-air-r">
            <AiringThumb
              mediaUrl={item.mediaUrl}
              fileType={item.fileType}
              shape={item.shape}
              icon={item.icon}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="truncate"
                style={{ fontSize: '13px', fontWeight: 600, color: 'var(--casi-text)' }}
              >
                {item.name}
              </div>
              <div
                className="truncate"
                style={{
                  fontSize: '11.5px',
                  color: 'var(--casi-text-mid)',
                  marginTop: '2px',
                }}
              >
                {item.subtitle}
                {item.queueCount && item.queueCount > 0 ? (
                  <>
                    <span style={{ opacity: 0.4, margin: '0 6px' }}>·</span>
                    <span style={{ color: 'var(--casi-accent)' }}>
                      {item.queueCount} in queue
                    </span>
                  </>
                ) : null}
              </div>
            </div>
            {item.remaining ? (
              <div
                style={{
                  fontFamily: 'var(--font-casi-mono), monospace',
                  fontSize: '20px',
                  color: 'var(--casi-accent)',
                  whiteSpace: 'nowrap',
                  letterSpacing: '-0.5px',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {item.remaining}
              </div>
            ) : (
              <div
                className="font-mono uppercase"
                style={{
                  fontSize: '10px',
                  letterSpacing: '0.15em',
                  color: 'var(--casi-accent)',
                }}
              >
                on stream
              </div>
            )}
            {item.onEndEarly ? (
              <button
                type="button"
                onClick={item.onEndEarly}
                disabled={item.endingEarly}
                title="End early · prorata refund to viewer"
                className="casi-air-end"
                style={{
                  padding: '6px 11px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 500,
                  border: '1px solid var(--casi-border-2)',
                  background: 'transparent',
                  color: 'var(--casi-text-dim)',
                  cursor: item.endingEarly ? 'wait' : 'pointer',
                  opacity: item.endingEarly ? 0.5 : 1,
                  fontFamily: 'inherit',
                  transition: 'border-color .14s, color .14s',
                }}
              >
                {item.endingEarly ? '…' : 'End early'}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
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
      <span>{title}</span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '18px',
          height: '18px',
          padding: '0 5px',
          borderRadius: '5px',
          background: 'rgba(var(--casi-accent-rgb), 0.12)',
          color: 'var(--casi-accent)',
          fontFamily: 'var(--font-casi-mono), monospace',
          fontSize: '10px',
        }}
      >
        {count}
      </span>
    </div>
  );
}

/**
 * 44×44 slot thumbnail, masked to the element's shape. When the booking has
 * no media (pending, banner-text-only, detached) or no shape is known,
 * falls back to the plain emoji icon tile.
 */
function AiringThumb({
  mediaUrl,
  fileType,
  shape,
  icon,
}: {
  mediaUrl?: string | null;
  fileType?: string | null;
  shape?: string | null;
  icon: string;
}) {
  const size = 44;
  const baseTile: React.CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '7px',
    background: 'var(--casi-surface-2)',
    border: '1px solid var(--casi-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    color: 'var(--casi-accent)',
    flexShrink: 0,
    overflow: 'hidden',
    position: 'relative',
    outline: '2px solid rgba(var(--casi-accent-rgb), 0.2)',
    outlineOffset: '2px',
  };

  if (!mediaUrl) {
    return (
      <div style={baseTile} aria-hidden>
        {icon}
      </div>
    );
  }

  const clipPath =
    shape === 'circle' ? 'circle(50%)' :
    shape === 'hex' ? 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)' :
    undefined;
  const borderRadius =
    shape === 'rounded' ? 8 :
    shape === 'rect' || shape === 'banner' ? 4 :
    shape === 'backdrop' ? 4 :
    7;

  return (
    <div
      style={{
        ...baseTile,
        borderRadius: shape === 'circle' || shape === 'hex' ? 0 : borderRadius,
        background: 'var(--casi-bg)',
      }}
    >
      <div style={{ width: '100%', height: '100%', clipPath }}>
        <SlotMedia
          src={mediaUrl}
          fileType={fileType ?? null}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    </div>
  );
}
