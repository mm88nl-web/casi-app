import SlotMedia from '@/components/SlotMedia';
import { EXPLORER_CLUSTER_QUERY } from '@/lib/solana-network';

// Card shown under "Wants next beam/backdrop" — a viewer that chose to queue
// rather than wait. Approving always queues (never starts immediately) since
// by definition the slot is occupied. No duration tag and no thumbnail
// preview action — the streamer decides on the name + amount alone.
export default function QueuedRequestCard({
  booking,
  kind,
  paymentConfirmed,
  calcTotal,
  onApprove,
  onDeny,
  onPreview,
}: {
  booking: any;
  kind: 'beam' | 'backdrop';
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
    : isBackdrop ? '#c084fc' : 'var(--casi-accent)';

  const cardClass = isBackdrop ? 'req-card c-backdrop-queue' : 'req-card';
  const cardStyle: React.CSSProperties = isBackdrop
    ? {}
    : { borderColor: 'rgba(var(--casi-accent-rgb),0.12)', background: 'rgba(245,130,32,0.03)' };

  const priceTag = isBackdrop
    ? <span className="tag" style={{ color: 'rgba(192,132,252,0.6)', background: 'rgba(168,85,247,0.05)', borderColor: 'rgba(168,85,247,0.12)' }}>${booking.price_value}/{booking.price_unit}</span>
    : <span className="tag t-dim">${booking.price_value}/{booking.price_unit}</span>;

  return (
    <div key={booking.id} className={cardClass} style={cardStyle}>
      <button className="req-thumb" onClick={() => onPreview(booking)}>
        {booking.image_url
          ? <SlotMedia src={booking.image_url} fileType={booking.file_type} style={{ width: '100%', height: '100%', objectFit }} />
          : <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#444' }}>No img</span>}
      </button>
      <div className="req-info">
        <div className="req-name">{booking.viewer_name}</div>
        <div className="req-meta">
          {priceTag}
          <span className="tag t-green">${calcTotal(booking)} total</span>
        </div>
        {!isBackdrop && booking.message && <div className="req-msg">"{booking.message}"</div>}
        {!isBackdrop && booking.tx_signature && (
          <div style={{ marginTop: 5 }}>
            <a href={`https://solscan.io/tx/${booking.tx_signature}${EXPLORER_CLUSTER_QUERY}`} target="_blank" rel="noopener noreferrer"
              style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#9945FF', textDecoration: 'none' }}>↗ Solscan</a>
          </div>
        )}
      </div>
      <div className="req-actions">
        <button onClick={() => onApprove(booking)} className="act-btn"
          disabled={!paymentConfirmed}
          style={{ background: approveBg, color: !paymentConfirmed ? '#444' : 'var(--casi-bg)', cursor: !paymentConfirmed ? 'not-allowed' : 'pointer' }}>
          {!paymentConfirmed ? 'Awaiting payment' : 'Queue'}
        </button>
        <button onClick={() => onDeny(booking.id, booking.payment_method)} className="act-btn b-danger" style={{ border: '1px solid rgba(248,113,113,0.2)' }}>Deny</button>
      </div>
    </div>
  );
}
