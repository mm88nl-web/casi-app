'use client';

import SlotMedia from '@/components/SlotMedia';
import { formatSlotPrice } from '@/lib/slot-pricing';

type SlotElement = {
  id: string;
  price_value: number | string;
  price_unit: string;
  /** Per-rail JSONB. formatSlotPrice picks USDC / EUR / USD from here in
   *  preference order; falls back to price_value for legacy slots. */
  prices?: Record<string, number | string | null | undefined> | null;
  image_url?: string | null;
  is_background?: boolean | null;
  locked?: boolean | null;
  max_duration_minutes?: number | null;
};

type Booking = { id: string; status?: string | null };

type Props = {
  elements: SlotElement[];
  tc: string;
  tcRgb: string;
  queueCounts: Record<string, number>;
  getActiveBookingForSlot: (id: string) => Booking | null;
  getMyBookingForSlot: (id: string) => Booking | null;
  onOpenSlot: (el: SlotElement, isOccupied: boolean) => void;
};

export default function SlotsList({
  elements,
  tc,
  tcRgb,
  queueCounts,
  getActiveBookingForSlot,
  getMyBookingForSlot,
  onOpenSlot,
}: Props) {
  const visible = elements.filter(el => Number(el.price_value) >= 0);
  if (!visible.length) return null;

  return (
    <div className="slots-sec">
      <div className="slots-lbl">Available slots</div>
      <div className="slots-grid">
        {visible.map(el => {
          const activeBooking    = getActiveBookingForSlot(el.id);
          const isOccupied       = !!activeBooking;
          const queueCount       = queueCounts[el.id] || 0;
          const myBookingForSlot = getMyBookingForSlot(el.id);
          const isLocked         = !!el.locked;
          const isFree           = Number(el.price_value) === 0;
          const priceColor       = isLocked ? '#555' : myBookingForSlot ? '#555' : isFree ? '#4ade80' : tc;

          return (
            <button
              key={el.id}
              className={`slot-card ${myBookingForSlot || isLocked ? 's-disabled' : ''}`}
              style={{
                borderColor: isFree ? 'rgba(74,222,128,0.22)' : isOccupied && !myBookingForSlot && !isLocked ? `rgba(${tcRgb},0.14)` : !myBookingForSlot && !isLocked ? `rgba(${tcRgb},0.09)` : undefined,
                position: 'relative',
              }}
              onClick={() => !myBookingForSlot && !isLocked && onOpenSlot(el, isOccupied)}
            >
              {isFree && !isLocked && (
                <span style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(74,222,128,0.14)', border: '1px solid rgba(74,222,128,0.4)', color: '#4ade80', fontFamily: "var(--font-casi-mono), monospace", fontSize: 8, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', padding: '2px 7px', borderRadius: 4, pointerEvents: 'none' }}>
                  ★ Free
                </span>
              )}
              <div className="s-thumb" style={{ borderColor: isFree ? 'rgba(74,222,128,0.25)' : isOccupied ? `rgba(${tcRgb},0.21)` : `rgba(${tcRgb},0.14)` }}>
                {el.image_url
                  ? <SlotMedia src={el.image_url} fileType={null} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  : <span>{isLocked ? '🔒' : el.is_background ? '🖼' : '✦'}</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="s-type">
                  {isLocked
                    ? 'Locked'
                    : myBookingForSlot
                    ? String(myBookingForSlot.status || 'pending').replace('_', ' ')
                    : isOccupied
                    ? `In use${queueCount > 0 ? ` · ${queueCount} waiting` : ''}`
                    : el.is_background
                    ? 'Full Backdrop'
                    : 'Beam'}
                </div>
                <div className="s-price" style={{ color: priceColor }}>
                  {isFree ? 'Free' : formatSlotPrice(el).label}
                  {el.max_duration_minutes ? ` · max ${el.max_duration_minutes}m` : ''}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
