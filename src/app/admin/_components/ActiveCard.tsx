import BeamTimer from './BeamTimer';
import SlotMedia from '@/components/SlotMedia';
import { fmtDuration } from './time';
import { EXPLORER_CLUSTER_QUERY } from '@/lib/solana-network';

// Currently-on-stream booking. Beam variant also renders the upcoming
// approved-queue list inline so the streamer sees who's next without
// scrolling to another section; backdrop slots are singular so the list
// is omitted.
export default function ActiveCard({
  booking,
  kind,
  nextUpList,
  onExpire,
  onKick,
}: {
  booking: any;
  kind: 'beam' | 'backdrop';
  nextUpList: any[];
  onExpire: (b: any) => void;
  onKick: (b: any) => void;
}) {
  const isBackdrop = kind === 'backdrop';
  const cardClass = isBackdrop ? 'req-card c-backdrop-active' : 'req-card c-active';
  const thumbBorder = isBackdrop
    ? '1px solid rgba(192,132,252,0.2)'
    : '1px solid rgba(var(--casi-accent2-rgb),0.2)';
  const objectFit = isBackdrop ? 'cover' : 'contain';

  return (
    <div className={cardClass}>
      <div style={{ width: 64, height: 64, borderRadius: 10, border: thumbBorder, overflow: 'hidden', background: 'var(--casi-bg)', flexShrink: 0 }}>
        {booking.image_url && <SlotMedia src={booking.image_url} fileType={booking.file_type} style={{ width: '100%', height: '100%', objectFit }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-casi-sans), sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--casi-text)', marginBottom: 4 }}>{booking.viewer_name}</div>
        <div style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 11, color: 'var(--casi-text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span>${booking.price_value}/{booking.price_unit} · {fmtDuration(booking.duration_minutes)}</span>
          {!isBackdrop && booking.tx_signature && (
            <a href={`https://solscan.io/tx/${booking.tx_signature}${EXPLORER_CLUSTER_QUERY}`} target="_blank" rel="noopener noreferrer"
              style={{ color: '#9945FF', textDecoration: 'none', fontSize: 10 }}>↗ Solscan</a>
          )}
        </div>
        {booking.message && <div className="req-msg">"{booking.message}"</div>}
        {!isBackdrop && nextUpList.length > 0 && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            {nextUpList.map((next, idx) => (
              <div key={next.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 9, color: 'rgba(var(--casi-accent-rgb),0.4)', minWidth: 20 }}>#{idx + 1}</span>
                <span style={{ fontFamily: "var(--font-casi-sans), sans-serif", fontSize: 12, color: 'rgba(var(--casi-accent-rgb),0.7)' }}>{next.viewer_name}</span>
                <span style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 9, color: '#444' }}>{idx === 0 ? '— auto-starts next' : `pos #${idx + 1}`}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
        <BeamTimer booking={booking} onExpire={onExpire} />
        <button onClick={() => onKick(booking)} style={{ background: 'none', border: 'none', fontFamily: "var(--font-casi-mono), monospace", fontSize: 10, color: 'rgba(248,113,113,0.4)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1 }}>End early</button>
      </div>
    </div>
  );
}
