'use client';

import { useEffect } from 'react';
import SlotMedia from '@/components/SlotMedia';

export type PreviewBooking = {
  id: string;
  /** "Beam · Pending approval" or "Flash · Pending approval", drives the
   *  small kind-pill in the modal header. */
  kind: 'beam' | 'flash';
  viewerName: string;
  message: string | null;
  imageUrl: string | null;
  fileType: string | null;
  shape: string | null;
  /** Pre-formatted "$X/min" or "$X/hr" — same string the row shows. */
  rateLabel: string;
  /** Pre-formatted total ("€10" or "8 USDC") — what actually gets paid. */
  totalLabel: string;
  /** "5m" or "1h 30m" — pretty-printed duration. */
  durationLabel: string;
  /** Set false when the viewer's funds aren't yet on Stripe / Solana.
   *  Disables Approve. Free flashes / bookings come through as true. */
  paymentConfirmed: boolean;
  /** Slot label like "circle · top-left" so the streamer knows where it
   *  lands. Hidden for flashes (no slot). */
  slotLabel?: string | null;
};

type Props = {
  booking: PreviewBooking | null;
  onClose: () => void;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
};

/**
 * v7 preview modal for an incoming booking / flash. Big media preview,
 * facts grid (rate / duration / total / slot), message body, Approve/Deny
 * footer. Approve is gated on payment-confirmed, mirroring admin's
 * PreviewBookingModal — the on-chain start_beam / Stripe capture both
 * fail without a real funded escrow, and the row would just bounce.
 */
export default function PreviewBookingModal({ booking, onClose, onApprove, onDeny }: Props) {
  useEffect(() => {
    if (!booking) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [booking, onClose]);

  if (!booking) return null;
  const isBeam = booking.kind === 'beam';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-modal-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9000,
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '540px',
          background: 'var(--casi-bg)',
          border: '1px solid var(--casi-border)',
          borderRadius: 'var(--radius-panel)',
          padding: '22px',
          color: 'var(--casi-text)',
        }}
      >
        <div className="flex items-start justify-between" style={{ marginBottom: '14px' }}>
          <div>
            <h2
              id="preview-modal-title"
              style={{
                fontFamily: 'var(--H)',
                fontWeight: 800,
                fontVariationSettings: '"opsz" 64',
                fontSize: '22px',
                letterSpacing: '-0.02em',
                color: 'var(--casi-text)',
              }}
            >
              Review request
            </h2>
            <div
              className="font-mono uppercase"
              style={{
                fontSize: '10px',
                letterSpacing: '0.14em',
                color: 'var(--casi-accent)',
                marginTop: '4px',
              }}
            >
              {isBeam ? '✦ Beam' : '⚡ Flash'}
              {booking.slotLabel ? ` · ${booking.slotLabel}` : ''}
              {!booking.paymentConfirmed ? (
                <span style={{ marginLeft: '8px', color: '#eab308' }}>· awaiting payment</span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--casi-text-mid)',
              cursor: 'pointer',
              fontSize: '18px',
              lineHeight: 1,
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            aspectRatio: '16 / 9',
            background: 'var(--casi-surface-2)',
            border: '1px solid var(--casi-border)',
            borderRadius: 'var(--radius-card)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
          }}
        >
          {booking.imageUrl ? (
            <SlotMedia
              src={booking.imageUrl}
              fileType={booking.fileType}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          ) : (
            <span
              className="font-mono uppercase"
              style={{ fontSize: '11px', letterSpacing: '0.16em', color: 'var(--casi-text-faint)' }}
            >
              no image · message only
            </span>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '8px',
            marginBottom: '14px',
          }}
        >
          <Fact label="From" value={booking.viewerName} />
          <Fact label="Total" value={booking.totalLabel} accent />
          {isBeam ? <Fact label="Rate" value={booking.rateLabel} /> : null}
          {isBeam ? <Fact label="Duration" value={booking.durationLabel} /> : null}
        </div>

        {booking.message ? (
          <div
            style={{
              background: 'var(--casi-surface-2)',
              border: '1px solid var(--casi-border)',
              borderRadius: 'var(--radius-card)',
              padding: '13px 15px',
              marginBottom: '16px',
            }}
          >
            <div
              className="font-mono uppercase"
              style={{
                fontSize: '10px',
                letterSpacing: '0.12em',
                color: 'var(--casi-text-faint)',
                marginBottom: '6px',
              }}
            >
              Message
            </div>
            <div
              style={{
                fontFamily: 'var(--S)',
                fontSize: '15px',
                color: 'var(--casi-text-mid)',
                fontStyle: 'italic',
                lineHeight: 1.5,
              }}
            >
              &ldquo;{booking.message}&rdquo;
            </div>
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => { onDeny(booking.id); onClose(); }}
            className="casi-pill-ghost"
            style={{ flex: 1, height: '44px', fontSize: '15px' }}
          >
            {/* Kept as "Deny" (not the prototype's "Decline") — matches the
                app's own established terminology (denyBooking(), onDeny
                prop, EndStreamDialog copy). Look changed, copy didn't. */}
            Deny
          </button>
          <button
            type="button"
            onClick={() => { onApprove(booking.id); onClose(); }}
            disabled={!booking.paymentConfirmed}
            className="casi-pill-solid"
            style={{
              flex: 2,
              height: '44px',
              fontSize: '15px',
              cursor: booking.paymentConfirmed ? 'pointer' : 'not-allowed',
            }}
          >
            {booking.paymentConfirmed ? 'Approve' : 'Awaiting payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid var(--casi-border)',
        borderRadius: '8px',
        padding: '10px 12px',
      }}
    >
      <div
        className="font-mono uppercase"
        style={{
          fontSize: '9.5px',
          letterSpacing: '0.16em',
          color: 'var(--casi-text-faint)',
          marginBottom: '4px',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-casi-sans), sans-serif',
          fontSize: '14px',
          fontWeight: 700,
          color: accent ? 'var(--casi-accent)' : 'var(--casi-text)',
        }}
      >
        {value}
      </div>
    </div>
  );
}
