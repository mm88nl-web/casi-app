'use client';

import { useState } from 'react';
import SlotMedia from '@/components/SlotMedia';
import RailIcon from '@/components/icons/RailIcon';

export type QueuedRowItem = {
  /** Stable React key + id for the playNow callback. The raw booking id. */
  id: string;
  viewerName: string;
  /** Short message snippet, may be empty for video-only or no-message bookings. */
  message?: string | null;
  /** Full price for the booking (rate × duration), pre-formatted in the
   *  rail's currency — e.g. "€10", "5 USDC". */
  total: string;
  /** Which rail this row settles on — drives the inline rail icon next
   *  to the price. */
  rail?: 'usdc' | 'stripe' | null;
  /** Duration in minutes — shown next to the price as context. */
  durationMin: number;
  fileType?: string | null;
  mediaUrl?: string | null;
  shape?: string | null;
};

export type AiringItem = {
  id: string;
  icon: string;
  name: string;
  subtitle: string;
  /** Countdown for timed items (beams). */
  remaining?: string;
  /** Which rail this beam settles on — drives the inline rail icon next
   *  to the earned/total label. Null for free beams. */
  rail?: 'usdc' | 'stripe' | null;
  /** Live earned / total label, e.g. "€4 / €10" or "8 / 20 USDC". Computed
   *  by the parent each tick using the same vesting math the on-chain
   *  program runs at settle, so the number reads as "what the streamer
   *  pockets if this beam ends right now". Hidden for free beams. */
  earnedLabel?: string;
  /** End-early handler — only for items the streamer can actually kick. */
  onEndEarly?: () => void;
  /** True while end-early is in flight. Disables the button. */
  endingEarly?: boolean;
  /** Per-slot queue (other bookings waiting for this same element_id).
   *  Sorted in queue order — index 0 is up next. The row collapses the
   *  queue behind a "Queue · N" pill the streamer can expand. */
  queue?: QueuedRowItem[];
  /** Promote a queued booking — kicks the current beam (prorated settle on
   *  Solana / prorated capture on Stripe), starts the chosen booking. The
   *  rest of the queue stays intact. Receives the queued booking's id. */
  onPlayNow?: (queuedBookingId: string) => void;
  /** Booking id currently being promoted via Play now — disables the button. */
  playingNowId?: string | null;
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
 * border-shell wraps the rows inside. Each row with a non-empty queue
 * exposes a "Queue · N" toggle that expands an inline strip with the
 * waiting bookings + Play Now per item.
 */
export default function AiringNow({ items }: Props) {
  // Only one row's queue is open at a time; clicking another collapses
  // the previous. State lives here (not on AiringItem) so the parent
  // doesn't need to round-trip through React props for a pure UI toggle.
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="flex flex-col">
      <style>{`
        .casi-air-r { display: flex; align-items: center; gap: 14px; padding: 13px 16px; border-bottom: 1px solid var(--casi-border); transition: background .12s; }
        .casi-air-row-wrap:last-child .casi-air-r { border-bottom: none; }
        .casi-air-r:hover { background: rgba(255,255,255,0.01); }
        .casi-air-end:hover { border-color: rgba(239,68,68,0.3) !important; color: #f87171 !important; }
        .casi-air-q { padding: 10px 16px 14px 70px; background: rgba(var(--casi-accent-rgb), 0.025); border-bottom: 1px solid var(--casi-border); }
        .casi-air-row-wrap:last-child .casi-air-q { border-bottom: none; }
        .casi-air-q-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px dashed rgba(var(--casi-accent-rgb), 0.08); }
        .casi-air-q-row:first-child { border-top: none; }
        .casi-air-q-pill { padding: 4px 9px; border-radius: 5px; font-size: 10.5px; font-family: var(--font-casi-mono), monospace; letter-spacing: 0.04em; cursor: pointer; transition: border-color .12s, background .12s; }
        .casi-air-q-pill:hover { background: rgba(var(--casi-accent-rgb), 0.06); }
        .casi-air-play:hover { border-color: rgba(var(--casi-accent-rgb), 0.4) !important; color: var(--casi-accent) !important; background: rgba(var(--casi-accent-rgb), 0.08) !important; }
      `}</style>

      <SectionTitle title="Airing now" count={items.length} />

      <div
        style={{
          border: '1px solid var(--line)',
          borderRadius: 0,
          background: 'var(--surf)',
          overflow: 'hidden',
          maxHeight: '600px',
          overflowY: 'auto',
        }}
      >
        {items.map(item => {
          const queue = item.queue ?? [];
          const queueCount = queue.length;
          const expanded = openId === item.id && queueCount > 0;
          return (
            <div key={item.id} className="casi-air-row-wrap">
              <div className="casi-air-r">
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
                  </div>
                </div>
                {queueCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setOpenId(expanded ? null : item.id)}
                    className="casi-air-q-pill"
                    aria-expanded={expanded}
                    style={{
                      border: `1px solid ${expanded ? 'rgba(var(--casi-accent-rgb), 0.35)' : 'var(--casi-border-2)'}`,
                      color: expanded ? 'var(--casi-accent)' : 'var(--casi-text-dim)',
                      background: expanded ? 'rgba(var(--casi-accent-rgb), 0.06)' : 'transparent',
                    }}
                    title={expanded ? 'Hide queue' : 'Show queue'}
                  >
                    Queue · {queueCount} {expanded ? '▴' : '▾'}
                  </button>
                ) : null}
                {item.remaining ? (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: 'var(--font-casi-mono), monospace',
                        fontSize: '20px',
                        color: 'var(--casi-accent)',
                        letterSpacing: '-0.5px',
                        fontVariantNumeric: 'tabular-nums',
                        lineHeight: 1.05,
                      }}
                    >
                      {item.remaining}
                    </div>
                    {item.earnedLabel ? (
                      <div
                        style={{
                          fontFamily: 'var(--M), var(--font-casi-mono), monospace',
                          fontSize: '10.5px',
                          color: 'var(--text-3, var(--casi-text-mid))',
                          marginTop: '3px',
                          fontVariantNumeric: 'tabular-nums',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: 5,
                        }}
                        title="Earned so far / total — vests with the timer"
                      >
                        {item.rail ? <RailIcon method={item.rail} size={11} /> : null}
                        <span>{item.earnedLabel}</span>
                      </div>
                    ) : null}
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
                      borderRadius: 0,
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
              {expanded ? (
                <div className="casi-air-q">
                  {queue.map((q, idx) => {
                    const isPromoting = item.playingNowId === q.id;
                    return (
                      <div key={q.id} className="casi-air-q-row">
                        <span
                          style={{
                            fontFamily: 'var(--font-casi-mono), monospace',
                            fontSize: '10px',
                            color: 'rgba(var(--casi-accent-rgb), 0.5)',
                            width: '24px',
                            flexShrink: 0,
                          }}
                        >
                          #{idx + 1}
                        </span>
                        <QueueThumb
                          mediaUrl={q.mediaUrl}
                          fileType={q.fileType}
                          shape={q.shape}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            className="truncate"
                            style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--casi-text)' }}
                          >
                            {q.viewerName}
                          </div>
                          <div
                            className="truncate"
                            style={{ fontSize: '11px', color: 'var(--casi-text-mid)', marginTop: '1px' }}
                          >
                            {q.message ? `"${q.message.slice(0, 40)}${q.message.length > 40 ? '…' : ''}"` : (q.fileType === 'video' ? 'video clip' : 'image')}
                            <span style={{ opacity: 0.4, margin: '0 6px' }}>·</span>
                            {q.durationMin}m
                          </div>
                        </div>
                        <span
                          style={{
                            fontFamily: 'var(--M), var(--font-casi-mono), monospace',
                            fontSize: '12px',
                            color: 'var(--ink)',
                            whiteSpace: 'nowrap',
                            marginRight: '4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
                        >
                          {q.rail ? <RailIcon method={q.rail} size={11} /> : null}
                          {q.total}
                        </span>
                        {item.onPlayNow ? (
                          <button
                            type="button"
                            onClick={() => item.onPlayNow?.(q.id)}
                            disabled={isPromoting || !!item.playingNowId}
                            title="End the current beam early and start this one"
                            className="casi-air-play"
                            style={{
                              padding: '5px 10px',
                              borderRadius: 0,
                              fontSize: '11px',
                              fontWeight: 600,
                              border: '1px solid var(--casi-border-2)',
                              background: 'transparent',
                              color: 'var(--casi-text-dim)',
                              cursor: isPromoting ? 'wait' : 'pointer',
                              opacity: isPromoting ? 0.5 : 1,
                              fontFamily: 'inherit',
                              transition: 'border-color .14s, color .14s, background .14s',
                            }}
                          >
                            {isPromoting ? '…' : 'Play now'}
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * 32×32 thumb for the queued-row strip — smaller than AiringThumb to keep
 * the queue panel visually subordinate to the active row above it.
 */
function QueueThumb({
  mediaUrl,
  fileType,
  shape,
}: {
  mediaUrl?: string | null;
  fileType?: string | null;
  shape?: string | null;
}) {
  const baseTile: React.CSSProperties = {
    width: '32px',
    height: '32px',
    borderRadius: 0,
    background: 'var(--casi-surface-2)',
    border: '1px solid var(--casi-border)',
    flexShrink: 0,
    overflow: 'hidden',
    position: 'relative',
  };
  if (!mediaUrl) {
    return <div style={baseTile} aria-hidden />;
  }
  const clipPath =
    shape === 'circle' || shape === 'custom' ? 'circle(50%)' :
    undefined;
  return (
    <div style={{ ...baseTile, background: 'var(--casi-bg)' }}>
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
          borderRadius: 0,
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
    borderRadius: 0,
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
