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

export default function AiringNow({ items }: Props) {
  return (
    <section
      className="flex flex-col gap-3"
      style={{
        background: 'var(--casi-surface)',
        border: '1px solid var(--casi-border)',
        borderRadius: '18px',
        padding: '18px',
      }}
    >
      <header
        className="flex items-center justify-between font-bold"
        style={{ fontSize: '15px', letterSpacing: '-0.3px', color: 'var(--casi-text)' }}
      >
        <span>Airing now</span>
        <span
          className="font-mono uppercase"
          style={{
            fontSize: '10px',
            letterSpacing: '0.15em',
            padding: '3px 10px',
            borderRadius: '999px',
            background: 'rgba(var(--casi-accent2-rgb), 0.1)',
            color: 'var(--casi-accent2)',
            border: '1px solid rgba(var(--casi-accent2-rgb), 0.25)',
            fontWeight: 500,
          }}
        >
          {items.length} live
        </span>
      </header>

      {/* Scroll container — approved flashes never auto-expire (pending | approved | denied),
          so a streamer with a long stream accumulates dozens of "on stream" rows. Cap the
          visible area at ~5 rows and scroll the rest so the rest of /studio stays reachable. */}
      <div
        className="flex flex-col gap-2 overflow-y-auto pr-1"
        style={{
          maxHeight: '340px',
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--casi-border-2) transparent',
        }}
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="grid items-center gap-2.5 shrink-0"
            style={{
              gridTemplateColumns: '36px 1fr auto',
              padding: '10px 12px',
              background: 'var(--casi-bg)',
              border: '1px solid var(--casi-border-2)',
              borderRadius: '10px',
            }}
          >
            <AiringThumb
              mediaUrl={item.mediaUrl}
              fileType={item.fileType}
              shape={item.shape}
              icon={item.icon}
            />
            <div className="min-w-0">
              <div
                className="font-semibold truncate"
                style={{ fontSize: '13px', color: 'var(--casi-text)' }}
              >
                {item.name}
              </div>
              <div
                className="font-mono uppercase truncate"
                style={{
                  fontSize: '10px',
                  letterSpacing: '0.1em',
                  color: 'var(--casi-text-dim)',
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
            <div className="flex items-center gap-2">
              {item.remaining ? (
                <div
                  className="font-mono font-medium"
                  style={{ fontSize: '14px', color: 'var(--casi-accent2)' }}
                >
                  {item.remaining}
                </div>
              ) : (
                <div
                  className="font-mono uppercase"
                  style={{
                    fontSize: '10px',
                    letterSpacing: '0.15em',
                    color: 'var(--casi-accent2)',
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
                  className="font-mono uppercase transition-colors"
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    background: 'transparent',
                    border: '1px solid var(--casi-border-2)',
                    color: 'var(--casi-text-dim)',
                    fontSize: '10px',
                    letterSpacing: '0.12em',
                    cursor: item.endingEarly ? 'wait' : 'pointer',
                    opacity: item.endingEarly ? 0.5 : 1,
                  }}
                >
                  {item.endingEarly ? '…' : 'End early'}
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * 36×36 slot thumbnail, masked to the element's shape. When the booking has
 * no media (pending or a banner beam with text only) or no shape is known,
 * falls back to the plain emoji icon tile we were rendering before.
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
  const size = 36;
  const baseTile: React.CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '8px',
    background:
      'linear-gradient(135deg, rgba(var(--casi-accent2-rgb), 0.3), rgba(var(--casi-accent-rgb), 0.2))',
    fontSize: '16px',
    flexShrink: 0,
    overflow: 'hidden',
    position: 'relative',
  };

  // No media (pending booking, banner text-only, detached row): plain icon tile.
  if (!mediaUrl) {
    return (
      <div className="flex items-center justify-center" style={baseTile} aria-hidden>
        {icon}
      </div>
    );
  }

  // Per-shape mask. Matches the overlay / StudioLiveEditor rules so the
  // thumb looks like a miniature of what viewers see on stream.
  const clipPath =
    shape === 'circle' ? 'circle(50%)' :
    shape === 'hex' ? 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)' :
    undefined;
  const borderRadius =
    shape === 'rounded' ? 8 :
    shape === 'rect' || shape === 'banner' ? 4 :
    shape === 'backdrop' ? 4 :
    8;

  return (
    <div
      style={{
        ...baseTile,
        borderRadius: shape === 'circle' || shape === 'hex' ? 0 : borderRadius,
        background: '#0a0a0a',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          clipPath,
        }}
      >
        <SlotMedia
          src={mediaUrl}
          fileType={fileType ?? null}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    </div>
  );
}
