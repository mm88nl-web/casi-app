import SlotMedia from './SlotMedia';
import { fmtDuration } from './time';

// Approved-queue row: paid + admin-approved, waiting for the current
// booking on its slot to end. "Play Now" force-advances the queue
// (kicks current, then starts this one); "Remove" denies.
//
// The onPlayNow handler is complex enough — end current, route through
// settle_beam for Solana, mutate DB, refresh — that it stays in the parent
// where it can close over supabase, profile, loadBookings, etc. This card
// just invokes it.
export default function ApprovedQueueCard({
  booking,
  kind,
  queuePosition,
  onPlayNow,
  onRemove,
}: {
  booking: any;
  kind: 'beam' | 'backdrop';
  queuePosition: number;
  onPlayNow: (b: any) => void | Promise<void>;
  onRemove: (id: string) => void;
}) {
  const isBackdrop = kind === 'backdrop';
  const cardClass = isBackdrop ? 'req-card c-backdrop-queue' : 'req-card c-queued';
  const posColor = isBackdrop ? 'rgba(192,132,252,0.3)' : 'rgba(var(--casi-accent-rgb),0.3)';
  const thumbBorder = isBackdrop
    ? '1px solid rgba(192,132,252,0.15)'
    : '1px solid rgba(var(--casi-accent-rgb),0.15)';
  const statusColor = isBackdrop ? 'rgba(192,132,252,0.5)' : 'rgba(var(--casi-accent-rgb),0.5)';
  const objectFit = isBackdrop ? 'cover' : 'contain';

  return (
    <div className={cardClass}>
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, fontWeight: 500, color: posColor, minWidth: 28 }}>#{queuePosition}</span>
      <div style={{ width: 52, height: 52, borderRadius: 8, border: thumbBorder, overflow: 'hidden', background: 'var(--casi-bg)', flexShrink: 0 }}>
        {booking.image_url && <SlotMedia src={booking.image_url} fileType={booking.file_type} style={{ width: '100%', height: '100%', objectFit }} />}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--casi-text)', marginBottom: 3 }}>{booking.viewer_name}</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--casi-text-muted)' }}>${booking.price_value}/{booking.price_unit} · {fmtDuration(booking.duration_minutes)}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: statusColor, textTransform: 'uppercase', letterSpacing: 1 }}>
          {queuePosition === 1 ? 'Next up' : `Queue #${queuePosition}`}
        </span>
        <button onClick={() => onPlayNow(booking)}
          style={{ background: 'none', border: 'none', fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(var(--casi-accent2-rgb),0.6)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1, padding: 0 }}>
          Play Now
        </button>
        <button onClick={() => onRemove(booking.id)}
          style={{ background: 'none', border: 'none', fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(248,113,113,0.4)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1, padding: 0 }}>
          Remove
        </button>
      </div>
    </div>
  );
}
