import SlotMedia from '@/components/SlotMedia';
import { fmtDuration } from './time';
import { EXPLORER_CLUSTER_QUERY } from '@/lib/solana-network';

// Card shown under "Pending" — a viewer booking waiting for the streamer
// to approve or deny. Beam and backdrop variants differ only in thumb
// object-fit, price-tag color, and the approve button's accent color.
//
// `slotOccupied` tells us whether there is already an active booking on the
// same overlay_element — if so, approving this one queues it instead of
// starting it immediately, and the button label + color reflect that.
export default function PendingRequestCard({
  booking,
  kind,
  slotOccupied,
  paymentConfirmed,
  calcTotal,
  onApprove,
  onDeny,
  onPreview,
}: {
  booking: any;
  kind: 'beam' | 'backdrop';
  slotOccupied: boolean;
  paymentConfirmed: boolean;
  calcTotal: (b: any) => string;
  onApprove: (b: any) => void;
  onDeny: (id: string, method: string) => void;
  onPreview: (b: any) => void;
}) {
  const isBackdrop = kind === 'backdrop';
  const objectFit = isBackdrop ? 'cover' : 'contain';
  const approveBg = !paymentConfirmed
    ? 'var(--casi-border)'
    : isBackdrop
      ? '#c084fc'
      : slotOccupied
        ? 'var(--casi-accent)'
        : 'var(--casi-accent2)';
  const approveLabel = !paymentConfirmed
    ? 'Awaiting payment'
    : slotOccupied ? 'Queue' : 'Approve';

  const priceTag = isBackdrop
    ? <span className="tag" style={{ color: '#c084fc', background: 'rgba(168,85,247,0.08)', borderColor: 'rgba(168,85,247,0.2)' }}>${booking.price_value}/{booking.price_unit}</span>
    : <span className="tag t-orange">${booking.price_value}/{booking.price_unit}</span>;
  const durationTag = isBackdrop
    ? <span className="tag" style={{ color: '#888', background: 'rgba(255,255,255,0.04)', borderColor: '#1c1c1c' }}>{fmtDuration(booking.duration_minutes)}</span>
    : <span className="tag t-cyan">{fmtDuration(booking.duration_minutes)}</span>;

  return (
    <div className="req-card">
      <button className="req-thumb" onClick={() => onPreview(booking)}>
        {booking.image_url
          ? <SlotMedia src={booking.image_url} fileType={booking.file_type} style={{ width: '100%', height: '100%', objectFit }} />
          : <span style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 10, color: '#444' }}>No img</span>}
      </button>
      <div className="req-info">
        <div className="req-name">{booking.viewer_name}</div>
        <div className="req-meta">
          {priceTag}
          <span className="tag t-green">${calcTotal(booking)} total</span>
          {durationTag}
        </div>
        {booking.message && <div className="req-msg">"{booking.message}"</div>}
        {!isBackdrop && booking.tx_signature && (
          <div style={{ marginTop: 5 }}>
            <a href={`https://solscan.io/tx/${booking.tx_signature}${EXPLORER_CLUSTER_QUERY}`} target="_blank" rel="noopener noreferrer"
              style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 9, color: '#9945FF', textDecoration: 'none' }}>↗ Solscan</a>
          </div>
        )}
      </div>
      <div className="req-actions">
        <button onClick={() => onApprove(booking)} className="act-btn"
          disabled={!paymentConfirmed}
          style={{ background: approveBg, color: !paymentConfirmed ? '#444' : 'var(--casi-bg)', cursor: !paymentConfirmed ? 'not-allowed' : 'pointer' }}>
          {approveLabel}
        </button>
        <button onClick={() => onDeny(booking.id, booking.payment_method)} className="act-btn b-danger" style={{ border: '1px solid rgba(248,113,113,0.2)' }}>Deny</button>
      </div>
    </div>
  );
}
