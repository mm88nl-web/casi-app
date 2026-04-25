'use client';

import SlotMedia from '@/components/SlotMedia';

export type QueuedItem = {
  id: string;
  /** Slot label like "hex · top-right" so streamers know where this lands. */
  slotLabel: string | null;
  /** Display name + content snippet, e.g. "CoolTiger42 · "happy bday"". */
  name: string;
  /** Time-ago + payment + duration meta line. */
  subtitle: string;
  /** Pre-formatted total ("5 USDC", "€15") for the right column. */
  priceLabel: string;
  /** Booking media for the masked thumb. */
  mediaUrl?: string | null;
  fileType?: string | null;
  shape?: string | null;
};

type Props = {
  items: QueuedItem[];
  /** Promote this booking to active right now (kicks current beam on the slot). */
  onPlayNow: (id: string) => void;
  /** Deny + refund this queued booking. */
  onRemove: (id: string) => void;
  /** Set of ids currently being acted on — disables both buttons + shows wait. */
  pendingIds?: ReadonlySet<string>;
};

export default function QueuedBookings({ items, onPlayNow, onRemove, pendingIds }: Props) {
  if (items.length === 0) return null;

  return (
    <section
      className="overflow-hidden"
      style={{
        background: 'var(--casi-surface)',
        border: '1px solid var(--casi-border)',
        borderRadius: '18px',
      }}
    >
      <header
        className="flex items-center justify-between"
        style={{ padding: '16px 18px', borderBottom: '1px solid var(--casi-border)' }}
      >
        <h3
          className="font-bold flex items-center gap-2"
          style={{ fontSize: '15px', letterSpacing: '-0.3px', color: 'var(--casi-text)' }}
        >
          Up next
          <span
            className="font-mono uppercase"
            style={{
              fontSize: '10px',
              letterSpacing: '0.15em',
              padding: '3px 10px',
              borderRadius: '999px',
              background: 'rgba(var(--casi-accent-rgb), 0.1)',
              color: 'var(--casi-accent)',
              border: '1px solid rgba(var(--casi-accent-rgb), 0.25)',
              fontWeight: 500,
            }}
          >
            {items.length} queued
          </span>
        </h3>
        <span
          className="font-mono uppercase"
          style={{
            fontSize: '10px',
            letterSpacing: '0.15em',
            color: 'var(--casi-text-faint)',
          }}
        >
          Approved · waiting for slot
        </span>
      </header>

      {items.map((item, idx) => {
        const isPending = pendingIds?.has(item.id) ?? false;
        return (
          <div
            key={item.id}
            className="grid items-center gap-3"
            style={{
              gridTemplateColumns: 'auto 1fr auto',
              padding: '12px 16px',
              borderBottom: idx === items.length - 1 ? 'none' : '1px solid var(--casi-border)',
              opacity: isPending ? 0.55 : 1,
            }}
          >
            <QueuedThumb
              mediaUrl={item.mediaUrl}
              fileType={item.fileType}
              shape={item.shape}
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
                {item.slotLabel ? <>{item.slotLabel} · </> : null}
                {item.subtitle}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="font-mono"
                style={{ fontSize: '12px', color: 'var(--casi-accent)', fontWeight: 500 }}
              >
                {item.priceLabel}
              </span>
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                disabled={isPending}
                title="Remove + refund this queued booking"
                className="font-mono uppercase"
                style={{
                  padding: '7px 11px',
                  borderRadius: '7px',
                  background: 'transparent',
                  border: '1px solid var(--casi-border-2)',
                  color: 'var(--casi-text-dim)',
                  fontSize: '10px',
                  letterSpacing: '0.12em',
                  cursor: isPending ? 'wait' : 'pointer',
                }}
              >
                Remove
              </button>
              <button
                type="button"
                onClick={() => onPlayNow(item.id)}
                disabled={isPending}
                title="End the current beam on this slot and start this one immediately"
                className="font-extrabold font-mono uppercase"
                style={{
                  padding: '7px 11px',
                  borderRadius: '7px',
                  background: 'var(--casi-accent2)',
                  color: '#050505',
                  border: 'none',
                  fontFamily: 'var(--font-casi-sans)',
                  fontSize: '10px',
                  letterSpacing: '0.12em',
                  cursor: isPending ? 'wait' : 'pointer',
                }}
              >
                {isPending ? '…' : 'Play now ▶'}
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function QueuedThumb({
  mediaUrl,
  fileType,
  shape,
}: {
  mediaUrl?: string | null;
  fileType?: string | null;
  shape?: string | null;
}) {
  const tile: React.CSSProperties = {
    width: '40px',
    height: '40px',
    borderRadius: '8px',
    background: '#0a0a0a',
    border: '1px solid var(--casi-border-2)',
    flexShrink: 0,
    overflow: 'hidden',
    position: 'relative',
  };

  if (!mediaUrl) {
    return (
      <div
        className="flex items-center justify-center font-mono"
        style={{ ...tile, color: 'var(--casi-accent)', fontSize: '13px' }}
        aria-hidden
      >
        ⌛
      </div>
    );
  }

  const clipPath =
    shape === 'circle' ? 'circle(50%)' :
    shape === 'hex' ? 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)' :
    undefined;
  const radius =
    shape === 'rounded' ? 10 :
    shape === 'rect' || shape === 'banner' ? 4 :
    shape === 'backdrop' ? 4 :
    8;

  return (
    <div style={{ ...tile, borderRadius: shape === 'circle' || shape === 'hex' ? 0 : radius }}>
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
