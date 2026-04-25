'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import SlotMedia from '@/components/SlotMedia';

export type QueueItem = {
  id: string;
  kind: 'beam' | 'flash';
  name: string;
  subtitle: string;
  /** The final total paid — not the rate. For a 5m beam at 2 USDC/min this
   *  is "10 USDC", not "2 USDC". */
  priceLabel: string;
  /** Label rendered above priceLabel ("Total", "Refund", etc.). Defaults to "Total". */
  priceLeader?: string;
  /** When true this row shows a "Manage →" link to /admin instead of buttons —
   *  for bookings/flashes whose approve flow isn't wired here yet. */
  readOnly?: boolean;
  /** False = no Stripe PI / Solana tx / free-tier match yet. Approve button
   *  is replaced with an "Awaiting payment" pill so the streamer can't
   *  approve a booking before the viewer's funds are secured. */
  paymentConfirmed?: boolean;
  /** Booking image / video URL for the row preview thumbnail. */
  mediaUrl?: string | null;
  /** image | video — drives SlotMedia's render branch. */
  fileType?: string | null;
  /** Slot shape — masks the preview thumbnail to match what airs on stream. */
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

type FilterKey = 'all' | 'beam' | 'flash';

const FILTERS: { id: FilterKey; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'beam', label: 'Beam' },
  { id: 'flash', label: 'Flash' },
];

export default function ApprovalQueue({ items, onApprove, onReject, readOnly, pendingIds, emptyLabel }: Props) {
  const [filter, setFilter] = useState<FilterKey>('all');

  const counts = useMemo(
    () => ({
      all: items.length,
      beam: items.filter((i) => i.kind === 'beam').length,
      flash: items.filter((i) => i.kind === 'flash').length,
    }),
    [items],
  );

  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter((i) => i.kind === filter)),
    [items, filter],
  );

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
          className="font-bold"
          style={{ fontSize: '15px', letterSpacing: '-0.3px', color: 'var(--casi-text)' }}
        >
          Pending approval
        </h3>
        <span
          className="font-mono uppercase"
          style={{
            fontSize: '10px',
            letterSpacing: '0.15em',
            color: 'var(--casi-text-faint)',
          }}
        >
          Reject = instant refund · {items.length} waiting
        </span>
      </header>

      <div
        className="flex gap-1"
        style={{
          padding: '8px 12px',
          background: 'var(--casi-bg)',
          borderBottom: '1px solid var(--casi-border)',
        }}
      >
        {FILTERS.map((opt) => {
          const on = filter === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFilter(opt.id)}
              className="font-mono uppercase transition-colors"
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '10px',
                letterSpacing: '0.1em',
                color: on ? 'var(--casi-text)' : 'var(--casi-text-dim)',
                background: on ? 'var(--casi-surface)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {opt.label}
              <span style={{ color: 'var(--casi-accent)', marginLeft: '4px' }}>
                {counts[opt.id]}
              </span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
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
        visible.map((item, idx) => (
          <div
            key={item.id}
            className="grid items-center gap-3"
            style={{
              gridTemplateColumns: 'auto auto 1fr auto',
              padding: '12px 16px',
              borderBottom: idx === visible.length - 1 ? 'none' : '1px solid var(--casi-border)',
            }}
          >
            <QueuePreviewThumb
              mediaUrl={item.mediaUrl}
              fileType={item.fileType}
              shape={item.shape}
              kind={item.kind}
            />
            <span
              className="text-center font-mono uppercase"
              style={{
                width: '44px',
                padding: '4px 6px',
                borderRadius: '6px',
                background: 'rgba(var(--casi-accent-rgb), 0.1)',
                color: 'var(--casi-accent)',
                fontSize: '9px',
                letterSpacing: '0.1em',
              }}
            >
              {item.kind === 'beam' ? 'Beam' : 'Flash'}
            </span>
            <div>
              <div
                className="font-semibold"
                style={{ fontSize: '13px', color: 'var(--casi-text)', lineHeight: 1.3 }}
              >
                {item.name}
              </div>
              <div
                className="font-mono uppercase"
                style={{
                  fontSize: '10px',
                  letterSpacing: '0.1em',
                  color: 'var(--casi-text-dim)',
                  marginTop: '3px',
                }}
              >
                {item.subtitle}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="mr-1 text-right">
                <div
                  className="font-mono uppercase"
                  style={{
                    fontSize: '9px',
                    letterSpacing: '0.12em',
                    color: 'var(--casi-text-faint)',
                    marginBottom: '1px',
                  }}
                >
                  {item.priceLeader ?? 'Total'}
                </div>
                <div
                  className="font-mono font-medium"
                  style={{ fontSize: '13px', color: 'var(--casi-accent)' }}
                >
                  {item.priceLabel}
                </div>
              </div>
              {(item.readOnly ?? readOnly) ? (
                <Link
                  href="/admin"
                  title="Approve or reject in the classic studio — the real payment + escrow flow runs there for now."
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
                  {(() => {
                    const isPending = pendingIds?.has(item.id) ?? false;
                    // Default to true for back-compat with surfaces that don't
                    // pass the field; the streamer-side check is the safety
                    // net but the explicit gate happens here in the UI too.
                    const paid = item.paymentConfirmed ?? true;
                    return (
                      <>
                        <button
                          type="button"
                          onClick={() => onReject?.(item.id)}
                          disabled={isPending}
                          className="font-extrabold font-mono uppercase transition-colors"
                          title={`Deny · ${item.priceLabel} refunded`}
                          style={{
                            padding: '8px 12px',
                            borderRadius: '7px',
                            background: 'transparent',
                            color: 'var(--casi-text-dim)',
                            border: '1px solid var(--casi-border-2)',
                            fontSize: '10px',
                            letterSpacing: '0.12em',
                            cursor: isPending ? 'wait' : 'pointer',
                            opacity: isPending ? 0.5 : 1,
                          }}
                        >
                          Deny
                        </button>
                        <button
                          type="button"
                          onClick={() => paid && onApprove?.(item.id)}
                          disabled={isPending || !paid}
                          className="font-extrabold font-mono uppercase"
                          title={paid
                            ? 'Approve · pushes the booking to active on stream'
                            : 'Awaiting payment — viewer hasn\'t completed the Stripe / Solana transfer yet'}
                          style={{
                            padding: '8px 12px',
                            borderRadius: '7px',
                            background: paid ? 'var(--casi-accent)' : 'var(--casi-border)',
                            color: paid ? '#050505' : 'var(--casi-text-faint)',
                            border: paid ? 'none' : '1px solid var(--casi-border-2)',
                            fontFamily: 'var(--font-casi-sans)',
                            fontSize: '10px',
                            letterSpacing: '0.12em',
                            cursor: !paid ? 'not-allowed' : isPending ? 'wait' : 'pointer',
                            opacity: isPending ? 0.5 : 1,
                          }}
                        >
                          {isPending ? '…' : paid ? 'Approve' : 'Awaiting payment'}
                        </button>
                      </>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

/**
 * 44×44 booking preview, masked to the slot's shape so the streamer sees
 * the actual content they're approving (not just text). Falls back to a
 * letter glyph when no media is attached (text-only flashes, banner
 * messages, attach-failed bookings).
 */
function QueuePreviewThumb({
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
  const tile: React.CSSProperties = {
    width: '44px',
    height: '44px',
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
        style={{
          ...tile,
          color: kind === 'flash' ? 'var(--casi-accent)' : 'var(--casi-accent2)',
          fontSize: '14px',
        }}
        aria-hidden
      >
        {kind === 'flash' ? '⚡' : '✦'}
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
