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

  useEffect(() => {
    if (!open) setConfirming(false);
  }, [open]);

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
          background: 'var(--casi-surface)',
          border: '1px solid var(--casi-border-2)',
          borderRadius: '14px',
          padding: '24px',
          color: 'var(--casi-text)',
        }}
      >
        <div
          id="end-stream-dialog-title"
          style={{
            fontFamily: 'var(--font-casi-display), var(--font-casi-sans), sans-serif',
            fontWeight: 800,
            fontSize: '20px',
            letterSpacing: '0.3px',
            marginBottom: '6px',
          }}
        >
          End stream?
        </div>
        <div style={{ fontSize: '13px', color: 'var(--casi-text-mid)', lineHeight: 1.5 }}>
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
            padding: '10px 12px',
            borderRadius: '8px',
            background: delegate === 'healthy'
              ? 'rgba(var(--casi-accent-rgb), 0.05)'
              : 'rgba(234, 179, 8, 0.06)',
            border: `1px solid ${delegate === 'healthy' ? 'rgba(var(--casi-accent-rgb), 0.18)' : 'rgba(234, 179, 8, 0.22)'}`,
            fontSize: '12px',
            color: delegate === 'healthy' ? 'var(--casi-accent)' : '#eab308',
            lineHeight: 1.45,
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
            style={{
              padding: '8px 14px',
              borderRadius: '7px',
              border: '1px solid var(--casi-border-2)',
              background: 'transparent',
              color: 'var(--casi-text-mid)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: running ? 'not-allowed' : 'pointer',
              opacity: running ? 0.4 : 1,
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={running || confirming}
            style={{
              padding: '8px 16px',
              borderRadius: '7px',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              background: 'rgba(239, 68, 68, 0.08)',
              color: '#f87171',
              fontSize: '12px',
              fontWeight: 700,
              cursor: running || confirming ? 'wait' : 'pointer',
              opacity: running || confirming ? 0.7 : 1,
              fontFamily: 'inherit',
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
        padding: '10px 12px',
        borderRadius: '8px',
        background: highlight ? 'rgba(var(--casi-accent-rgb), 0.06)' : 'var(--casi-surface-2)',
        border: `1px solid ${highlight ? 'rgba(var(--casi-accent-rgb), 0.18)' : 'var(--casi-border)'}`,
      }}
    >
      <div
        className="font-mono uppercase"
        style={{ fontSize: '10px', letterSpacing: '0.12em', color: 'var(--casi-text-mid)', marginBottom: '3px' }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-casi-display), var(--font-casi-sans), sans-serif',
          fontWeight: 700,
          fontSize: '20px',
          color: highlight ? 'var(--casi-accent)' : 'var(--casi-text)',
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}
