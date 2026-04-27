'use client';

import Link from 'next/link';
import SlotMedia from '@/components/SlotMedia';

export type QueueItem = {
  id: string;
  kind: 'beam' | 'flash';
  name: string;
  subtitle: string;
  /** The final total paid — not the rate. For a 5m beam at 2 USDC/min this
   *  is "10 USDC", not "2 USDC". */
  priceLabel: string;
  /** When true this row shows a "Manage →" link to /admin instead of buttons —
   *  for bookings/flashes whose approve flow isn't wired here yet. */
  readOnly?: boolean;
  /** Viewer's uploaded media — when present, renders as the row thumb so
   *  the streamer sees what they're approving before clicking. */
  mediaUrl?: string | null;
  /** image | video — drives the SlotMedia branch. */
  fileType?: string | null;
  /** Slot shape so the thumb is masked to match the on-stream rendering
   *  (circle / hex / banner / rounded / rect). */
  shape?: string | null;
};

type Props = {
  items: QueueItem[];
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  /** Global fallback — when a QueueItem doesn't set readOnly, this prop wins. */
  readOnly?: boolean;
  /** Per-row disabled state — set while an approve/reject is in flight. */
  pendingIds?: ReadonlySet<string>;
  /** Optional empty-state override — defaults to "Nothing waiting". */
  emptyLabel?: string;
};

/**
 * v7 .q-r.beam / .q-r.flash flat-row list. The kind shows as a 3px
 * left-border rail (accent for beams, "live" green for flashes — both
 * the same teal in Casi Dark, but the alpha differs to keep them
 * visually distinct). Filter tabs from v3 dropped to match v7.
 */
export default function ApprovalQueue({
  items,
  onApprove,
  onReject,
  readOnly,
  pendingIds,
  emptyLabel,
}: Props) {
  return (
    <section className="flex flex-col">
      <style>{`
        .casi-q-r {
          display: flex; align-items: center; gap: 14px;
          padding: 13px 16px;
          border-bottom: 1px solid var(--casi-border);
          border-left: 3px solid transparent;
          transition: background .12s, border-color .12s;
        }
        .casi-q-r:last-child { border-bottom: none; }
        .casi-q-r:hover { background: rgba(255,255,255,0.01); }
        .casi-q-r.beam { border-left-color: rgba(var(--casi-accent-rgb), 0.35); }
        .casi-q-r.flash { border-left-color: rgba(var(--casi-accent-rgb), 0.15); }
        .casi-q-no:hover { border-color: rgba(239,68,68,0.3) !important; color: #f87171 !important; }
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
        <span>Pending approval</span>
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
          {items.length}
        </span>
      </div>

      <div
        style={{
          border: '1px solid var(--casi-border)',
          borderRadius: '10px',
          overflow: 'hidden',
          background: 'var(--casi-surface)',
        }}
      >
        {items.length === 0 ? (
          <div
            className="font-mono uppercase text-center"
            style={{
              padding: '32px 16px',
              fontSize: '10px',
              letterSpacing: '0.15em',
              color: 'var(--casi-text-faint)',
            }}
          >
            {emptyLabel ?? 'Nothing waiting'}
          </div>
        ) : (
          items.map(item => {
            const ro = item.readOnly ?? readOnly;
            const isPending = pendingIds?.has(item.id) ?? false;
            return (
              <div key={item.id} className={`casi-q-r ${item.kind}`}>
                <QueueThumb
                  mediaUrl={item.mediaUrl}
                  fileType={item.fileType}
                  shape={item.shape}
                  kind={item.kind}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    className="truncate"
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--casi-text)',
                      marginBottom: '2px',
                    }}
                  >
                    {item.name}
                  </div>
                  <div
                    className="truncate"
                    style={{ fontSize: '11.5px', color: 'var(--casi-text-mid)' }}
                  >
                    {item.subtitle}
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-casi-mono), monospace',
                    fontSize: '14px',
                    color: 'var(--casi-accent)',
                    whiteSpace: 'nowrap',
                    marginRight: '4px',
                  }}
                >
                  {item.priceLabel}
                </div>
                {ro ? (
                  <Link
                    href="/admin"
                    title="Manage in classic studio"
                    className="font-mono uppercase"
                    style={{
                      padding: '7px 11px',
                      borderRadius: '7px',
                      background: 'transparent',
                      border: '1px solid var(--casi-border-2)',
                      color: 'var(--casi-text-dim)',
                      fontSize: '10px',
                      letterSpacing: '0.1em',
                      textDecoration: 'none',
                    }}
                  >
                    Manage →
                  </Link>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onApprove?.(item.id)}
                      disabled={isPending}
                      title="Approve"
                      style={{
                        padding: '7px 13px',
                        borderRadius: '7px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background: 'rgba(var(--casi-accent-rgb), 0.07)',
                        border: '1px solid rgba(var(--casi-accent-rgb), 0.22)',
                        color: 'var(--casi-accent)',
                        cursor: isPending ? 'wait' : 'pointer',
                        opacity: isPending ? 0.5 : 1,
                        fontFamily: 'inherit',
                        transition: 'background .14s',
                      }}
                    >
                      {isPending ? '…' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onReject?.(item.id)}
                      disabled={isPending}
                      title={`Deny · ${item.priceLabel} refunded`}
                      className="casi-q-no"
                      style={{
                        padding: '7px 11px',
                        borderRadius: '7px',
                        fontSize: '12px',
                        fontWeight: 500,
                        background: 'transparent',
                        border: '1px solid var(--casi-border-2)',
                        color: 'var(--casi-text-dim)',
                        cursor: isPending ? 'wait' : 'pointer',
                        opacity: isPending ? 0.5 : 1,
                        fontFamily: 'inherit',
                        transition: 'all .14s',
                      }}
                    >
                      Deny
                    </button>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

/**
 * 40×40 thumbnail at the start of each queue row. When the booking has
 * uploaded media, renders it through SlotMedia masked to match the
 * on-stream slot shape (circle / hex / banner / rounded / rect) so the
 * streamer sees exactly what's about to land. Falls back to a kind-glyph
 * (✦ for beams, ⚡ for flashes) when no media — pending booking before
 * upload, text-only flash, or detached row.
 */
function QueueThumb({
  mediaUrl,
  fileType,
  shape,
  kind,
}: {
  mediaUrl?: string | null;
  fileType?: string | null;
  shape?: string | null;
  kind: 'beam' | 'flash';
}) {
  const baseTile: React.CSSProperties = {
    width: '40px',
    height: '40px',
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
  };

  if (!mediaUrl) {
    return (
      <div style={baseTile} aria-hidden>
        {kind === 'flash' ? '⚡' : '✦'}
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
