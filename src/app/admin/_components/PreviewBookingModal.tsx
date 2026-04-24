'use client';

import SlotMedia from '@/components/SlotMedia';

export type PreviewBooking = {
  id: string | number;
  viewer_name: string;
  price_value: number;
  price_unit: string;
  duration_minutes: number;
  payment_method?: string | null;
  image_url?: string | null;
  file_type?: string | null;
  message?: string | null;
};

type Props = {
  booking: PreviewBooking;
  isBackdrop: boolean;
  slotOccupied: boolean;
  paymentConfirmed: boolean;
  totalDisplay: string;
  durationDisplay: string;
  onClose: () => void;
  onDeny: () => void;
  onApprove: () => void;
};

export default function PreviewBookingModal({
  booking,
  isBackdrop,
  slotOccupied,
  paymentConfirmed,
  totalDisplay,
  durationDisplay,
  onClose,
  onDeny,
  onApprove,
}: Props) {
  const facts: Array<[string, string, string]> = [
    ['From', booking.viewer_name, 'var(--casi-text)'],
    ['Price', `$${booking.price_value}/${booking.price_unit}`, 'var(--casi-accent2)'],
    ['Duration', durationDisplay, 'var(--casi-text)'],
    ['Total', totalDisplay, '#4ade80'],
  ];

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--casi-surface)', border: '1px solid #222', borderRadius: 16, padding: 28, width: '100%', maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontFamily: "var(--font-casi-sans), sans-serif", fontSize: 18, fontWeight: 800, color: 'var(--casi-text)' }}>Review Request</h2>
            <div style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 10, color: isBackdrop ? '#c084fc' : 'var(--casi-accent2)', marginTop: 4, letterSpacing: 1 }}>
              {isBackdrop ? '🖼 Full Backdrop' : '✦ Beam Slot'}
              {slotOccupied && <span style={{ color: 'var(--casi-accent)', marginLeft: 8 }}>— slot occupied, will queue</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--casi-text-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        <div style={{ aspectRatio: '16/9', background: 'var(--casi-bg)', border: '1px solid #1c1c1c', borderRadius: 10, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          {booking.image_url
            ? <SlotMedia src={booking.image_url} fileType={booking.file_type} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            : <span style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 12, color: '#333' }}>No image</span>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          {facts.map(([l, v, c]) => (
            <div key={l} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #161616', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: '#444', marginBottom: 4 }}>{l}</div>
              <div style={{ fontFamily: "var(--font-casi-sans), sans-serif", fontSize: 15, fontWeight: 700, color: c }}>{v}</div>
            </div>
          ))}
        </div>

        {booking.message && (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #161616', borderRadius: 8, padding: 14, marginBottom: 20 }}>
            <div style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: '#444', marginBottom: 6 }}>Message</div>
            <div style={{ fontFamily: "var(--font-casi-sans), sans-serif", fontSize: 13, color: '#888', fontStyle: 'italic' }}>&ldquo;{booking.message}&rdquo;</div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onDeny} style={{ flex: 1, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: 12, color: '#f87171', fontFamily: "var(--font-casi-sans), sans-serif", fontWeight: 700, fontSize: 13, textTransform: 'uppercase', cursor: 'pointer' }}>Deny</button>
          <button
            onClick={onApprove}
            className="act-btn"
            disabled={!paymentConfirmed}
            style={{
              background: !paymentConfirmed ? 'var(--casi-border)' : slotOccupied ? 'var(--casi-accent)' : 'var(--casi-accent2)',
              color: !paymentConfirmed ? '#444' : 'var(--casi-bg)',
              cursor: !paymentConfirmed ? 'not-allowed' : 'pointer',
              flex: 1, border: 'none', borderRadius: 10, padding: 12, fontFamily: "var(--font-casi-sans), sans-serif", fontWeight: 800, fontSize: 13, textTransform: 'uppercase',
            }}
          >
            {!paymentConfirmed ? 'Awaiting payment' : slotOccupied ? 'Approve → Queue' : 'Approve → Live'}
          </button>
        </div>
      </div>
    </div>
  );
}
