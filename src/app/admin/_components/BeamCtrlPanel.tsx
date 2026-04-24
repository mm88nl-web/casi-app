import { useEffect, useState } from 'react';
import SlotMedia from '@/components/SlotMedia';
import { SHAPE_OPTIONS } from '@/lib/banner';
import { formatTime, getSecondsRemaining } from './time';

/* Inline beam control panel (D-pad + shape + price + lock + delete + active strip).
   Mirrors SlotInfoPanel's shape/glow controls so streamers can reshape a
   slot without popping open the full modal — the modal is still the place
   for deeper edits (queue view, end-early, delete confirmation). */
export default function BeamCtrlPanel({
  el,
  activeBooking,
  updateSlider,
  updateLayer,
  toggleLock,
  deleteLayer,
  kickBeam,
  onDone,
  onUpdateShape,
  onUpdateGlow,
}: {
  el: any;
  activeBooking: any | null;
  updateSlider: (id: string, updates: any) => void;
  updateLayer: (id: string, updates: any) => void;
  toggleLock: (id: string, locked: boolean) => void;
  deleteLayer: (id: string) => void;
  kickBeam: (booking: any) => void;
  onDone: () => void;
  // Same autosnap-aware handlers SlotInfoPanel gets. Optional so the
  // inline panel still renders if a parent forgets to pass them.
  onUpdateShape?: (id: string, shape: string) => void;
  onUpdateGlow?:  (id: string, glow: boolean) => void;
}) {
  const [editPrice, setEditPrice] = useState(String(el.price_value || 0));
  const [editUnit, setEditUnit] = useState(el.price_unit || 'min');
  const [liveSeconds, setLiveSeconds] = useState(activeBooking ? getSecondsRemaining(activeBooking) : 0);

  // Sync price fields when a different element is selected
  useEffect(() => { setEditPrice(String(el.price_value || 0)); setEditUnit(el.price_unit || 'min'); }, [el.id]);

  // Live countdown for the active booking strip
  useEffect(() => {
    if (!activeBooking) return;
    setLiveSeconds(getSecondsRemaining(activeBooking));
    const iv = setInterval(() => setLiveSeconds(getSecondsRemaining(activeBooking)), 1000);
    return () => clearInterval(iv);
  }, [activeBooking?.id]);

  const durMins = activeBooking ? Number(activeBooking.duration_minutes) : 0;
  const elapsed = activeBooking ? Math.max(0, durMins * 60 - liveSeconds) : 0;
  const earnedSoFar = activeBooking
    ? activeBooking.price_unit === 'min'
      ? ((elapsed / 60) * activeBooking.price_value).toFixed(2)
      : ((elapsed / 3600) * activeBooking.price_value).toFixed(2)
    : null;

  return (
    <div className="beam-ctrl">
      {/* Header — label reflects the slot's role so backdrops don't
          confusingly say "Beam" when the streamer's looking at one. */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontFamily:"var(--font-casi-sans),sans-serif", fontSize:13, fontWeight:700, color: el.is_background ? '#c084fc' : 'var(--casi-accent)' }}>
          {el.is_background ? '🖼 Backdrop' : el.shape === 'banner' ? '▰ Banner' : '✦ Beam'}
        </span>
        <button onClick={onDone}
          style={{ background:'rgba(255,255,255,0.04)', border:'1px solid #222', borderRadius:8, color:'#888', fontFamily:"var(--font-casi-mono),monospace", fontSize:11, padding:'8px 14px', cursor:'pointer', textTransform:'uppercase', letterSpacing:1 }}>
          Done
        </button>
      </div>

      {/* Coordinate readout + size steppers removed — drag + resize on
          the canvas itself are more responsive now and covered the same
          need. `updateSlider` prop stays in the signature for future
          numeric inputs (e.g. banner height tuning) without a breaking
          API change. */}

      {/* Shape + glow row. Shape buttons autosnap dimensions in the parent
          (circle/hex → pixel-square; banner → full-width strip). Glow is a
          pill toggle — on by default. */}
      {onUpdateShape && (
        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', paddingTop:12, borderTop:'1px solid rgba(255,255,255,0.05)' }}>
          <span style={{ fontFamily:"var(--font-casi-mono),monospace", fontSize:10, letterSpacing:1, textTransform:'uppercase', color:'#444', marginRight:4 }}>Shape</span>
          {SHAPE_OPTIONS.map(s => {
            const active = (el.shape || 'rect') === s.id;
            return (
              <button key={s.id} onClick={() => onUpdateShape(el.id, s.id)}
                style={{ background: active ? 'rgba(var(--casi-accent-rgb),0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${active ? 'rgba(var(--casi-accent-rgb),0.5)' : '#222'}`, borderRadius: 6, padding: '5px 10px', fontFamily: "var(--font-casi-mono), monospace", fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: active ? 'var(--casi-accent)' : 'var(--casi-text-muted)', cursor: 'pointer', transition: 'all .15s' }}>
                {s.label}
              </button>
            );
          })}
          {onUpdateGlow && (
            <button onClick={() => onUpdateGlow(el.id, !(el.glow_on_start ?? true))}
              style={{ marginLeft:'auto', background: (el.glow_on_start ?? true) ? 'rgba(var(--casi-accent-rgb),0.1)' : 'rgba(255,255,255,0.04)', border:`1px solid ${(el.glow_on_start ?? true) ? 'rgba(var(--casi-accent-rgb),0.3)' : '#222'}`, borderRadius:7, padding:'5px 10px', color: (el.glow_on_start ?? true) ? 'var(--casi-accent)' : '#555', fontFamily:"var(--font-casi-mono),monospace", fontSize:10, textTransform:'uppercase', letterSpacing:1, cursor:'pointer' }}>
              {(el.glow_on_start ?? true) ? '✦ Glow' : '○ No glow'}
            </button>
          )}
        </div>
      )}

      {/* Price + lock + delete row */}
      {(() => {
        const beamFree = parseFloat(editPrice) === 0;
        return (
      <div style={{ display:'flex', alignItems:'center', gap:8, paddingTop:12, borderTop:'1px solid rgba(255,255,255,0.05)', flexWrap:'wrap' }}>
        <span style={{ fontFamily:"var(--font-casi-mono),monospace", fontSize:10, letterSpacing:1, textTransform:'uppercase', color:'#444', marginRight:2 }}>Price</span>
        <span style={{ color: beamFree ? '#4ade80' : 'var(--casi-accent)', fontWeight:800, fontSize:14 }}>$</span>
        <input type="number" min={0} value={editPrice} onChange={(e) => setEditPrice(e.target.value)}
          style={{ width:56, background:'rgba(255,255,255,0.06)', border:`1px solid ${beamFree ? 'rgba(74,222,128,0.3)' : '#2a2a2a'}`, borderRadius:7, padding:'5px 8px', fontSize:13, color:'var(--casi-text)', outline:'none', fontFamily:"var(--font-casi-mono),monospace", textAlign:'center' }} />
        <select value={editUnit} onChange={(e) => setEditUnit(e.target.value)} disabled={beamFree}
          style={{ background:'var(--casi-surface)', border:'1px solid #2a2a2a', borderRadius:7, padding:'5px 8px', fontSize:11, color:'var(--casi-text)', outline:'none', cursor: beamFree ? 'not-allowed' : 'pointer', fontFamily:"var(--font-casi-mono),monospace", opacity: beamFree ? 0.4 : 1 }}>
          <option value="min">/min</option>
          <option value="hr">/hr</option>
        </select>
        <button type="button" onClick={() => setEditPrice('0')}
          style={{ background: beamFree ? 'rgba(74,222,128,0.14)' : 'rgba(255,255,255,0.04)', border: `1px solid ${beamFree ? 'rgba(74,222,128,0.4)' : '#222'}`, borderRadius: 6, padding: '5px 10px', fontFamily: "var(--font-casi-mono), monospace", fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: beamFree ? '#4ade80' : 'var(--casi-text-muted)', cursor: 'pointer', transition: 'all .15s' }}>
          {beamFree ? '★ Free' : '★ Make free'}
        </button>
        <button onClick={() => updateLayer(el.id, { price_value: parseFloat(editPrice) || 0, price_unit: editUnit })}
          style={{ background: beamFree ? '#4ade80' : 'var(--casi-accent)', border:'none', borderRadius:7, padding:'5px 12px', color:'var(--casi-bg)', fontFamily:"var(--font-casi-sans),sans-serif", fontWeight:800, fontSize:11, textTransform:'uppercase', cursor:'pointer' }}>
          Save
        </button>
        {/* Lock toggle */}
        <button onClick={() => toggleLock(el.id, !el.locked)}
          style={{ marginLeft:'auto', background: el.locked ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.04)', border:`1px solid ${el.locked ? 'rgba(248,113,113,0.3)' : '#222'}`, borderRadius:7, padding:'5px 10px', color: el.locked ? '#f87171' : '#555', fontFamily:"var(--font-casi-mono),monospace", fontSize:10, textTransform:'uppercase', letterSpacing:1, cursor:'pointer' }}>
          {el.locked ? '🔒 Locked' : '🔓 Open'}
        </button>
        <button onClick={() => deleteLayer(el.id)}
          style={{ background:'rgba(248,113,113,0.07)', border:'1px solid rgba(248,113,113,0.15)', borderRadius:7, padding:'5px 10px', color:'rgba(248,113,113,0.6)', fontFamily:"var(--font-casi-mono),monospace", fontSize:10, cursor:'pointer' }}>
          ✕
        </button>
      </div>
        );
      })()}

      {/* Active booking strip */}
      {activeBooking && (
        <div style={{ display:'flex', alignItems:'center', gap:10, background:'rgba(var(--casi-accent2-rgb),0.06)', border:'1px solid rgba(var(--casi-accent2-rgb),0.2)', borderRadius:8, padding:'8px 12px', flexWrap:'wrap' }}>
          {activeBooking.image_url && (
            <div style={{ width:24, height:24, borderRadius:4, overflow:'hidden', flexShrink:0 }}>
              <SlotMedia src={activeBooking.image_url} fileType={activeBooking.file_type} style={{ width:'100%', height:'100%', objectFit:'contain' }} />
            </div>
          )}
          <span style={{ fontFamily:"var(--font-casi-sans),sans-serif", fontSize:12, fontWeight:700, color:'var(--casi-accent2)' }}>● {activeBooking.viewer_name}</span>
          <span style={{ fontFamily:"var(--font-casi-mono),monospace", fontSize:10, color:'#555' }}>{formatTime(liveSeconds)} left</span>
          {earnedSoFar && <span style={{ fontFamily:"var(--font-casi-mono),monospace", fontSize:10, color:'#4ade80' }}>${earnedSoFar} earned</span>}
          <button onClick={() => kickBeam(activeBooking)}
            style={{ marginLeft:'auto', background:'none', border:'none', color:'rgba(248,113,113,0.5)', fontFamily:"var(--font-casi-mono),monospace", fontSize:10, textTransform:'uppercase', letterSpacing:1, cursor:'pointer' }}>
            End early
          </button>
        </div>
      )}
    </div>
  );
}
