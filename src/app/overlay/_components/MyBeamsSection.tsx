'use client';

import SlotMedia from '@/components/SlotMedia';
import Countdown from './Countdown';

type Booking = {
  id: string;
  status: string;
  payment_method?: string | null;
  escrow_pda?: string | null;
  image_url?: string | null;
  file_type?: string | null;
  element_id?: string | null;
  started_at?: string | null;
  duration_minutes?: number | string | null;
};

type Props = {
  bookings: Booking[];                       // already-filtered visibleMyBookings
  activeBookings: Booking[];                 // used to look up the canonical live row per chip
  expiringSoon: Set<string>;
  onExpiringWarning: (id: string, seconds: number) => void;
  viewerWallet: string | null;
  cleanupBusy: boolean;
  onStaleCleanup: () => void | Promise<void>;
  tc: string;
  tcRgb: string;
  cancelling: string | null;
  onEndEarly: (booking: Booking, activeBooking: Booking | undefined) => void | Promise<void>;
  onCancel: (id: string) => void | Promise<void>;
  onReclaim: (booking: Booking) => void | Promise<void>;
  onExpire: (activeBooking: Booking) => void | Promise<void>;
};

export default function MyBeamsSection({
  bookings,
  activeBookings,
  expiringSoon,
  onExpiringWarning,
  viewerWallet,
  cleanupBusy,
  onStaleCleanup,
  tc,
  tcRgb,
  cancelling,
  onEndEarly,
  onCancel,
  onReclaim,
  onExpire,
}: Props) {
  if (!bookings.length) return null;

  const showCleanupButton =
    viewerWallet &&
    bookings.some(b => b.payment_method === 'solana' && b.escrow_pda && (b.status === 'denied' || b.status === 'expired'));

  return (
    <div className="my-beams">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="my-beams-lbl" style={{ marginBottom: 0 }}>Your beams</div>
        {showCleanupButton && (
          <button
            onClick={onStaleCleanup}
            disabled={cleanupBusy}
            style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', background: 'none', border: '1px solid var(--casi-border)', borderRadius: 8, padding: '4px 10px', color: 'var(--casi-text-muted)', cursor: cleanupBusy ? 'default' : 'pointer', opacity: cleanupBusy ? 0.5 : 1 }}
            title="Probe each escrow and clear rows whose funds already left the vault"
          >
            {cleanupBusy ? '…' : 'Clean up ended'}
          </button>
        )}
      </div>

      <div className="my-beams-list">
        {bookings.map(booking => {
          const isLive     = booking.status === 'active';
          const isApproved = booking.status === 'approved_queued';
          const isPending  = booking.status === 'pending';
          const isDenied   = booking.status === 'denied';
          const isExpired  = booking.status === 'expired';
          const isSolanaLocked = isDenied && booking.payment_method === 'solana' && booking.escrow_pda;
          // Kick-leaked: streamer ended the beam but the on-chain settle
          // didn't go through, so the PDA still holds funds. Visually
          // distinct from a plain denial because the viewer is owed a
          // prorated refund, not a full one.
          const isSolanaKickLeaked = isExpired && booking.payment_method === 'solana' && booking.escrow_pda;
          const isExpiring = isLive && expiringSoon.has(booking.id);
          const activeBooking = activeBookings.find(b => b.id === booking.id);
          const canCancel = isPending || isApproved;
          const needsRecover = isSolanaLocked || isSolanaKickLeaked;
          const chipStyle = isExpiring
            ? { background: 'rgba(234,179,8,0.08)', borderColor: 'rgba(234,179,8,0.25)', color: '#facc15' }
            : isLive
            ? { background: `rgba(${tcRgb},0.07)`, borderColor: `rgba(${tcRgb},0.21)`, color: tc }
            : isApproved
            ? { background: `rgba(${tcRgb},0.06)`, borderColor: `rgba(${tcRgb},0.19)`, color: tc }
            : needsRecover
            ? { background: 'rgba(192,132,252,0.06)', borderColor: 'rgba(192,132,252,0.25)', color: '#c084fc' }
            : isDenied
            ? { background: 'rgba(248,113,113,0.06)', borderColor: 'rgba(248,113,113,0.22)', color: '#f87171' }
            : { background: 'rgba(255,255,255,0.03)', borderColor: 'var(--casi-border)', color: 'var(--casi-text-muted)' };

          const statusLabel = isExpiring
            ? '⚠ Expiring'
            : isLive ? '● Live'
            : isApproved ? '⏳ Queued'
            : isSolanaKickLeaked ? '⚡ Ended early — USDC recoverable'
            : isSolanaLocked ? '✕ Denied — USDC locked'
            : isDenied ? '✕ Denied — refund on the way'
            : '⌛ Pending';

          return (
            <div key={booking.id} className="beam-chip" style={chipStyle}>
              {booking.image_url && <SlotMedia src={booking.image_url} fileType={booking.file_type} style={{ width: 20, height: 20, objectFit: 'contain', borderRadius: 4 }} />}
              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fontWeight: 500 }}>{statusLabel}</span>
              {isLive && activeBooking && (
                <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, opacity: 0.7 }}>
                  <Countdown
                    booking={activeBooking}
                    onWarning={(s) => onExpiringWarning(booking.id, s)}
                    onExpire={() => onExpire(activeBooking)}
                  />
                </span>
              )}
              {isLive && (
                <button className="cancel-btn" onClick={() => onEndEarly(booking, activeBooking)}>
                  ✕ end early
                </button>
              )}
              {canCancel && (
                <button className="cancel-btn" onClick={() => onCancel(booking.id)} disabled={cancelling === booking.id}>
                  {cancelling === booking.id ? '…' : '✕ cancel'}
                </button>
              )}
              {needsRecover && (
                <button
                  className="cancel-btn"
                  style={{ color: '#c084fc', borderColor: 'rgba(192,132,252,0.3)' }}
                  onClick={() => onReclaim(booking)}
                >
                  ◎ recover USDC
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
