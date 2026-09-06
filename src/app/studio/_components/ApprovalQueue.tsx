'use client';

import SlotMedia from '@/components/SlotMedia';
import RailIcon from '@/components/icons/RailIcon';

export type QueueItem = {
  id: string;
  kind: 'beam' | 'flash';
  name: string;
  subtitle: string;
  /** Viewer display name alone (no snippet/duration baked in) — feeds the
   *  card's avatar initial + handle line. Falls back to parsing `name` on
   *  " · " when omitted, for any caller that hasn't been updated. */
  who?: string;
  /** "waiting 40s" / "waiting 2m" — same source as `subtitle`'s time-ago
   *  segment, phrased to match the design handoff's card copy. */
  waitingLabel?: string;
  /** The message snippet / file-type descriptor on its own, without the
   *  viewer name prefix — rendered as the card's request-text line. */
  requestText?: string;
  /** "5 min · square" style trailing meta (duration + shape/rail), shown
   *  under the request text. */
  metaLine?: string;
  /** Which rail this row settles on — drives the inline rail icon next to
   *  the price. 'usdc' covers both 'usdc' and 'solana' payment_methods. */
  rail?: 'usdc' | 'stripe' | null;
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
  /** Set false until the viewer has actually paid (Stripe PI created or
   *  Solana tx confirmed). Disables Approve and shows "Awaiting payment"
   *  so the streamer can't accidentally flip status='active' on an
   *  un-funded escrow. Free flashes / bookings come through as true. */
  paymentConfirmed?: boolean;
};

type Props = {
  items: QueueItem[];
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  /** Click the row's thumb / name to open a full preview modal. */
  onPreview?: (id: string) => void;
  /** Global fallback — when a QueueItem doesn't set readOnly, this prop wins. */
  readOnly?: boolean;
  /** Per-row disabled state — set while an approve/reject is in flight. */
  pendingIds?: ReadonlySet<string>;
  /** Optional empty-state override — defaults to "Nothing waiting". */
  emptyLabel?: string;
};

/**
 * "Waiting" queue — a stack of rounded cards, one per pending request,
 * matching the design_handoff prototype (avatar initial + handle + italic
 * "wants … · waiting Ns" meta + amount, thumbnail + request text + duration
 * meta, then a quiet outline Deny next to a solid Approve — kept as "Deny"
 * rather than the prototype's "Decline" label, matching the app's own
 * established copy (denyBooking(), onDeny/onReject). Behaviour
 * is untouched from the earlier flat-row version: same props, same
 * payment-gating on Approve, same preview-on-click, same pendingIds/
 * readOnly handling.
 */
