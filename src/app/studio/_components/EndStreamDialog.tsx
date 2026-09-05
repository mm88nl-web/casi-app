'use client';

import { useEffect, useState } from 'react';
import type { EndStreamProgress } from '@/lib/streamer-moderation';

export type DelegateHealth = 'unknown' | 'healthy' | 'absent' | 'expired' | 'revoked';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Counts shown in the dialog body so the streamer knows what's about
   *  to be moderated. Pure display — the parent passes in its current
   *  loaded state and the lib re-reads at action time. */
  counts: {
    actives: number;
    pendingBookings: number;
    pendingFlashes: number;
    queuedBookings: number;
  };
  /** Session-key delegate state. When 'healthy' the dialog promises no
   *  popups; otherwise it warns the streamer to expect one popup per
   *  active Solana beam during settle. */
  delegate: DelegateHealth;
  /** Progress event from endStreamCleanly. Null = idle (not yet running). */
  progress: EndStreamProgress | null;
  /** Action — fired when the streamer confirms. The parent runs the
   *  actual endStreamCleanly call so it can hook progress + reload. */
  onConfirm: () => void;
};

/**
 * Confirm dialog for the End Stream button. Shows the counts of what
 * will be moderated, the delegate-key status (preview of how many wallet
 * popups to expect), and during execution a stepper of progress. Closes
 * the stream when complete; on any failure the parent surfaces the
 * detail in its error banner.
 */
export default function EndStreamDialog({ open, onClose, counts, delegate, progress, onConfirm }: Props) {
  const [confirming, setConfirming] = useState(false);

  // Reset `confirming` when the dialog closes. Adjusted during render (React's
  // documented pattern for "reset state when a prop changes") rather than in
  // an effect — setState here bails out the in-progress render and re-runs
  // immediately, so the stale `confirming` value is never painted; an effect
  // would let one extra frame render with the old value first.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) setConfirming(false);
  }

  // ESC closes when not actively running.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !progress) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, progress]);

  if (!open) return null;

  const totalRows = counts.actives + counts.pendingBookings + counts.pendingFlashes + counts.queuedBookings;
  const running = progress !== null;
  const pct = progress && progress.total > 0
    ? Math.min(100, Math.round((progress.done / progress.total) * 100))
    : 0;

  const stepLabel = progress
    ? STEP_LABELS[progress.step]
    : null;

  const handleConfirm = () => {
    if (confirming) return;
    setConfirming(true);
    onConfirm();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="end-stream-dialog-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9000,
        padding: '24px',
      }}
      onClick={() => { if (!running) onClose(); }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '460px',
          background: 'var(--casi-bg)',
          border: '1px solid var(--casi-border)',
          borderRadius: 'var(--radius-panel)',
          padding: '24px',
          color: 'var(--casi-text)',
        }}
      >
        <div
          id="end-stream-dialog-title"
          style={{
            fontFamily: 'var(--H)',
            fontWeight: 800,
            fontVariationSettings: '"opsz" 64',
            fontSize: '26px',
            letterSpacing: '-0.025em',
            marginBottom: '8px',
          }}
        >
          End stream?
        </div>
        <div style={{ fontFamily: 'var(--S)', fontStyle: 'italic', fontSize: '15px', color: 'var(--casi-text-mid)', lineHeight: 1.5 }}>
          This will end every active beam (prorated refund to viewers),
          deny pending requests, and clear the queue. Viewers always get
          their funds back — Solana queue refunds may finalize when the
          viewer reopens the overlay.
        </div>

        <div
          style={{
            marginTop: '18px',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '10px',
          }}
        >
          <CountTile label="Airing" value={counts.actives} />
          <CountTile label="Pending" value={counts.pendingBookings + counts.pendingFlashes} />
          <CountTile label="In queue" value={counts.queuedBookings} />
          <CountTile label="Total to handle" value={totalRows} highlight />
        </div>

        <div
          style={{
            marginTop: '16px',
            padding: '12px 14px',
            borderRadius: 'var(--radius-row)',
            background: delegate === 'healthy'
              ? 'color-mix(in oklab, var(--ink) 6%, var(--paper))'
              : 'rgba(234, 179, 8, 0.08)',
            border: `1px solid ${delegate === 'healthy' ? 'color-mix(in oklab, var(--ink) 18%, var(--paper))' : 'rgba(234, 179, 8, 0.25)'}`,
            fontFamily: 'var(--B)',
            fontSize: '13px',
            color: delegate === 'healthy' ? 'var(--casi-accent)' : '#8a6414',
            lineHeight: 1.5,
          }}
        >
          {delegate === 'healthy' ? (
            <>✓ Session key installed — no wallet popups during shutdown.</>
          ) : (
            <>
              ⚠ Session key {delegate === 'absent' ? 'not installed' : delegate}.
              Expect one wallet popup per active Solana beam.{' '}
              <a
                href="/studio/settings#session-key"
                style={{ color: 'inherit', textDecoration: 'underline' }}
              >
                Install in Settings →
              </a>
            </>
          )}
        </div>

        {running ? (
          <div style={{ marginTop: '18px' }}>
            <div
              style={{
                fontFamily: 'var(--font-casi-mono), monospace',
                fontSize: '11px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--casi-text-mid)',
                marginBottom: '6px',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>{stepLabel}</span>
              <span>{progress!.done}/{progress!.total}</span>
            </div>
            <div
              style={{
                height: '4px',
                background: 'var(--casi-surface-2)',
                borderRadius: '2px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: 'var(--casi-accent)',
                  transition: 'width .2s ease',
                }}
              />
            </div>
          </div>
        ) : null}

        <div
          style={{
            marginTop: '20px',
            display: 'flex',
            gap: '8px',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            className="casi-pill-ghost"
            style={{
              padding: '11px 18px',
              fontSize: '15px',
              cursor: running ? 'not-allowed' : 'pointer',
              opacity: running ? 0.4 : 1,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={running || confirming}
            style={{
              padding: '11px 20px',
              borderRadius: 'var(--radius-pill)',
              border: 'none',
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              fontFamily: 'var(--B)',
              fontSize: '15px',
              fontWeight: 700,
              cursor: running || confirming ? 'wait' : 'pointer',
              opacity: running || confirming ? 0.7 : 1,
            }}
          >
            {running ? 'Ending…' : 'End stream'}
          </button>
        </div>
      </div>
    </div>
  );
}

const STEP_LABELS: Record<EndStreamProgress['step'], string> = {
  'kick-active': 'Ending active beams',
  'deny-pending': 'Denying pending requests',
  'deny-flash': 'Refunding pending flashes',
  'deny-queued': 'Clearing queue',
  'set-offline': 'Going offline',
};

function CountTile({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      style={{
        padding: '11px 13px',
        borderRadius: 'var(--radius-chip)',
        background: highlight ? 'color-mix(in oklab, var(--accent) 8%, var(--paper))' : 'var(--casi-surface-2)',
        border: `1px solid ${highlight ? 'color-mix(in oklab, var(--accent) 22%, var(--paper))' : 'var(--casi-border)'}`,
      }}
    >
      <div
        className="font-mono uppercase"
        style={{ fontSize: '11px', letterSpacing: '0.12em', color: 'var(--casi-text-mid)', marginBottom: '6px' }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--H)',
          fontWeight: 700,
          fontVariationSettings: '"opsz" 64',
          fontSize: '26px',
          letterSpacing: '-0.02em',
          color: highlight ? 'var(--accent)' : 'var(--casi-text)',
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}
