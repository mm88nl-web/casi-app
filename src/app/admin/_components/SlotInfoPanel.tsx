import { useEffect, useState } from 'react';
import SlotMedia from '@/components/SlotMedia';
import { fmtDuration, formatTime, getSecondsRemaining } from './time';

// Shape options surfaced in the editor. `banner` lives in the same picker
// (so "convert a slot into a banner" is one click) but its render path is
// totally different — see overlay/page.tsx for the marquee layout.
const SHAPE_OPTIONS: { id: string; label: string }[] = [
  { id: 'rect',    label: 'Rect'    },
  { id: 'rounded', label: 'Rounded' },
  { id: 'circle',  label: 'Circle'  },
  { id: 'hex',     label: 'Hex'     },
  { id: 'banner',  label: 'Banner'  },
];

export default function SlotInfoPanel({
  el,
  activeBooking,
  queueBookings,
  onClose,
  onKick,
  onLockToggle,
  onDelete,
  onUpdatePrice,
  onUpdateShape,
  onUpdateGlow,
}: {
  el: any;
  activeBooking: any;
  queueBookings: any[];
  onClose: () => void;
  onKick: (b: any) => void;
  onLockToggle: (id: string, locked: boolean) => void;
  onDelete: (id: string) => void;
  onUpdatePrice: (id: string, price: number, unit: string) => void;
  // Parent is responsible for autosnapping dimensions (circle/hex → pixel-
  // square, banner → full-width strip). This component just emits intent.
  onUpdateShape?: (id: string, shape: string) => void;
  onUpdateGlow?: (id: string, glow: boolean) => void;
}) {
  const [seconds, setSeconds] = useState(activeBooking ? getSecondsRemaining(activeBooking) : 0);
  const [editPrice, setEditPrice] = useState(String(el.price_value || 0));
  const [editUnit, setEditUnit] = useState(el.price_unit || 'min');

  useEffect(() => {
    setSeconds(activeBooking ? getSecondsRemaining(activeBooking) : 0);
    if (!activeBooking) return;
    const interval = setInterval(() => setSeconds(getSecondsRemaining(activeBooking)), 1000);
    return () => clearInterval(interval);
  }, [activeBooking?.id]);

  const durMins = activeBooking ? Number(activeBooking.duration_minutes) : 0;
  const totalValue = activeBooking ? (activeBooking.price_unit === 'min'
    ? (activeBooking.price_value * durMins).toFixed(0)
    : (activeBooking.price_value * (durMins / 60)).toFixed(2)) : null;
  const elapsed = activeBooking ? Math.max(0, durMins * 60 - seconds) : 0;
  const earnedSoFar = activeBooking ? (activeBooking.price_unit === 'min'
    ? ((elapsed / 60) * activeBooking.price_value).toFixed(2)
    : ((elapsed / 3600) * activeBooking.price_value).toFixed(2)) : null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 250, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }} onClick={onClose}>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '90%', maxWidth: 500, background: 'var(--casi-surface)', border: '1px solid #222', borderRadius: 16, overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #161616' }}>
          <div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--casi-text-muted)', marginBottom: 4 }}>
              {el.is_background ? 'Full Backdrop' : 'Beam Slot'}
              {el.locked && <span style={{ color: '#f87171', marginLeft: 10 }}>● Locked</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--casi-text-muted)', cursor: 'pointer', fontSize: 18, padding: 4 }}>✕</button>
        </div>
        <div style={{ padding: 24 }}>

          {/* Price editor */}
          {(() => {
            const isFree = parseFloat(editPrice) === 0;
            return (
            <div style={{ background: isFree ? 'rgba(74,222,128,0.05)' : 'rgba(var(--casi-accent-rgb),0.05)', border: `1px solid ${isFree ? 'rgba(74,222,128,0.2)' : 'rgba(var(--casi-accent-rgb),0.15)'}`, borderRadius: 10, padding: 16, marginBottom: 16, transition: 'background .15s, border-color .15s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--casi-text-muted)' }}>Price</div>
                <button type="button" onClick={() => setEditPrice('0')}
                  style={{ background: isFree ? 'rgba(74,222,128,0.14)' : 'rgba(255,255,255,0.04)', border: `1px solid ${isFree ? 'rgba(74,222,128,0.4)' : '#222'}`, borderRadius: 6, padding: '3px 10px', fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: isFree ? '#4ade80' : 'var(--casi-text-muted)', cursor: 'pointer', transition: 'all .15s' }}>
                  {isFree ? '★ Free slot' : '★ Make free'}
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: isFree ? '#4ade80' : 'var(--casi-accent)', fontWeight: 800, fontSize: 16 }}>$</span>
                <input type="number" min={0} value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: `1px solid ${isFree ? 'rgba(74,222,128,0.3)' : '#333'}`, borderRadius: 8, padding: '10px 14px', fontSize: 16, color: 'var(--casi-text)', outline: 'none', fontFamily: "'DM Mono', monospace" }} />
                <select value={editUnit} onChange={(e) => setEditUnit(e.target.value)} disabled={isFree}
                  style={{ background: 'var(--casi-surface)', border: '1px solid #333', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--casi-text)', outline: 'none', cursor: isFree ? 'not-allowed' : 'pointer', fontFamily: "'DM Mono', monospace", opacity: isFree ? 0.4 : 1 }}>
                  <option value="min">/min</option>
                  <option value="hr">/hr</option>
                </select>
                <button onClick={() => { onUpdatePrice(el.id, parseFloat(editPrice) || 0, editUnit); onClose(); }}
                  style={{ background: isFree ? '#4ade80' : 'var(--casi-accent)', border: 'none', borderRadius: 8, padding: '10px 16px', color: 'var(--casi-bg)', fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 12, textTransform: 'uppercase', cursor: 'pointer' }}>
                  Save
                </button>
              </div>
            </div>
            );
          })()}

          {/* Shape + glow — beam slots only. Backdrops stay a full-canvas
              rect. Shape changes are fire-and-forget; the parent autosnaps
              dimensions for circle/hex (square) and banner (wide strip). */}
          {!el.is_background && onUpdateShape && (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid #161616', borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--casi-text-muted)', marginBottom: 10 }}>Shape</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {SHAPE_OPTIONS.map(s => {
                  const active = (el.shape || 'rect') === s.id;
                  return (
                    <button key={s.id} onClick={() => onUpdateShape(el.id, s.id)}
                      style={{ flex: '1 1 auto', background: active ? 'rgba(var(--casi-accent-rgb),0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${active ? 'rgba(var(--casi-accent-rgb),0.5)' : '#222'}`, borderRadius: 8, padding: '7px 10px', fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: active ? 'var(--casi-accent)' : 'var(--casi-text-muted)', cursor: 'pointer', transition: 'all .15s' }}>
                      {s.label}
                    </button>
                  );
                })}
              </div>
              {el.shape === 'banner' && (
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#555', marginTop: 8, lineHeight: 1.5 }}>
                  Banner slots scroll the viewer's message across the strip on stream. Uploads ignored; a short message is required.
                </div>
              )}
              {onUpdateGlow && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTop: '1px solid #161616' }}>
                  <div>
                    <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--casi-text)' }}>Glow on beam start</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--casi-text-muted)', marginTop: 2 }}>3s accent-colour bloom when a new beam goes live.</div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); onUpdateGlow(el.id, !(el.glow_on_start ?? true)); }}
                    style={{ position: 'relative', width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', background: (el.glow_on_start ?? true) ? 'var(--casi-accent)' : 'rgba(255,255,255,0.1)', transition: 'background .2s', flexShrink: 0 }}>
                    <span style={{ position: 'absolute', top: 3, width: 16, height: 16, borderRadius: '50%', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left .2s', left: (el.glow_on_start ?? true) ? 21 : 3 }} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Active booking */}
          {activeBooking ? (
            <div style={{ background: 'rgba(var(--casi-accent2-rgb),0.06)', border: '1px solid rgba(var(--casi-accent2-rgb),0.2)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, border: '1px solid #222', overflow: 'hidden', background: 'var(--casi-bg)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {activeBooking.image_url && <SlotMedia src={activeBooking.image_url} fileType={activeBooking.file_type} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
                </div>
                <div>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, color: 'var(--casi-text)', fontSize: 14 }}>● {activeBooking.viewer_name}</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--casi-text-muted)' }}>{fmtDuration(activeBooking.duration_minutes)} booked</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {[['Time left', formatTime(seconds), 'var(--casi-accent2)'], ['Earned', `$${earnedSoFar}`, '#4ade80'], ['Total', `$${totalValue}`, 'var(--casi-text)']].map(([l, v, c]) => (
                  <div key={l} style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: '#444', marginBottom: 4 }}>{l}</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 500, color: c }}>{v}</div>
                  </div>
                ))}
              </div>
              {activeBooking.message && <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, color: 'var(--casi-text-muted)', fontStyle: 'italic', marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>"{activeBooking.message}"</div>}
              <button onClick={() => onKick(activeBooking)} style={{ marginTop: 12, width: '100%', background: 'none', border: 'none', color: 'rgba(248,113,113,0.5)', fontFamily: "'DM Mono', monospace", fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer', padding: '6px 0' }}>End early</button>
            </div>
          ) : (
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #161616', borderRadius: 10, padding: 14, textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#444' }}>No active booking</div>
            </div>
          )}

          {/* Queue */}
          {queueBookings.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--casi-text-muted)', marginBottom: 10 }}>{queueBookings.length} in queue</div>
              {queueBookings.map((b, idx) => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(var(--casi-accent-rgb),0.05)', border: '1px solid rgba(var(--casi-accent-rgb),0.12)', borderRadius: 8, padding: '8px 12px', marginBottom: 6 }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(var(--casi-accent-rgb),0.4)', minWidth: 20 }}>#{idx + 1}</span>
                  <div style={{ width: 20, height: 20, borderRadius: 4, overflow: 'hidden', background: 'var(--casi-bg)', flexShrink: 0 }}>
                    {b.image_url && <SlotMedia src={b.image_url} fileType={b.file_type} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
                  </div>
                  <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--casi-text)', flex: 1 }}>{b.viewer_name}</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--casi-text-muted)' }}>{b.duration_minutes}m</span>
                </div>
              ))}
            </div>
          )}

          {/* Controls */}
          <div style={{ paddingTop: 16, borderTop: '1px solid #161616', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--casi-text)', marginBottom: 2 }}>Lock slot</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--casi-text-muted)' }}>No new requests. Current runs to end.</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); onLockToggle(el.id, !el.locked); }}
                style={{ position: 'relative', width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: el.locked ? '#f87171' : 'rgba(255,255,255,0.1)', transition: 'background .2s', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: 4, width: 16, height: 16, borderRadius: '50%', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left .2s', left: el.locked ? 24 : 4 }} />
              </button>
            </div>
            <button onClick={(e) => { e.stopPropagation(); onDelete(el.id); onClose(); }}
              style={{ width: '100%', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: 10, color: '#f87171', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer' }}>
              Delete slot
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