export default function ApprovalQueue({
  items,
  onApprove,
  onReject,
  onPreview,
  readOnly,
  pendingIds,
  emptyLabel,
}: Props) {
  return (
    <section className="flex flex-col" style={{ gap: '12px' }}>
      <div
        className="flex items-baseline"
        style={{ gap: '10px' }}
      >
        <div style={{ fontFamily: 'var(--H)', fontWeight: 800, fontVariationSettings: '"opsz" 64', fontSize: '24px', letterSpacing: '-0.02em', color: 'var(--text)' }}>
          Waiting
        </div>
        <div className="casi-meta-italic" style={{ fontSize: '15px' }}>
          {items.length} waiting
        </div>
      </div>

      {items.length === 0 ? (
        <div
          style={{
            border: `1px dashed var(--line-2)`,
            borderRadius: 'var(--radius-panel)',
            padding: '26px',
            textAlign: 'center',
          }}
        >
          <span className="casi-meta-italic" style={{ fontSize: '15px' }}>
            {emptyLabel ?? 'Nothing waiting'}
          </span>
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: '10px' }}>
          {items.map(item => {
            const ro = item.readOnly ?? readOnly;
            const isPending = pendingIds?.has(item.id) ?? false;
            // Gate Approve on real payment. Both bookings and flashes pass
            // paymentConfirmed; undefined still falls through to "confirmed"
            // for any future caller that omits it.
            const paid = item.paymentConfirmed !== false;
            const previewable = !!onPreview && !ro;

            // Fall back to parsing `name`/`subtitle` for any caller that
            // hasn't been updated to pass the split fields — keeps this
            // component working even if a future consumer only sets the
            // original two strings.
            const who = item.who ?? item.name.split(' · ')[0] ?? item.name;
            const waitingLabel = item.waitingLabel ?? item.subtitle;
            const requestText = item.requestText ?? item.name.split(' · ').slice(1).join(' · ');
            const initial = (who || '?').trim().slice(0, 1).toUpperCase();

            return (
              <div key={item.id} className="casi-card" style={{ padding: '16px' }}>
                <button
                  type="button"
                  onClick={previewable ? () => onPreview!(item.id) : undefined}
                  disabled={!previewable}
                  title={previewable ? 'Preview' : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    width: '100%',
                    padding: 0,
                    border: 'none',
                    background: 'transparent',
                    color: 'inherit',
                    textAlign: 'left',
                    cursor: previewable ? 'zoom-in' : 'default',
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '999px',
                      background: 'var(--ink)',
                      color: 'var(--on-ink)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'var(--M)',
                      fontWeight: 600,
                      fontSize: '12px',
                      flexShrink: 0,
                    }}
                  >
                    {initial}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      className="truncate"
                      style={{ fontFamily: 'var(--B)', fontWeight: 700, fontSize: '17px', letterSpacing: '-0.01em', color: 'var(--text)' }}
                    >
                      {who}
                    </div>
                    <div className="truncate casi-meta-italic" style={{ fontSize: '14px', marginTop: '3px' }}>
                      {waitingLabel}
                      {!paid ? (
                        <>
                          <span style={{ opacity: 0.5, margin: '0 6px' }}>·</span>
                          <span style={{ color: '#c08a12', fontStyle: 'normal' }}>awaiting payment</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--M)',
                      fontWeight: 600,
                      fontSize: '15px',
                      color: 'var(--text-2)',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      flexShrink: 0,
                    }}
                  >
                    {item.rail ? <RailIcon method={item.rail} size={12} /> : null}
                    {item.priceLabel}
                  </div>
                </button>

                <div className="flex" style={{ gap: '12px', marginTop: '13px' }}>
                  <QueueThumb
                    mediaUrl={item.mediaUrl}
                    fileType={item.fileType}
                    shape={item.shape}
                    kind={item.kind}
                  />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '6px' }}>
                    {requestText ? (
                      <div className="truncate" style={{ fontFamily: 'var(--S)', fontSize: '15px', color: 'var(--text)' }}>
                        {requestText}
                      </div>
                    ) : null}
                    {item.metaLine ? (
                      <div className="casi-meta-italic truncate" style={{ fontSize: '13px' }}>
                        {item.metaLine}
                      </div>
                    ) : null}
                  </div>
                </div>

                {ro ? null : (
                  <div className="flex" style={{ gap: '8px', marginTop: '14px' }}>
                    <button
                      type="button"
                      onClick={() => onReject?.(item.id)}
                      disabled={isPending}
                      title={`Deny · ${item.priceLabel} refunded`}
                      className="casi-pill-ghost"
                      style={{ flex: 1, height: '44px', fontSize: '15px', opacity: isPending ? 0.5 : 1, cursor: isPending ? 'wait' : 'pointer' }}
                    >
                      {/* "Deny" (not the prototype's "Decline") — matches
                          the app's own established copy; look changed,
                          copy didn't. */}
                      Deny
                    </button>
                    <button
                      type="button"
                      onClick={() => onApprove?.(item.id)}
                      disabled={isPending || !paid}
                      title={paid ? 'Approve' : 'Awaiting viewer payment — refresh in a moment'}
                      className="casi-pill-solid"
                      style={{
                        flex: 2,
                        height: '44px',
                        fontSize: '15px',
                        cursor: isPending ? 'wait' : (paid ? 'pointer' : 'not-allowed'),
                      }}
                    >
                      {isPending ? '…' : (paid ? 'Approve' : 'Awaiting payment')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
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
    width: '96px',
    height: '66px',
    borderRadius: 'var(--radius-chip)',
    background: 'var(--casi-surface-2)',
    border: '1px solid var(--casi-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
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
    shape === 'circle' || shape === 'custom' ? 'circle(50%)' :
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
        borderRadius: shape === 'circle' || shape === 'custom' ? 0 : borderRadius,
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
