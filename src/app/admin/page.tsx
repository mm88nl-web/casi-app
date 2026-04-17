"use client";
import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Rnd } from 'react-rnd';
import { useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import SkinProvider from '@/components/SkinProvider';
import { SKINS } from '@/lib/skins';
import WalletNav from '@/components/WalletNav';
import ChatPanel from '@/components/ChatPanel';
import { SOLANA_RPC, STREAMFLOW_CLUSTER } from '@/lib/solana-network';

/* ── Logo ── */
function Logo({ scale = 0.38, color = 'var(--casi-accent)', bg = 'var(--casi-bg)' }: { scale?: number; color?: string; bg?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width={400 * scale} height={200 * scale}>
      <g stroke={color} fill={color} strokeWidth="16" strokeLinecap="round">
        <line x1="50" y1="60" x2="350" y2="60" />
        <line x1="20" y1="100" x2="380" y2="100" />
        <line x1="50" y1="140" x2="350" y2="140" />
      </g>
      <path fill={color} stroke="none" d="M 90,100 C 130,30 270,30 310,100 C 270,170 130,170 90,100 Z" />
      <circle fill={bg} cx="200" cy="100" r="45" />
    </svg>
  );
}

/* ── Helpers ── */
function getSecondsRemaining(booking: any): number {
  if (!booking?.started_at || !booking?.duration_minutes) return 0;
  const started = new Date(booking.started_at).getTime();
  // Explicit Number() coercion: Postgres NUMERIC columns return as strings via PostgREST
  const expiresAt = started + Number(booking.duration_minutes) * 60 * 1000;
  return Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
}
function formatTime(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
function fmtDuration(minutes: number): string {
  const secs = Math.round(minutes * 60);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function BeamTimer({ booking, onExpire }: { booking: any; onExpire: (b: any) => void }) {
  const [seconds, setSeconds] = useState(getSecondsRemaining(booking));
  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = getSecondsRemaining(booking);
      setSeconds(remaining);
      if (remaining <= 0) { clearInterval(interval); onExpire(booking); }
    }, 1000);
    return () => clearInterval(interval);
  }, [booking, onExpire]);
  const isWarning = seconds <= 120 && seconds > 0;
  const isExpired = seconds <= 0;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 11,
      fontFamily: "'DM Mono', monospace", fontWeight: 500,
      background: isExpired ? 'rgba(239,68,68,0.12)' : isWarning ? 'rgba(234,179,8,0.12)' : 'rgba(var(--casi-accent2-rgb),0.10)',
      color: isExpired ? '#f87171' : isWarning ? '#facc15' : 'var(--casi-accent2)',
      border: `1px solid ${isExpired ? 'rgba(239,68,68,0.3)' : isWarning ? 'rgba(234,179,8,0.3)' : 'rgba(var(--casi-accent2-rgb),0.2)'}`,
      animation: isWarning ? 'pulse 1.5s infinite' : 'none',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
      {isExpired ? 'Expired' : formatTime(seconds)}
    </span>
  );
}

/* ── Smart placement: find first unoccupied grid cell ── */
function findFreePosition(elements: any[]): { pos_x: number; pos_y: number } {
  const beams = elements.filter(el => !el.is_background);
  // Try a 4x4 grid of candidate positions
  const candidates = [
    { pos_x: 5, pos_y: 5 }, { pos_x: 30, pos_y: 5 }, { pos_x: 55, pos_y: 5 }, { pos_x: 75, pos_y: 5 },
    { pos_x: 5, pos_y: 30 }, { pos_x: 30, pos_y: 30 }, { pos_x: 55, pos_y: 30 }, { pos_x: 75, pos_y: 30 },
    { pos_x: 5, pos_y: 55 }, { pos_x: 30, pos_y: 55 }, { pos_x: 55, pos_y: 55 }, { pos_x: 75, pos_y: 55 },
    { pos_x: 5, pos_y: 70 }, { pos_x: 30, pos_y: 70 }, { pos_x: 55, pos_y: 70 }, { pos_x: 75, pos_y: 70 },
  ];
  for (const c of candidates) {
    const overlaps = beams.some(b => {
      const dx = Math.abs(b.pos_x - c.pos_x);
      const dy = Math.abs(b.pos_y - c.pos_y);
      return dx < 18 && dy < 18;
    });
    if (!overlaps) return c;
  }
  // Fallback: offset from last beam
  const last = beams[beams.length - 1];
  return { pos_x: Math.min(75, (last?.pos_x ?? 5) + 5), pos_y: Math.min(70, (last?.pos_y ?? 5) + 5) };
}

/* ── Profile edit accent presets ── */
const THEME_PRESETS = [
  { name: 'Casi Orange',   color: '#F58220' },
  { name: 'Twitch Purple', color: '#9146FF' },
  { name: 'Cyber Cyan',    color: '#06b6d4' },
  { name: 'YouTube Red',   color: '#FF0000' },
  { name: 'Matrix Green',  color: '#4ade80' },
  { name: 'Kick Green',    color: '#53FC18' },
  { name: 'Rose Pink',     color: '#f472b6' },
  { name: 'Gold',          color: '#facc15' },
  { name: 'Pure White',    color: '#e8e8e8' },
];

/* ── Backdrop Modal ── */
function BackdropModal({ onConfirm, onClose }: {
  onConfirm: (price: number, unit: string, maxDuration: number | null) => void;
  onClose: () => void;
}) {
  const [price, setPrice] = useState(10);
  const [unit, setUnit] = useState('hr');
  const [maxDuration, setMaxDuration] = useState('');
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 24 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--casi-surface)', border: '1px solid #222', borderRadius: 16, padding: 32, width: '100%', maxWidth: 380 }}>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, color: 'var(--casi-text)', marginBottom: 6 }}>Full Backdrop</h2>
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--casi-text-muted)', marginBottom: 24, lineHeight: 1.6 }}>Full-screen slot. Viewers send their image — you approve before it goes live.</p>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--casi-text-muted)', marginBottom: 8 }}>Price</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--casi-accent)', fontWeight: 800 }}>$</span>
            <input type="number" min={1} value={price} onChange={(e) => setPrice(Math.max(1, parseInt(e.target.value) || 1))}
              style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid #222', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: 'var(--casi-text)', outline: 'none', fontFamily: "'Syne', sans-serif" }} autoFocus />
            <select value={unit} onChange={(e) => setUnit(e.target.value)}
              style={{ background: 'var(--casi-surface)', border: '1px solid #222', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--casi-text)', outline: 'none', cursor: 'pointer', fontFamily: "'DM Mono', monospace" }}>
              <option value="min">/min</option>
              <option value="hr">/hr</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--casi-text-muted)', marginBottom: 8 }}>Max duration (minutes, optional)</div>
          <input type="number" min={1} value={maxDuration} onChange={(e) => setMaxDuration(e.target.value)} placeholder="No limit"
            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid #222', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: 'var(--casi-text)', outline: 'none', fontFamily: "'Syne', sans-serif" }} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid #222', borderRadius: 8, padding: 12, color: '#888', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 12, textTransform: 'uppercase', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => onConfirm(price, unit, maxDuration ? parseInt(maxDuration) : null)}
            style={{ flex: 1, background: 'var(--casi-accent)', border: 'none', borderRadius: 8, padding: 12, color: 'var(--casi-bg)', fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 12, textTransform: 'uppercase', cursor: 'pointer' }}>Create Slot</button>
        </div>
      </div>
    </div>
  );
}

/* ── Slot Info Panel ── */
function SlotInfoPanel({ el, activeBooking, queueBookings, onClose, onKick, onLockToggle, onDelete, onUpdatePrice }: {
  el: any; activeBooking: any; queueBookings: any[];
  onClose: () => void; onKick: (b: any) => void;
  onLockToggle: (id: string, locked: boolean) => void;
  onDelete: (id: string) => void;
  onUpdatePrice: (id: string, price: number, unit: string) => void;
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
          <div style={{ background: 'rgba(var(--casi-accent-rgb),0.05)', border: '1px solid rgba(var(--casi-accent-rgb),0.15)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--casi-text-muted)', marginBottom: 10 }}>Price</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--casi-accent)', fontWeight: 800, fontSize: 16 }}>$</span>
              <input type="number" min={0} value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid #333', borderRadius: 8, padding: '10px 14px', fontSize: 16, color: 'var(--casi-text)', outline: 'none', fontFamily: "'DM Mono', monospace" }} />
              <select value={editUnit} onChange={(e) => setEditUnit(e.target.value)}
                style={{ background: 'var(--casi-surface)', border: '1px solid #333', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--casi-text)', outline: 'none', cursor: 'pointer', fontFamily: "'DM Mono', monospace" }}>
                <option value="min">/min</option>
                <option value="hr">/hr</option>
              </select>
              <button onClick={() => { onUpdatePrice(el.id, parseFloat(editPrice) || 0, editUnit); onClose(); }}
                style={{ background: 'var(--casi-accent)', border: 'none', borderRadius: 8, padding: '10px 16px', color: 'var(--casi-bg)', fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 12, textTransform: 'uppercase', cursor: 'pointer' }}>
                Save
              </button>
            </div>
          </div>

          {/* Active booking */}
          {activeBooking ? (
            <div style={{ background: 'rgba(var(--casi-accent2-rgb),0.06)', border: '1px solid rgba(var(--casi-accent2-rgb),0.2)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, border: '1px solid #222', overflow: 'hidden', background: 'var(--casi-bg)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {activeBooking.image_url && <img src={activeBooking.image_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="" />}
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
                    {b.image_url && <img src={b.image_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="" />}
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

/* ── Inline beam control panel (D-pad + price + lock + delete + active strip) ── */
function BeamCtrlPanel({ el, activeBooking, updateSlider, updateLayer, toggleLock, deleteLayer, kickBeam, onDone }: {
  el: any; activeBooking: any | null;
  updateSlider: (id: string, updates: any) => void;
  updateLayer: (id: string, updates: any) => void;
  toggleLock: (id: string, locked: boolean) => void;
  deleteLayer: (id: string) => void;
  kickBeam: (booking: any) => void;
  onDone: () => void;
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
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontFamily:"'Syne',sans-serif", fontSize:13, fontWeight:700, color:'var(--casi-accent)' }}>✦ Beam</span>
        <button onClick={onDone}
          style={{ background:'rgba(255,255,255,0.04)', border:'1px solid #222', borderRadius:8, color:'#888', fontFamily:"'DM Mono',monospace", fontSize:11, padding:'8px 14px', cursor:'pointer', textTransform:'uppercase', letterSpacing:1 }}>
          Done
        </button>
      </div>

      {/* Coordinate readout */}
      <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:'#444', letterSpacing:1 }}>
        X {Math.round(el.pos_x)}% · Y {Math.round(el.pos_y)}% · W {Math.round(el.width)}% · H {Math.round(el.height)}%
      </div>

      {/* D-pad + size controls */}
      <div style={{ display:'flex', alignItems:'center', gap:24, flexWrap:'wrap' }}>
        {/* Position D-pad */}
        <div>
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:9, letterSpacing:2, textTransform:'uppercase', color:'#333', marginBottom:6 }}>Position</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,36px)', gridTemplateRows:'repeat(3,36px)', gap:4 }}>
            <div /><button className="dpad-btn" onClick={() => updateSlider(el.id, { pos_y: Math.max(0, el.pos_y - 1) })}>↑</button><div />
            <button className="dpad-btn" onClick={() => updateSlider(el.id, { pos_x: Math.max(0, el.pos_x - 1) })}>←</button>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:'#222', fontWeight:700 }}>✦</div>
            <button className="dpad-btn" onClick={() => updateSlider(el.id, { pos_x: Math.min(80, el.pos_x + 1) })}>→</button>
            <div /><button className="dpad-btn" onClick={() => updateSlider(el.id, { pos_y: Math.min(80, el.pos_y + 1) })}>↓</button><div />
          </div>
        </div>

        {/* Size steppers */}
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:9, letterSpacing:2, textTransform:'uppercase', color:'#333', marginBottom:2 }}>Size</div>
          {[
            { label:'W', field:'width',  min:5, max:60, val:el.width  },
            { label:'H', field:'height', min:5, max:60, val:el.height },
          ].map(({ label, field, min, max, val }) => (
            <div key={field} style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:'#444', width:10 }}>{label}</span>
              <button className="step-btn" onClick={() => updateSlider(el.id, { [field]: Math.max(min, val - 2) })}>−</button>
              <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:'var(--casi-text)', width:34, textAlign:'center' }}>{Math.round(val)}%</span>
              <button className="step-btn" onClick={() => updateSlider(el.id, { [field]: Math.min(max, val + 2) })}>+</button>
            </div>
          ))}
        </div>
      </div>

      {/* Price + lock + delete row */}
      <div style={{ display:'flex', alignItems:'center', gap:8, paddingTop:12, borderTop:'1px solid rgba(255,255,255,0.05)', flexWrap:'wrap' }}>
        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, letterSpacing:1, textTransform:'uppercase', color:'#444', marginRight:2 }}>Price</span>
        <span style={{ color:'var(--casi-accent)', fontWeight:800, fontSize:14 }}>$</span>
        <input type="number" min={0} value={editPrice} onChange={(e) => setEditPrice(e.target.value)}
          style={{ width:56, background:'rgba(255,255,255,0.06)', border:'1px solid #2a2a2a', borderRadius:7, padding:'5px 8px', fontSize:13, color:'var(--casi-text)', outline:'none', fontFamily:"'DM Mono',monospace", textAlign:'center' }} />
        <select value={editUnit} onChange={(e) => setEditUnit(e.target.value)}
          style={{ background:'var(--casi-surface)', border:'1px solid #2a2a2a', borderRadius:7, padding:'5px 8px', fontSize:11, color:'var(--casi-text)', outline:'none', cursor:'pointer', fontFamily:"'DM Mono',monospace" }}>
          <option value="min">/min</option>
          <option value="hr">/hr</option>
        </select>
        <button onClick={() => updateLayer(el.id, { price_value: parseFloat(editPrice) || 0, price_unit: editUnit })}
          style={{ background:'var(--casi-accent)', border:'none', borderRadius:7, padding:'5px 12px', color:'var(--casi-bg)', fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:11, textTransform:'uppercase', cursor:'pointer' }}>
          Save
        </button>
        {/* Lock toggle */}
        <button onClick={() => toggleLock(el.id, !el.locked)}
          style={{ marginLeft:'auto', background: el.locked ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.04)', border:`1px solid ${el.locked ? 'rgba(248,113,113,0.3)' : '#222'}`, borderRadius:7, padding:'5px 10px', color: el.locked ? '#f87171' : '#555', fontFamily:"'DM Mono',monospace", fontSize:10, textTransform:'uppercase', letterSpacing:1, cursor:'pointer' }}>
          {el.locked ? '🔒 Locked' : '🔓 Open'}
        </button>
        <button onClick={() => deleteLayer(el.id)}
          style={{ background:'rgba(248,113,113,0.07)', border:'1px solid rgba(248,113,113,0.15)', borderRadius:7, padding:'5px 10px', color:'rgba(248,113,113,0.6)', fontFamily:"'DM Mono',monospace", fontSize:10, cursor:'pointer' }}>
          ✕
        </button>
      </div>

      {/* Active booking strip */}
      {activeBooking && (
        <div style={{ display:'flex', alignItems:'center', gap:10, background:'rgba(var(--casi-accent2-rgb),0.06)', border:'1px solid rgba(var(--casi-accent2-rgb),0.2)', borderRadius:8, padding:'8px 12px', flexWrap:'wrap' }}>
          {activeBooking.image_url && (
            <div style={{ width:24, height:24, borderRadius:4, overflow:'hidden', flexShrink:0 }}>
              <img src={activeBooking.image_url} style={{ width:'100%', height:'100%', objectFit:'contain' }} alt="" />
            </div>
          )}
          <span style={{ fontFamily:"'Syne',sans-serif", fontSize:12, fontWeight:700, color:'var(--casi-accent2)' }}>● {activeBooking.viewer_name}</span>
          <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:'#555' }}>{formatTime(liveSeconds)} left</span>
          {earnedSoFar && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:'#4ade80' }}>${earnedSoFar} earned</span>}
          <button onClick={() => kickBeam(activeBooking)}
            style={{ marginLeft:'auto', background:'none', border:'none', color:'rgba(248,113,113,0.5)', fontFamily:"'DM Mono',monospace", fontSize:10, textTransform:'uppercase', letterSpacing:1, cursor:'pointer' }}>
            End early
          </button>
        </div>
      )}
    </div>
  );
}


/* ══════════════════════════════════════════
   MAIN ADMIN PAGE
══════════════════════════════════════════ */
export default function AdminStudio() {
  const [view, setView] = useState<'studio' | 'requests' | 'chat' | 'settings'>('studio');
  const [profile, setProfile] = useState<any>(null);
  const [activeSkin, setActiveSkin] = useState<string | null>(null);
  const [savingSkin, setSavingSkin] = useState(false);
  // Inline profile edit
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [editAvatarValid, setEditAvatarValid] = useState(false);
  const [previewBgUrl, setPreviewBgUrl] = useState<string|null>(null);
  const [uploadingPreviewBg, setUploadingPreviewBg] = useState(false);
  const [editThemeColor, setEditThemeColor] = useState('#F58220');
  const [editCustomColor, setEditCustomColor] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editSaved, setEditSaved] = useState(false);
  // Stripe + Solana
  const [stripeConnected, setStripeConnected] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [solanaWallet, setSolanaWallet] = useState('');
  const [savingWallet, setSavingWallet] = useState(false);
  const [walletSaved, setWalletSaved] = useState(false);
  const [elements, setElements] = useState<any[]>([]);
  const [pendingBookings, setPendingBookings] = useState<any[]>([]);
  const [queuedBookings, setQueuedBookings] = useState<any[]>([]);
  const [activeBookings, setActiveBookings] = useState<any[]>([]);
  const [approvedQueued, setApprovedQueued] = useState<any[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Ready');
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [previewBooking, setPreviewBooking] = useState<any>(null);
  const [showBackdropModal, setShowBackdropModal] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [togglingLive, setTogglingLive] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const dragStartPos = useRef<{x:number;y:number}|null>(null);
  const isDragging = useRef(false);

  const router = useRouter();
  const supabase = useRef(createClient()).current;

  // Wallet hooks
  const { wallet, connected: walletConnected, connecting: walletConnecting, connect, publicKey } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const userInitiatedConnect = useRef(false);
  useEffect(() => {
    if (wallet && !walletConnected && !walletConnecting && userInitiatedConnect.current) {
      userInitiatedConnect.current = false;
      connect().catch(() => {});
    }
  }, [wallet]); // eslint-disable-line react-hooks/exhaustive-deps
  const openWalletModal = () => {
    userInitiatedConnect.current = true;
    if (wallet) { connect().catch(() => {}); } else { setWalletModalVisible(true); }
  };

  const handlePreviewBgUpload = async (file: File) => {
    if (!profile) return;
    if (file.size > 5 * 1024 * 1024) return; // 5 MB guard
    setUploadingPreviewBg(true);
    const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'png';
    const path = `${profile.id}-preview.${ext}`;
    const { error } = await supabase.storage.from('casi-media').upload(path, file, { upsert: true, contentType: file.type });
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('casi-media').getPublicUrl(path);
      await supabase.from('profiles').update({ preview_background_url: publicUrl }).eq('id', profile.id);
      setPreviewBgUrl(publicUrl);
      setProfile((p: any) => ({ ...p, preview_background_url: publicUrl }));
    }
    setUploadingPreviewBg(false);
  };

  const handleStripeConnect = async () => {
    setStripeLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/stripe/connect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({}),
    });
    const { url } = await res.json();
    if (url) window.location.href = url;
    else setStripeLoading(false);
  };

  const handleSaveWallet = async () => {
    if (!profile || !publicKey) return;
    setSavingWallet(true);
    const address = publicKey.toBase58();
    const { error: saveError } = await supabase.from('profiles').update({ solana_wallet: address }).eq('id', profile.id);
    if (saveError) { setSavingWallet(false); return; }
    setSolanaWallet(address);
    setProfile((p: any) => ({ ...p, solana_wallet: address }));
    fetch('/api/solana/sync-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    }).catch(() => {});
    setSavingWallet(false);
    setWalletSaved(true);
    setTimeout(() => setWalletSaved(false), 3000);
  };

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(prof);
      if (prof?.skin) setActiveSkin(prof.skin);
      if (prof) {
        setEditName(prof.display_name || prof.username || '');
        setEditBio(prof.bio || '');
        setEditAvatar(prof.avatar_url || '');
        if (prof.avatar_url) setEditAvatarValid(true);
        if (prof.theme_color) setEditThemeColor(prof.theme_color);
        if (prof.stripe_account_id) setStripeConnected(true);
        if (prof.solana_wallet) setSolanaWallet(prof.solana_wallet);
        if (prof.preview_background_url) setPreviewBgUrl(prof.preview_background_url);
      }
      const { data: els } = await supabase.from('overlay_elements').select('*').eq('profile_id', user.id);
      if (els) setElements(els);
      setIsReady(true);
      // Show onboarding banner if not dismissed and no elements yet
      try {
        const dismissed = localStorage.getItem('casi_onboarding_dismissed');
        if (!dismissed && (!els || els.length === 0)) setShowBanner(true);
      } catch {}
    };
    init();
  }, [router, supabase]);

  const loadBookings = useCallback(async (profileId: string) => {
    const [{ data: pending }, { data: active }, { data: aq }] = await Promise.all([
      supabase.from('bookings').select('*').eq('profile_id', profileId).eq('status', 'pending').order('created_at', { ascending: true }),
      supabase.from('bookings').select('*').eq('profile_id', profileId).eq('status', 'active').order('started_at', { ascending: false }),
      supabase.from('bookings').select('*').eq('profile_id', profileId).eq('status', 'approved_queued').order('approved_at', { ascending: true }),
    ]);
    const all = pending || [];
    setPendingBookings(all.filter(b => !b.is_queued));
    setQueuedBookings(all.filter(b => b.is_queued));
    setActiveBookings(active || []);
    setApprovedQueued(aq || []);
  }, [supabase]);

  useEffect(() => {
    if (!profile?.id) return;
    loadBookings(profile.id);
    const channel = supabase.channel(`admin_bookings_${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `profile_id=eq.${profile.id}` }, () => loadBookings(profile.id))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, supabase, loadBookings]);

  /* ── FIX: callback ref so canvas dimensions fire on first mount ── */
  const setMonitorRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const measure = () => {
      if (node.clientWidth > 0) setDimensions({ width: node.clientWidth, height: node.clientHeight });
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(node);
  }, []);

  const toggleLive = async () => {
    if (!profile) return;
    setTogglingLive(true);
    const newVal = !profile.is_live;
    setProfile((prev: any) => ({ ...prev, is_live: newVal }));
    await supabase.from('profiles').update({ is_live: newVal }).eq('id', profile.id);
    setTogglingLive(false);
  };

  const expireBooking = useCallback(async (booking: any) => {
    // Stripe capture for natural expiry is handled by the Vercel Cron janitor
    // (/api/cron/stripe-janitor). We do NOT call the API here because a
    // fire-and-forget fetch races with the queue-advance logic below:
    // the API might start the next booking before our query runs, causing
    // the else-branch to clear that booking's image_url.

    // Delete uploaded file from Supabase Storage before clearing the row
    if (booking.storage_path) {
      await supabase.storage.from('beams').remove([booking.storage_path]).catch((err: any) => {
        console.error('[expireBooking] storage delete failed:', err.message);
      });
    }
    await supabase.from('bookings').update({ status: 'expired', image_url: null }).eq('id', booking.id);
    if (booking.element_id) {
      const { data: next } = await supabase.from('bookings').select('*')
        .eq('element_id', booking.element_id).eq('status', 'approved_queued')
        .order('approved_at', { ascending: true }).limit(1).single();
      if (next) {
        await supabase.from('bookings').update({ status: 'active', started_at: new Date().toISOString() }).eq('id', next.id);
        await supabase.from('overlay_elements').update({ image_url: next.image_url }).eq('id', next.element_id);
        setElements(prev => prev.map(el => el.id === next.element_id ? { ...el, image_url: next.image_url } : el));
      } else {
        await supabase.from('overlay_elements').update({ image_url: '' }).eq('id', booking.element_id);
        setElements(prev => prev.map(el => el.id === booking.element_id ? { ...el, image_url: '' } : el));
      }
    }
    setActiveBookings(prev => prev.filter(b => b.id !== booking.id));
    if (profile?.id) loadBookings(profile.id);
  }, [supabase, profile?.id, loadBookings]);

  const updateLayer = useCallback(async (id: string, updates: any) => {
    setSaveStatus('Saving…');
    const s = { ...updates };
    if (s.price_value !== undefined) s.price_value = parseFloat(s.price_value) || 0;
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...s } : el));
    await supabase.from('overlay_elements').update(s).eq('id', id);
    setSaveStatus('Saved');
    setTimeout(() => setSaveStatus('Ready'), 2000);
  }, [supabase]);

  /* ── Slider update (local only, debounced save) ── */
  const sliderSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateSlider = useCallback((id: string, updates: any) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el));
    if (sliderSaveTimer.current) clearTimeout(sliderSaveTimer.current);
    sliderSaveTimer.current = setTimeout(async () => {
      await supabase.from('overlay_elements').update(updates).eq('id', id);
    }, 400);
  }, [supabase]);

  const updateLocalOnly = useCallback((id: string, updates: any) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el));
  }, []);

  const createFullBackdrop = async (price: number, unit: string, maxDuration: number | null) => {
    setShowBackdropModal(false);
    setSaveStatus('Creating…');
    const existing = elements.find(el => el.is_background);
    if (existing) await supabase.from('overlay_elements').delete().eq('id', existing.id);
    const { data } = await supabase.from('overlay_elements').insert({
      profile_id: profile.id, image_url: '', pos_x: 0, pos_y: 0, width: 100, height: 100,
      is_background: true, price_value: price, price_unit: unit, max_duration_minutes: maxDuration, locked: false,
    }).select().single();
    if (data) setElements(prev => [...prev.filter(el => !el.is_background), data]);
    setSaveStatus('Ready');
  };

  const addBeam = async () => {
    const backdrop = elements.find(el => el.is_background);
    if (backdrop) {
      const backdropActive = activeBookings.some(b => b.element_id === backdrop.id) || approvedQueued.some(b => b.element_id === backdrop.id);
      if (!backdropActive) {
        await supabase.from('overlay_elements').delete().eq('id', backdrop.id);
        setElements(prev => prev.filter(el => !el.is_background));
      }
    }
    // Smart placement — find free spot
    const freePos = findFreePosition(elements);
    const { data } = await supabase.from('overlay_elements').insert({
      profile_id: profile.id, image_url: '',
      pos_x: freePos.pos_x, pos_y: freePos.pos_y,
      width: 20, height: 20,
      is_background: false, price_value: 0, price_unit: 'min', max_duration_minutes: null, locked: false,
    }).select().single();
    if (data) {
      setElements(prev => [...prev, data]);
      setSelectedSlotId(data.id); // auto-select new beam, show sliders
      setShowInfoPanel(false);
    }
  };

  const deleteLayer = async (id: string) => {
    if (selectedSlotId === id) { setSelectedSlotId(null); setShowInfoPanel(false); }
    await supabase.from('overlay_elements').delete().eq('id', id);
    setElements(prev => prev.filter(el => el.id !== id));
  };

  const clearAll = async () => {
    if (!profile) return;
    setSaveStatus('Clearing…');
    const protectedIds = new Set([...activeBookings.map(b => b.element_id), ...approvedQueued.map(b => b.element_id)]);
    const toDelete = elements.filter(el => !protectedIds.has(el.id));
    if (toDelete.length === 0) { setSaveStatus('Nothing to clear'); setTimeout(() => setSaveStatus('Ready'), 2000); return; }
    await Promise.all(toDelete.map(el => supabase.from('overlay_elements').delete().eq('id', el.id)));
    setElements(prev => prev.filter(el => protectedIds.has(el.id)));
    setSelectedSlotId(null);
    setShowInfoPanel(false);
    setSaveStatus(`Cleared ${toDelete.length}`);
    setTimeout(() => setSaveStatus('Ready'), 2000);
  };

  const toggleLock = useCallback(async (id: string, locked: boolean) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, locked } : el));
    await supabase.from('overlay_elements').update({ locked }).eq('id', id);
  }, [supabase]);

  // Payment is confirmed if Stripe PaymentIntent exists OR Solana tx_signature exists
  const isPaymentConfirmed = (b: any) => !!(b.payment_intent_id || b.tx_signature);

  const approveBooking = async (booking: any) => {
  setPreviewBooking(null);
  const slotOccupied = activeBookings.some(b => b.element_id === booking.element_id);

  if (slotOccupied || booking.is_queued) {
    await supabase
      .from('bookings')
      .update({ status: 'approved_queued', approved_at: new Date().toISOString() })
      .eq('id', booking.id);
  } else {
    // Direct booking with payment already confirmed
    await supabase
      .from('bookings')
      .update({ status: 'active', started_at: new Date().toISOString() })
      .eq('id', booking.id);
    if (booking.element_id) {
      await supabase
        .from('overlay_elements')
        .update({ image_url: booking.image_url })
        .eq('id', booking.element_id);
      setElements(prev => prev.map(el =>
        el.id === booking.element_id ? { ...el, image_url: booking.image_url } : el
      ));
    }
  }
  setPendingBookings(prev => prev.filter(b => b.id !== booking.id));
  setQueuedBookings(prev => prev.filter(b => b.id !== booking.id));
};

  const denyBooking = async (id: string, paymentMethod?: string) => {
  setPreviewBooking(null);
  if (paymentMethod === 'solana') {
    // Solana: just mark denied — Streamflow stream cancellation is viewer-side
    await supabase.from('bookings').update({ status: 'denied' }).eq('id', id);
  } else {
    // Stripe: void/refund PaymentIntent then mark denied
    await fetch('/api/stripe/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: id }),
    });
  }
  setPendingBookings(prev => prev.filter(b => b.id !== id));
  setQueuedBookings(prev => prev.filter(b => b.id !== id));
};

  const kickBeam = useCallback(async (booking: any) => {
    setSelectedSlotId(null);
    setShowInfoPanel(false);
    if (booking.payment_method === 'solana') {
      // Cancel the on-chain Streamflow vesting stream so unvested USDC
      // returns to the viewer. The admin wallet is the stream recipient
      // (cancelableByRecipient: true) so it can sign the cancel tx.
      if (booking.stream_id && publicKey && profile?.solana_wallet &&
          publicKey.toBase58() === profile.solana_wallet) {
        try {
          const { SolanaStreamClient, ICluster } = await import('@streamflow/stream');
          const client = new SolanaStreamClient(SOLANA_RPC, STREAMFLOW_CLUSTER === 'mainnet' ? ICluster.Mainnet : ICluster.Devnet);
          await client.cancel({ id: booking.stream_id }, { invoker: (wallet as any)?.adapter ?? wallet });
        } catch (err) {
          console.error('[kickBeam] Streamflow cancel error:', err);
        }
      }
      await expireBooking(booking);
    } else {
      // Stripe: prorate via API, then clear image + advance queue
      const { data: { session } } = await supabase.auth.getSession();
      await fetch('/api/stripe/end-early', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ booking_id: booking.id }),
      });
      await expireBooking(booking);
    }
  }, [expireBooking, publicKey, profile?.solana_wallet, wallet, supabase]);

  const copyUrl = (url: string, key: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(key);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const calcTotal = (booking: any) => booking.price_unit === 'min'
    ? (booking.price_value * Number(booking.duration_minutes)).toFixed(0)
    : (booking.price_value * (Number(booking.duration_minutes) / 60)).toFixed(2);

  const getQueuePosition = (booking: any) => {
    const q = approvedQueued.filter(b => b.element_id === booking.element_id)
      .sort((a, b) => new Date(a.approved_at).getTime() - new Date(b.approved_at).getTime());
    return q.findIndex(b => b.id === booking.id) + 1;
  };

  const isBackdropBooking = (booking: any) => {
    const el = elements.find(e => e.id === booking.element_id);
    return el?.is_background ?? false;
  };

  const totalPending = pendingBookings.length + queuedBookings.length;
  const slotOccupiedForPreview = previewBooking ? activeBookings.some(b => b.element_id === previewBooking.element_id) : false;
  const backdropEl = elements.find(el => el.is_background);
  const hasBackdrop = !!backdropEl;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const selectedEl = elements.find(el => el.id === selectedSlotId) || null;

  if (!isReady || !profile) return (
    <div style={{ minHeight: '100vh', background: 'var(--casi-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <Logo scale={0.5} />
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--casi-accent)', animation: 'pulse 1.5s infinite' }}>Loading studio…</span>
    </div>
  );

  const activeBeams    = activeBookings.filter(b => !isBackdropBooking(b));
  const activeBackdrop = activeBookings.filter(b =>  isBackdropBooking(b));
  const approvedBeams    = approvedQueued.filter(b => !isBackdropBooking(b));
  const approvedBackdrop = approvedQueued.filter(b =>  isBackdropBooking(b));
  const pendingBeams    = pendingBookings.filter(b => !isBackdropBooking(b));
  const pendingBackdrop = pendingBookings.filter(b =>  isBackdropBooking(b));
  const queuedBeams     = queuedBookings.filter(b => !isBackdropBooking(b));
  const queuedBackdrop  = queuedBookings.filter(b =>  isBackdropBooking(b));

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--casi-bg); }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes blink  { 0%,100%{opacity:1} 50%{opacity:.2} }

        .sw { min-height:100vh; background:var(--casi-bg); color:var(--casi-text); font-family:'Syne',sans-serif; display:flex; flex-direction:column; }

        /* NAV */
        .top-nav { display:flex; align-items:center; justify-content:space-between; padding:0 32px; height:64px; flex-shrink:0; border-bottom:1px solid rgba(var(--casi-accent-rgb),0.08); background:color-mix(in srgb, var(--casi-bg) 96%, transparent); backdrop-filter:blur(20px); position:sticky; top:0; z-index:100; }
        .tnl { display:flex; align-items:center; gap:32px; }
        .nav-logo { display:flex; align-items:center; gap:10px; text-decoration:none; }
        .nav-wm { font-size:20px; font-weight:800; color:var(--casi-accent); letter-spacing:-0.5px; }
        .nav-tabs { display:flex; gap:4px; }
        .nav-tab { font-family:'DM Mono',monospace; font-size:11px; letter-spacing:1.5px; text-transform:uppercase; padding:7px 14px; border-radius:8px; border:none; background:none; color:var(--casi-text-muted); cursor:pointer; transition:all .2s; position:relative; }
        .nav-tab:hover { color:var(--casi-text); background:rgba(255,255,255,0.04); }
        .nav-tab.active { color:var(--casi-accent); background:rgba(var(--casi-accent-rgb),0.08); }
        .nav-badge { position:absolute; top:2px; right:2px; background:var(--casi-accent); color:var(--casi-bg); font-size:9px; font-weight:800; width:16px; height:16px; border-radius:50%; display:flex; align-items:center; justify-content:center; }
        .tnr { display:flex; align-items:center; gap:12px; }
        .live-toggle { display:flex; align-items:center; gap:8px; padding:8px 16px; border-radius:8px; border:1px solid; cursor:pointer; font-family:'Syne',sans-serif; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; transition:all .2s; }
        .lt-off { background:rgba(255,255,255,0.04); border-color:var(--casi-border); color:var(--casi-text-muted); }
        .lt-on  { background:rgba(239,68,68,0.12); border-color:rgba(239,68,68,0.35); color:#f87171; }
        .live-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
        .ld-off { background:#444; }
        .ld-on  { background:#f87171; animation:blink 1.5s infinite; }
        .btn-sm { font-family:'Syne',sans-serif; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.3px; padding:8px 16px; border-radius:8px; border:none; cursor:pointer; transition:all .2s; white-space:nowrap; }
        .b-orange  { background:var(--casi-accent); color:var(--casi-bg); }
        .b-orange:hover { filter:brightness(1.12); }
        .b-outline { background:rgba(255,255,255,0.04); color:#888; border:1px solid var(--casi-border) !important; }
        .b-outline:hover { background:rgba(255,255,255,0.08); color:var(--casi-text); }
        .b-danger  { background:rgba(248,113,113,0.08); color:#f87171; border:1px solid rgba(248,113,113,0.2) !important; }
        .b-danger:hover  { background:rgba(248,113,113,0.15); }
        .b-purple  { background:rgba(168,85,247,0.1); color:#c084fc; border:1px solid rgba(168,85,247,0.25) !important; }
        .b-purple:hover { background:rgba(168,85,247,0.18); }

        /* BEAMS BAR */
        .beams-bar { display:flex; flex-wrap:wrap; gap:8px; padding:12px 32px; border-bottom:1px solid var(--casi-surface); }
        .beam-chip { display:flex; align-items:center; gap:10px; background:var(--casi-surface); border:1px solid var(--casi-border); border-radius:10px; padding:8px 14px; cursor:pointer; transition:border-color .2s; }
        .beam-chip:hover { border-color:rgba(var(--casi-accent-rgb),0.3); }

        /* STUDIO */
        .studio-body { flex:1; display:flex; flex-direction:column; padding:20px 32px 32px; gap:16px; overflow:auto; }
        .canvas-wrap { position:relative; aspect-ratio:16/9; border-radius:12px; border:1px solid var(--casi-border); background:#080808; overflow:visible; }
        .canvas-hint { text-align:center; font-family:'DM Mono',monospace; font-size:10px; letter-spacing:2px; text-transform:uppercase; color:#1e1e1e; margin-top:10px; }

        /* ── BEAM CONTROL PANEL ── */
        .beam-ctrl { background:var(--casi-surface); border:1px solid rgba(var(--casi-accent-rgb),0.2); border-radius:12px; padding:16px 20px; display:flex; flex-direction:column; gap:14px; animation:fadeIn .2s ease; }
        @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        .dpad-btn { width:36px; height:36px; border-radius:8px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.04); color:var(--casi-text); font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .15s; user-select:none; -webkit-user-select:none; }
        .dpad-btn:hover { background:rgba(var(--casi-accent-rgb),0.12); border-color:rgba(var(--casi-accent-rgb),0.3); color:var(--casi-accent); }
        .dpad-btn:active { transform:scale(0.9); }
        .step-btn { width:30px; height:30px; border-radius:7px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.04); color:var(--casi-text); font-size:16px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .15s; }
        .step-btn:hover { background:rgba(var(--casi-accent-rgb),0.12); border-color:rgba(var(--casi-accent-rgb),0.3); color:var(--casi-accent); }
        .step-btn:active { transform:scale(0.9); }

        /* REQUESTS */
        .req-body { flex:1; padding:24px 32px; overflow:auto; max-width:800px; width:100%; margin:0 auto; }
        .sec-head { font-family:'DM Mono',monospace; font-size:10px; letter-spacing:2px; text-transform:uppercase; margin-bottom:14px; display:flex; align-items:center; gap:8px; }
        .sec-head::before { content:''; display:block; width:16px; height:1px; background:currentColor; opacity:0.5; }
        .slot-type-badge { font-family:'DM Mono',monospace; font-size:9px; letter-spacing:1.5px; padding:2px 8px; border-radius:20px; border:1px solid; }
        .badge-beam { color:var(--casi-accent2); border-color:rgba(var(--casi-accent2-rgb),0.3); background:rgba(var(--casi-accent2-rgb),0.06); }
        .badge-backdrop { color:#c084fc; border-color:rgba(192,132,252,0.3); background:rgba(168,85,247,0.06); }
        .req-card { background:var(--casi-surface); border:1px solid var(--casi-border); border-radius:14px; padding:20px; margin-bottom:10px; display:flex; gap:16px; align-items:flex-start; transition:border-color .2s; }
        .req-card:hover { border-color:rgba(255,255,255,0.12); }
        .req-thumb { width:72px; height:72px; border-radius:10px; border:1px solid var(--casi-border); overflow:hidden; background:var(--casi-bg); flex-shrink:0; display:flex; align-items:center; justify-content:center; cursor:pointer; }
        .req-thumb:hover { border-color:rgba(var(--casi-accent-rgb),0.3); }
        .req-info { flex:1; min-width:0; }
        .req-name { font-size:17px; font-weight:700; color:var(--casi-text); margin-bottom:6px; }
        .req-meta { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px; }
        .tag { font-family:'DM Mono',monospace; font-size:10px; letter-spacing:1px; padding:3px 10px; border-radius:20px; border:1px solid; }
        .t-orange { color:var(--casi-accent); background:rgba(var(--casi-accent-rgb),0.08); border-color:rgba(var(--casi-accent-rgb),0.2); }
        .t-green  { color:#4ade80; background:rgba(74,222,128,0.08); border-color:rgba(74,222,128,0.2); }
        .t-cyan   { color:var(--casi-accent2); background:rgba(var(--casi-accent2-rgb),0.08); border-color:rgba(var(--casi-accent2-rgb),0.2); }
        .t-dim    { color:rgba(var(--casi-accent-rgb),0.6); background:rgba(var(--casi-accent-rgb),0.05); border-color:rgba(var(--casi-accent-rgb),0.12); }
        .req-msg { font-size:13px; color:var(--casi-text-muted); font-style:italic; border-left:2px solid var(--casi-border); padding-left:10px; margin-top:6px; }
        .req-actions { display:flex; flex-direction:column; gap:8px; flex-shrink:0; }
        .act-btn { font-family:'Syne',sans-serif; font-weight:800; font-size:12px; text-transform:uppercase; padding:10px 18px; border-radius:8px; border:none; cursor:pointer; transition:all .2s; white-space:nowrap; }
        .c-active  { background:rgba(var(--casi-accent2-rgb),0.05); border-color:rgba(var(--casi-accent2-rgb),0.2) !important; }
        .c-queued  { background:rgba(var(--casi-accent-rgb),0.04); border-color:rgba(var(--casi-accent-rgb),0.15) !important; }
        .c-backdrop-active { background:rgba(168,85,247,0.05); border-color:rgba(168,85,247,0.2) !important; }
        .c-backdrop-queue  { background:rgba(168,85,247,0.03); border-color:rgba(168,85,247,0.12) !important; }
        .sep { width:100%; height:1px; background:var(--casi-surface); margin:24px 0; }

        /* SETTINGS */
        .set-body { flex:1; padding:24px 32px; overflow:auto; max-width:680px; width:100%; margin:0 auto; display:flex; flex-direction:column; gap:12px; }
        .set-card { background:var(--casi-surface); border:1px solid var(--casi-border); border-radius:14px; padding:24px; }
        .set-title { font-size:14px; font-weight:700; color:var(--casi-text); margin-bottom:4px; }
        .set-sub   { font-family:'DM Mono',monospace; font-size:10px; color:var(--casi-text-muted); margin-bottom:16px; }
        .code-row  { display:flex; align-items:center; gap:10px; }
        .code-box  { flex:1; background:rgba(0,0,0,0.4); border:1px solid var(--casi-border); border-radius:8px; padding:10px 14px; font-family:'DM Mono',monospace; font-size:11px; color:#888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        /* Inline profile edit */
        .pe-inp { width:100%; background:var(--casi-bg); border:1px solid var(--casi-border); border-radius:10px; padding:10px 13px; font-size:13px; color:var(--casi-text); outline:none; font-family:'Syne',sans-serif; transition:border-color .2s; box-sizing:border-box; }
        .pe-inp::placeholder { color:var(--casi-text-muted); opacity:0.5; }
        .pe-inp:focus { border-color:rgba(var(--casi-accent-rgb),0.4); }
        .pe-lbl { font-family:'DM Mono',monospace; font-size:9px; letter-spacing:1.5px; text-transform:uppercase; color:var(--casi-text-muted); display:block; margin-bottom:6px; }
        .pe-swatch { width:26px; height:26px; border-radius:50%; cursor:pointer; border:2px solid transparent; transition:all .15s; flex-shrink:0; background:none; padding:0; }
        .pe-swatch:hover { transform:scale(1.15); }
        .pe-swatch.active { border-color:#fff; box-shadow:0 0 0 2px rgba(255,255,255,0.2); }

        /* MOBILE BOTTOM NAV */
        .bot-nav { display:none; }


        @media (max-width:768px) {
          .top-nav { padding:0 12px; height:52px; }
          .nav-tabs { display:none; }
          .save-status-txt { display:none; }
          .nav-username { display:none; }
          .live-text { display:none; }
          .live-toggle { padding:8px 10px; }
          /* Hide Backdrop + Clear from top nav on mobile */
          .studio-action-hide { display:none !important; }
          /* Banner collapses to single column on mobile */
          .banner-steps { grid-template-columns: 1fr !important; }
          .studio-body { padding:12px 12px 100px; }
          .beams-bar { padding:10px 12px; }
          .req-body { padding:16px 12px 100px; }
          .set-body { padding:16px 12px 100px; }
          .req-card { flex-direction:column; }
          .req-actions { flex-direction:row; width:100%; }
          .req-actions .act-btn { flex:1; text-align:center; }
          .bot-nav {
            display:flex; position:fixed; bottom:0; left:0; right:0; z-index:90;
            background:color-mix(in srgb, var(--casi-bg) 97%, transparent); border-top:1px solid rgba(var(--casi-accent-rgb),0.08);
            padding:8px 0 env(safe-area-inset-bottom,8px);
          }
          .bot-tab { flex:1; display:flex; flex-direction:column; align-items:center; gap:3px; padding:6px 2px; border:none; background:none; cursor:pointer; position:relative; transition:color .2s; min-width:0; }
          .bot-tab.active { color:var(--casi-accent); }
          .bot-tab:not(.active) { color:#444; }
          .bot-badge { position:absolute; top:2px; right:calc(50% - 18px); background:var(--casi-accent); color:var(--casi-bg); font-size:9px; font-weight:800; width:14px; height:14px; border-radius:50%; display:flex; align-items:center; justify-content:center; }
        }
      `}</style>

      <SkinProvider skin={activeSkin} themeColor={editThemeColor || profile?.theme_color} />
      <div className="sw">

        {/* NAV */}
        <nav className="top-nav">
          <div className="tnl">
            <a href="/" className="nav-logo">
              <Logo scale={0.36} />
              <span className="nav-wm">casi</span>
            </a>
            <div className="nav-tabs">
              {(['studio', 'requests', 'chat', 'settings'] as const).map(v => (
                <button key={v} onClick={() => setView(v)} className={`nav-tab ${view === v ? 'active' : ''}`}>
                  {v}
                  {v === 'requests' && totalPending > 0 && <span className="nav-badge">{totalPending}</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="tnr">
            <span className="save-status-txt" style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 1, color: '#333' }}>{saveStatus}</span>
            <button onClick={toggleLive} disabled={togglingLive} className={`live-toggle ${profile.is_live ? 'lt-on' : 'lt-off'}`}>
              <span className={`live-dot ${profile.is_live ? 'ld-on' : 'ld-off'}`} />
              {profile.is_live ? 'Live' : 'Go Live'}
            </button>
            {view === 'studio' && (
              <>
                <button onClick={addBeam} className="btn-sm b-orange banner-add-beam-trigger">+ Beam</button>
                <button onClick={() => hasBackdrop && backdropEl ? (setSelectedSlotId(backdropEl.id), setShowInfoPanel(true)) : setShowBackdropModal(true)} className={`btn-sm ${hasBackdrop ? 'b-purple' : 'b-outline'} studio-action-hide`}>
                  {hasBackdrop ? '● Backdrop' : 'Backdrop'}
                </button>
                <button onClick={clearAll} className="btn-sm b-danger studio-action-hide">Clear</button>
              </>
            )}
            <WalletNav />
          </div>
        </nav>

        {/* MODALS */}
        {showBackdropModal && <BackdropModal onConfirm={createFullBackdrop} onClose={() => setShowBackdropModal(false)} />}
        {selectedEl && showInfoPanel && view === 'studio' && (
          <SlotInfoPanel
            el={selectedEl}
            activeBooking={activeBookings.find(b => b.element_id === selectedEl.id) || null}
            queueBookings={approvedQueued.filter(b => b.element_id === selectedEl.id).sort((a, b) => new Date(a.approved_at).getTime() - new Date(b.approved_at).getTime())}
            onClose={() => setShowInfoPanel(false)}
            onKick={kickBeam} onLockToggle={toggleLock} onDelete={deleteLayer}
            onUpdatePrice={(id, price, unit) => { updateLayer(id, { price_value: price, price_unit: unit }); setShowInfoPanel(false); }}
          />
        )}

        {/* PREVIEW MODAL */}
        {previewBooking && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}
            onClick={(e) => { if (e.target === e.currentTarget) setPreviewBooking(null); }}>
            <div style={{ background: 'var(--casi-surface)', border: '1px solid #222', borderRadius: 16, padding: 28, width: '100%', maxWidth: 520 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, color: 'var(--casi-text)' }}>Review Request</h2>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: isBackdropBooking(previewBooking) ? '#c084fc' : 'var(--casi-accent2)', marginTop: 4, letterSpacing: 1 }}>
                    {isBackdropBooking(previewBooking) ? '🖼 Full Backdrop' : '✦ Beam Slot'}
                    {slotOccupiedForPreview && <span style={{ color: 'var(--casi-accent)', marginLeft: 8 }}>— slot occupied, will queue</span>}
                  </div>
                </div>
                <button onClick={() => setPreviewBooking(null)} style={{ background: 'none', border: 'none', color: 'var(--casi-text-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
              </div>
              <div style={{ aspectRatio: '16/9', background: 'var(--casi-bg)', border: '1px solid #1c1c1c', borderRadius: 10, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                {previewBooking.image_url ? <img src={previewBooking.image_url} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} alt="" /> : <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#333' }}>No image</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                {[['From', previewBooking.viewer_name, 'var(--casi-text)'], ['Price', `$${previewBooking.price_value}/${previewBooking.price_unit}`, 'var(--casi-accent2)'], ['Duration', fmtDuration(previewBooking.duration_minutes), 'var(--casi-text)'], ['Total', `$${calcTotal(previewBooking)}`, '#4ade80']].map(([l, v, c]) => (
                  <div key={l} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #161616', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: '#444', marginBottom: 4 }}>{l}</div>
                    <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700, color: c }}>{v}</div>
                  </div>
                ))}
              </div>
              {previewBooking.message && (
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #161616', borderRadius: 8, padding: 14, marginBottom: 20 }}>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: '#444', marginBottom: 6 }}>Message</div>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, color: '#888', fontStyle: 'italic' }}>"{previewBooking.message}"</div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => denyBooking(previewBooking.id, previewBooking.payment_method)} style={{ flex: 1, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: 12, color: '#f87171', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 13, textTransform: 'uppercase', cursor: 'pointer' }}>Deny</button>
                <button
  onClick={() => approveBooking(previewBooking)}
  className="act-btn"
  disabled={!isPaymentConfirmed(previewBooking)}
  style={{
    background: !isPaymentConfirmed(previewBooking) ? 'var(--casi-border)' : slotOccupiedForPreview ? 'var(--casi-accent)' : 'var(--casi-accent2)',
    color: !isPaymentConfirmed(previewBooking) ? '#444' : 'var(--casi-bg)',
    cursor: !isPaymentConfirmed(previewBooking) ? 'not-allowed' : 'pointer',
    flex: 1, border: 'none', borderRadius: 10, padding: 12, fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 13, textTransform: 'uppercase'
  }}
>
  {!isPaymentConfirmed(previewBooking) ? 'Awaiting payment' : slotOccupiedForPreview ? 'Approve → Queue' : 'Approve → Live'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── ONBOARDING BANNER ── */}
        {showBanner && view === 'studio' && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(var(--casi-accent-rgb),0.07) 0%, rgba(var(--casi-accent2-rgb),0.05) 100%)',
            borderBottom: '1px solid rgba(var(--casi-accent-rgb),0.15)',
            padding: '0',
            position: 'relative',
          }}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--casi-accent)' }}>
                  ✦ Quick&nbsp;setup
                </span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#333' }}>— 3 steps to go live</span>
              </div>
              <button
                onClick={() => { try { localStorage.setItem('casi_onboarding_dismissed', '1'); } catch {} setShowBanner(false); }}
                style={{ background: 'none', border: 'none', color: '#333', cursor: 'pointer', fontFamily: "'DM Mono', monospace", fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, padding: '4px 8px', borderRadius: 4, transition: 'color .2s' }}
                onMouseOver={(e) => (e.currentTarget.style.color = '#888')}
                onMouseOut={(e) => (e.currentTarget.style.color = '#333')}>
                Dismiss ✕
              </button>
            </div>

            {/* Steps */}
            <div className="banner-steps" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, padding: '12px 24px 20px' }}>
              {[
                {
                  num: '01',
                  color: 'var(--casi-accent)',
                  title: 'Add a beam slot',
                  body: 'Hit + Beam above to add a slot to your canvas. Drag it where you want it on screen, then set a price.',
                  action: (
                    <button
                      onClick={async () => {
                        // Trigger addBeam — find the + Beam button and click it
                        const btn = document.querySelector('.banner-add-beam-trigger') as HTMLButtonElement;
                        if (btn) btn.click();
                      }}
                      style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--casi-accent)', border: 'none', borderRadius: 6, padding: '7px 14px', color: 'var(--casi-bg)', fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 11, textTransform: 'uppercase', cursor: 'pointer', letterSpacing: 0.3 }}>
                      + Add beam
                    </button>
                  ),
                },
                {
                  num: '02',
                  color: '#06b6d4',
                  title: 'Add OBS browser source',
                  body: 'In OBS, add a Browser Source. Paste your overlay URL from Settings. Set background to transparent.',
                  action: (
                    <button
                      onClick={() => setView('settings')}
                      style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(var(--casi-accent2-rgb),0.1)', border: '1px solid rgba(var(--casi-accent2-rgb),0.25)', borderRadius: 6, padding: '7px 14px', color: 'var(--casi-accent2)', fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 11, textTransform: 'uppercase', cursor: 'pointer', letterSpacing: 0.3 }}>
                      Get URL →
                    </button>
                  ),
                },
                {
                  num: '03',
                  color: '#4ade80',
                  title: 'Go live and share',
                  body: 'Hit Go Live, copy your viewer link, and share it in your stream chat. Viewers can now rent your slots.',
                  action: (
                    <span style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#333', letterSpacing: 0.5 }}>
                      Use the Go Live button above ↑
                    </span>
                  ),
                },
              ].map((step, i) => (
                <div key={step.num} style={{
                  padding: '16px 20px',
                  borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  display: 'flex', flexDirection: 'column',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 2, color: step.color, background: `${step.color}22`, border: `1px solid ${step.color}40`, borderRadius: 4, padding: '2px 6px' }}>{step.num}</span>
                    <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--casi-text)' }}>{step.title}</span>
                  </div>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, lineHeight: 1.6, color: 'var(--casi-text-muted)', flex: 1 }}>{step.body}</p>
                  {step.action}
                </div>
              ))}
            </div>

            {/* Progress indicator — dims steps as elements are added */}
            <div style={{ display: 'flex', gap: 4, padding: '0 24px 14px' }}>
              {[
                elements.length > 0,
                false, // OBS step — can't auto-detect
                profile?.is_live,
              ].map((done, i) => (
                <div key={i} style={{ height: 2, flex: 1, borderRadius: 1, background: done ? 'var(--casi-accent)' : 'var(--casi-border)', transition: 'background .4s' }} />
              ))}
            </div>
          </div>
        )}

        {/* ACTIVE BEAMS BAR */}
        {activeBookings.length > 0 && view === 'studio' && (
          <div className="beams-bar">
            {activeBookings.map(booking => {
              const queueForSlot = approvedQueued.filter(b => b.element_id === booking.element_id);
              const isBackdrop = isBackdropBooking(booking);
              return (
                <div key={booking.id} className="beam-chip" onClick={() => setSelectedSlotId(booking.element_id)}>
                  {booking.image_url && <img src={booking.image_url} style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 6 }} alt="" />}
                  <div>
                    <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--casi-text)' }}>{booking.viewer_name}</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: isBackdrop ? 'rgba(192,132,252,0.6)' : 'rgba(var(--casi-accent2-rgb),0.6)', letterSpacing: 1 }}>
                      {isBackdrop ? '🖼 backdrop' : '✦ beam'}{queueForSlot.length > 0 ? ` · +${queueForSlot.length} queued` : ''}
                    </div>
                  </div>
                  <BeamTimer booking={booking} onExpire={expireBooking} />
                </div>
              );
            })}
          </div>
        )}

        {/* ── STUDIO ── */}
        {view === 'studio' && (
          <div className="studio-body">

            {/* Canvas */}
            <div className="canvas-wrap" ref={setMonitorRef}
              onClick={(e) => {
                if ((e.target as HTMLElement).classList.contains('canvas-wrap')) {
                  setSelectedSlotId(null);
                  setShowInfoPanel(false);
                }
              }}>
              {dimensions.width > 0 && elements.map((el) => {
                const isSelected = selectedSlotId === el.id;
                return (
                  <Rnd key={el.id}
                    size={{ width: el.is_background ? '100%' : `${(el.width / 100) * dimensions.width}px`, height: el.is_background ? '100%' : `${(el.height / 100) * dimensions.height}px` }}
                    position={{ x: el.is_background ? 0 : (el.pos_x / 100) * dimensions.width, y: el.is_background ? 0 : (el.pos_y / 100) * dimensions.height }}
                    onDragStart={(_e, d) => {
                      dragStartPos.current = { x: d.x, y: d.y };
                      isDragging.current = false;
                    }}
                    onDrag={(_e, d) => {
                      if (dragStartPos.current) {
                        const dist = Math.abs(d.x - dragStartPos.current.x) + Math.abs(d.y - dragStartPos.current.y);
                        if (dist > 6) isDragging.current = true;
                      }
                    }}
                    onDragStop={(_e, d) => {
                      if (!isDragging.current) {
                        // It was a tap — select beam, show sliders (not info panel)
                        if (!el.is_background) {
                          setSelectedSlotId(el.id);
                          setShowInfoPanel(false);
                        }
                      } else {
                        updateLayer(el.id, { pos_x: (d.x / dimensions.width) * 100, pos_y: (d.y / dimensions.height) * 100 });
                      }
                      isDragging.current = false;
                    }}
                    onResizeStop={(_e, _dir, ref, _delta, pos) => { updateLayer(el.id, { width: (ref.offsetWidth / dimensions.width) * 100, height: (ref.offsetHeight / dimensions.height) * 100, pos_x: (pos.x / dimensions.width) * 100, pos_y: (pos.y / dimensions.height) * 100 }); }}
                    disableDragging={el.is_background} enableResizing={!el.is_background} bounds="parent"
                    style={{ zIndex: el.is_background ? 0 : (isSelected ? 40 : 30) }}>
                    <div
                      style={{ position: 'relative', width: '100%', height: '100%', border: el.is_background ? 'none' : isSelected ? '2px solid var(--casi-accent)' : '1.5px solid rgba(var(--casi-accent-rgb),0.3)', borderRadius: el.is_background ? 0 : 6, opacity: el.locked ? 0.7 : 1 }}>
                      {!el.image_url ? (
                        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: `1.5px dashed ${el.locked ? 'rgba(248,113,113,0.3)' : el.is_background ? 'rgba(168,85,247,0.35)' : 'rgba(var(--casi-accent-rgb),0.35)'}`, borderRadius: el.is_background ? 12 : 6, background: el.locked ? 'rgba(248,113,113,0.04)' : el.is_background ? 'rgba(168,85,247,0.04)' : 'rgba(var(--casi-accent-rgb),0.04)' }}>
                          {el.locked && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(248,113,113,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>🔒 Locked</span>}
                          <span style={{ fontSize: el.is_background ? 24 : 16, marginBottom: 4 }}>{el.is_background ? '🖼️' : '✦'}</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: el.locked ? 'rgba(248,113,113,0.5)' : el.is_background ? 'rgba(168,85,247,0.6)' : 'rgba(var(--casi-accent-rgb),0.6)' }}>
                            {el.locked ? 'No requests' : el.is_background ? 'Backdrop' : 'Beam'}
                          </span>
                          {el.price_value > 0 && !el.locked && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 500, marginTop: 3, color: el.is_background ? 'rgba(168,85,247,0.9)' : 'var(--casi-accent)' }}>${el.price_value}/{el.price_unit}</span>}
                        </div>
                      ) : (
                        <img src={el.image_url} style={{ width: '100%', height: '100%', objectFit: el.is_background ? 'cover' : 'fill', pointerEvents: 'none' }} alt="" />
                      )}
                      {/* Selection glow */}
                      {isSelected && !el.is_background && (
                        <div style={{ position: 'absolute', top: -2, left: -2, right: -2, bottom: -2, border: '2px solid var(--casi-accent)', borderRadius: 8, pointerEvents: 'none', boxShadow: '0 0 0 3px rgba(var(--casi-accent-rgb),0.15)' }} />
                      )}
                      {/* Delete button — large touch target */}
                      {!el.is_background && (
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); deleteLayer(el.id); }}
                          style={{ position: 'absolute', top: 0, right: 0, width: 32, height: 32, background: 'rgba(239,68,68,0.9)', border: 'none', borderRadius: '0 6px 0 6px', color: 'white', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
                          ✕
                        </button>
                      )}
                    </div>
                  </Rnd>
                );
              })}
            </div>

            {/* Beam control panel — movement + price + live info, all inline */}
            {selectedEl && !selectedEl.is_background && (
              <BeamCtrlPanel
                el={selectedEl}
                activeBooking={activeBookings.find(b => b.element_id === selectedEl.id) || null}
                updateSlider={updateSlider}
                updateLayer={updateLayer}
                toggleLock={toggleLock}
                deleteLayer={deleteLayer}
                kickBeam={kickBeam}
                onDone={() => setSelectedSlotId(null)}
              />
            )}

            <div className="canvas-hint">
              {selectedEl && !selectedEl.is_background
                ? 'Drag beam to move · Use arrows to nudge · Edit price inline'
                : 'Tap a beam to select · Drag to move · Resize from corners'}
            </div>
          </div>
        )}

        {/* ── REQUESTS — separated by beam vs backdrop ── */}
        {view === 'requests' && (
          <div className="req-body">

            {/* BEAMS SECTION */}
            {(activeBeams.length > 0 || approvedBeams.length > 0 || pendingBeams.length > 0 || queuedBeams.length > 0) && (
              <div style={{ marginBottom: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 800, color: 'var(--casi-text)', letterSpacing: -0.5 }}>Beam Slots</div>
                  <span className="slot-type-badge badge-beam">✦ Beams</span>
                </div>

                {activeBeams.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div className="sec-head" style={{ color: 'var(--casi-accent2)' }}>● Live — {activeBeams.length}</div>
                    {activeBeams.map(booking => {
                      const queueForSlot = approvedBeams.filter(b => b.element_id === booking.element_id).sort((a, b) => new Date(a.approved_at).getTime() - new Date(b.approved_at).getTime());
                      return (
                        <div key={booking.id} className="req-card c-active">
                          <div style={{ width: 64, height: 64, borderRadius: 10, border: '1px solid rgba(var(--casi-accent2-rgb),0.2)', overflow: 'hidden', background: 'var(--casi-bg)', flexShrink: 0 }}>
                            {booking.image_url && <img src={booking.image_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="" />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--casi-text)', marginBottom: 4 }}>{booking.viewer_name}</div>
                            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--casi-text-muted)', marginBottom: 6 }}>${booking.price_value}/{booking.price_unit} · {fmtDuration(booking.duration_minutes)}</div>
                            {booking.message && <div className="req-msg">"{booking.message}"</div>}
                            {queueForSlot.length > 0 && (
                              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                {queueForSlot.map((next, idx) => (
                                  <div key={next.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(var(--casi-accent-rgb),0.4)', minWidth: 20 }}>#{idx + 1}</span>
                                    <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, color: 'rgba(var(--casi-accent-rgb),0.7)' }}>{next.viewer_name}</span>
                                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#444' }}>{idx === 0 ? '— auto-starts next' : `pos #${idx + 1}`}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                            <BeamTimer booking={booking} onExpire={expireBooking} />
                            <button onClick={() => kickBeam(booking)} style={{ background: 'none', border: 'none', fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(248,113,113,0.4)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1 }}>End early</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {approvedBeams.length > 0 && (
  <div style={{ marginBottom: 20 }}>
    <div className="sec-head" style={{ color: 'var(--casi-accent)' }}>⏳ Approved queue — {approvedBeams.length}</div>
    {approvedBeams.map(booking => (
      <div key={booking.id} className="req-card c-queued">
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, fontWeight: 500, color: 'rgba(var(--casi-accent-rgb),0.3)', minWidth: 28 }}>#{getQueuePosition(booking)}</span>
        <div style={{ width: 52, height: 52, borderRadius: 8, border: '1px solid rgba(var(--casi-accent-rgb),0.15)', overflow: 'hidden', background: 'var(--casi-bg)', flexShrink: 0 }}>
          {booking.image_url && <img src={booking.image_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="" />}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--casi-text)', marginBottom: 3 }}>{booking.viewer_name}</div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--casi-text-muted)' }}>${booking.price_value}/{booking.price_unit} · {fmtDuration(booking.duration_minutes)}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(var(--casi-accent-rgb),0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>
            {getQueuePosition(booking) === 1 ? 'Next up' : `Queue #${getQueuePosition(booking)}`}
          </span>
          <button onClick={async () => {
  // End current active booking on this slot first
  const current = activeBookings.find(b => b.element_id === booking.element_id);
  if (current) {
    const { data: { session: sess } } = await supabase.auth.getSession();
    await fetch('/api/stripe/end-early', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sess?.access_token}`,
      },
      body: JSON.stringify({ booking_id: current.id }),
    });
  }
  // Start this booking now
  await supabase
    .from('bookings')
    .update({ status: 'active', started_at: new Date().toISOString() })
    .eq('id', booking.id);
  await supabase
    .from('overlay_elements')
    .update({ image_url: booking.image_url })
    .eq('id', booking.element_id);
  if (profile?.id) loadBookings(profile.id);
}}
  style={{ background: 'none', border: 'none', fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(var(--casi-accent2-rgb),0.6)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1, padding: 0 }}>
  Play Now
</button>
<button onClick={() => denyBooking(booking.id)}
  style={{ background: 'none', border: 'none', fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(248,113,113,0.4)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1, padding: 0 }}>
  Remove
</button>
        </div>
      </div>
    ))}
  </div>
)}

                {pendingBeams.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div className="sec-head" style={{ color: 'var(--casi-text-muted)' }}>Pending — {pendingBeams.length}</div>
                    {pendingBeams.map(booking => (
                      <div key={booking.id} className="req-card">
                        <button className="req-thumb" onClick={() => setPreviewBooking(booking)}>
                          {booking.image_url ? <img src={booking.image_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="" /> : <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#444' }}>No img</span>}
                        </button>
                        <div className="req-info">
                          <div className="req-name">{booking.viewer_name}</div>
                          <div className="req-meta">
                            <span className="tag t-orange">${booking.price_value}/{booking.price_unit}</span>
                            <span className="tag t-green">${calcTotal(booking)} total</span>
                            <span className="tag t-cyan">{fmtDuration(booking.duration_minutes)}</span>
                          </div>
                          {booking.message && <div className="req-msg">"{booking.message}"</div>}
                        </div>
                        <div className="req-actions">
                          <button onClick={() => approveBooking(booking)} className="act-btn"
                            disabled={!isPaymentConfirmed(booking)}
                            style={{ background: !isPaymentConfirmed(booking) ? 'var(--casi-border)' : activeBookings.some(b => b.element_id === booking.element_id) ? 'var(--casi-accent)' : 'var(--casi-accent2)', color: !isPaymentConfirmed(booking) ? '#444' : 'var(--casi-bg)', cursor: !isPaymentConfirmed(booking) ? 'not-allowed' : 'pointer' }}>
                            {!isPaymentConfirmed(booking) ? 'Awaiting payment' : activeBookings.some(b => b.element_id === booking.element_id) ? 'Queue' : 'Approve'}
                          </button>
                          <button onClick={() => denyBooking(booking.id, booking.payment_method)} className="act-btn b-danger" style={{ border: '1px solid rgba(248,113,113,0.2)' }}>Deny</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {queuedBeams.length > 0 && (
                  <div>
                    <div className="sec-head" style={{ color: 'rgba(var(--casi-accent-rgb),0.5)' }}>Wants next beam — {queuedBeams.length}</div>
                    {queuedBeams.map(booking => (
                      <div key={booking.id} className="req-card" style={{ borderColor: 'rgba(var(--casi-accent-rgb),0.12)', background: 'rgba(245,130,32,0.03)' }}>
                        <button className="req-thumb" onClick={() => setPreviewBooking(booking)}>
                          {booking.image_url ? <img src={booking.image_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="" /> : <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#444' }}>No img</span>}
                        </button>
                        <div className="req-info">
                          <div className="req-name">{booking.viewer_name}</div>
                          <div className="req-meta">
                            <span className="tag t-dim">${booking.price_value}/{booking.price_unit}</span>
                            <span className="tag t-green">${calcTotal(booking)} total</span>
                          </div>
                          {booking.message && <div className="req-msg">"{booking.message}"</div>}
                        </div>
                        <div className="req-actions">
                          <button onClick={() => approveBooking(booking)} className="act-btn"
  disabled={!isPaymentConfirmed(booking)}
  style={{ background: !isPaymentConfirmed(booking) ? 'var(--casi-border)' : 'var(--casi-accent)', color: !isPaymentConfirmed(booking) ? '#444' : 'var(--casi-bg)', cursor: !isPaymentConfirmed(booking) ? 'not-allowed' : 'pointer' }}>
  {!isPaymentConfirmed(booking) ? 'Awaiting payment' : 'Queue'}
</button>
                          <button onClick={() => denyBooking(booking.id, booking.payment_method)} className="act-btn b-danger" style={{ border: '1px solid rgba(248,113,113,0.2)' }}>Deny</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Separator */}
            {(activeBeams.length > 0 || pendingBeams.length > 0 || queuedBeams.length > 0) &&
             (activeBackdrop.length > 0 || pendingBackdrop.length > 0 || queuedBackdrop.length > 0) && (
              <div className="sep" />
            )}

            {/* BACKDROP SECTION */}
            {(activeBackdrop.length > 0 || approvedBackdrop.length > 0 || pendingBackdrop.length > 0 || queuedBackdrop.length > 0) && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 800, color: 'var(--casi-text)', letterSpacing: -0.5 }}>Full Backdrop</div>
                  <span className="slot-type-badge badge-backdrop">🖼 Backdrop</span>
                </div>

                {activeBackdrop.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div className="sec-head" style={{ color: '#c084fc' }}>● Live</div>
                    {activeBackdrop.map(booking => (
                      <div key={booking.id} className="req-card c-backdrop-active">
                        <div style={{ width: 64, height: 64, borderRadius: 10, border: '1px solid rgba(192,132,252,0.2)', overflow: 'hidden', background: 'var(--casi-bg)', flexShrink: 0 }}>
                          {booking.image_url && <img src={booking.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--casi-text)', marginBottom: 4 }}>{booking.viewer_name}</div>
                          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--casi-text-muted)', marginBottom: 6 }}>${booking.price_value}/{booking.price_unit} · {fmtDuration(booking.duration_minutes)}</div>
                          {booking.message && <div className="req-msg">"{booking.message}"</div>}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                          <BeamTimer booking={booking} onExpire={expireBooking} />
                          <button onClick={() => kickBeam(booking)} style={{ background: 'none', border: 'none', fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(248,113,113,0.4)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1 }}>End early</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {approvedBackdrop.length > 0 && (
  <div style={{ marginBottom: 20 }}>
    <div className="sec-head" style={{ color: '#c084fc', opacity: 0.7 }}>⏳ Approved queue — {approvedBackdrop.length}</div>
    {approvedBackdrop.map(booking => (
      <div key={booking.id} className="req-card c-backdrop-queue">
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, fontWeight: 500, color: 'rgba(192,132,252,0.3)', minWidth: 28 }}>#{getQueuePosition(booking)}</span>
        <div style={{ width: 52, height: 52, borderRadius: 8, border: '1px solid rgba(192,132,252,0.15)', overflow: 'hidden', background: 'var(--casi-bg)', flexShrink: 0 }}>
          {booking.image_url && <img src={booking.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--casi-text)', marginBottom: 3 }}>{booking.viewer_name}</div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--casi-text-muted)' }}>${booking.price_value}/{booking.price_unit} · {fmtDuration(booking.duration_minutes)}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(192,132,252,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>
            {getQueuePosition(booking) === 1 ? 'Next up' : `Queue #${getQueuePosition(booking)}`}
          </span>
          <button onClick={async () => {
  // End current active booking on this slot first
  const current = activeBookings.find(b => b.element_id === booking.element_id);
  if (current) {
    const { data: { session: sess } } = await supabase.auth.getSession();
    await fetch('/api/stripe/end-early', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sess?.access_token}`,
      },
      body: JSON.stringify({ booking_id: current.id }),
    });
  }
  // Start this booking now
  await supabase
    .from('bookings')
    .update({ status: 'active', started_at: new Date().toISOString() })
    .eq('id', booking.id);
  await supabase
    .from('overlay_elements')
    .update({ image_url: booking.image_url })
    .eq('id', booking.element_id);
  if (profile?.id) loadBookings(profile.id);
}}
  style={{ background: 'none', border: 'none', fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(var(--casi-accent2-rgb),0.6)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1, padding: 0 }}>
  Play Now
</button>
<button onClick={() => denyBooking(booking.id)}
  style={{ background: 'none', border: 'none', fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(248,113,113,0.4)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1, padding: 0 }}>
  Remove
</button>
        </div>
      </div>
    ))}
  </div>
)}

                {pendingBackdrop.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div className="sec-head" style={{ color: 'var(--casi-text-muted)' }}>Pending — {pendingBackdrop.length}</div>
                    {pendingBackdrop.map(booking => (
                      <div key={booking.id} className="req-card">
                        <button className="req-thumb" onClick={() => setPreviewBooking(booking)}>
                          {booking.image_url ? <img src={booking.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#444' }}>No img</span>}
                        </button>
                        <div className="req-info">
                          <div className="req-name">{booking.viewer_name}</div>
                          <div className="req-meta">
                            <span className="tag" style={{ color: '#c084fc', background: 'rgba(168,85,247,0.08)', borderColor: 'rgba(168,85,247,0.2)' }}>${booking.price_value}/{booking.price_unit}</span>
                            <span className="tag t-green">${calcTotal(booking)} total</span>
                            <span className="tag" style={{ color: '#888', background: 'rgba(255,255,255,0.04)', borderColor: '#1c1c1c' }}>{fmtDuration(booking.duration_minutes)}</span>
                          </div>
                          {booking.message && <div className="req-msg">"{booking.message}"</div>}
                        </div>
                        <div className="req-actions">
                          <button onClick={() => approveBooking(booking)} className="act-btn"
                            disabled={!isPaymentConfirmed(booking)}
                            style={{ background: !isPaymentConfirmed(booking) ? 'var(--casi-border)' : '#c084fc', color: !isPaymentConfirmed(booking) ? '#444' : 'var(--casi-bg)', cursor: !isPaymentConfirmed(booking) ? 'not-allowed' : 'pointer' }}>
                            {!isPaymentConfirmed(booking) ? 'Awaiting payment' : activeBookings.some(b => b.element_id === booking.element_id) ? 'Queue' : 'Approve'}
                          </button>
                          <button onClick={() => denyBooking(booking.id, booking.payment_method)} className="act-btn b-danger" style={{ border: '1px solid rgba(248,113,113,0.2)' }}>Deny</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {queuedBackdrop.length > 0 && (
                  <div>
                    <div className="sec-head" style={{ color: 'rgba(192,132,252,0.5)' }}>Wants next backdrop — {queuedBackdrop.length}</div>
                    {queuedBackdrop.map(booking => (
                      <div key={booking.id} className="req-card c-backdrop-queue">
                        <button className="req-thumb" onClick={() => setPreviewBooking(booking)}>
                          {booking.image_url ? <img src={booking.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#444' }}>No img</span>}
                        </button>
                        <div className="req-info">
                          <div className="req-name">{booking.viewer_name}</div>
                          <div className="req-meta">
                            <span className="tag" style={{ color: 'rgba(192,132,252,0.6)', background: 'rgba(168,85,247,0.05)', borderColor: 'rgba(168,85,247,0.12)' }}>${booking.price_value}/{booking.price_unit}</span>
                            <span className="tag t-green">${calcTotal(booking)} total</span>
                          </div>
                        </div>
                        <div className="req-actions">
                          <button onClick={() => approveBooking(booking)} className="act-btn"
  disabled={!isPaymentConfirmed(booking)}
  style={{ background: !isPaymentConfirmed(booking) ? 'var(--casi-border)' : '#c084fc', color: !isPaymentConfirmed(booking) ? '#444' : 'var(--casi-bg)', cursor: !isPaymentConfirmed(booking) ? 'not-allowed' : 'pointer' }}>
  {!isPaymentConfirmed(booking) ? 'Awaiting payment' : 'Queue'}
</button>
                          <button onClick={() => denyBooking(booking.id, booking.payment_method)} className="act-btn b-danger" style={{ border: '1px solid rgba(248,113,113,0.2)' }}>Deny</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {totalPending === 0 && activeBookings.length === 0 && approvedQueued.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', border: '1px dashed #1c1c1c', borderRadius: 14, textAlign: 'center' }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#333' }}>No requests yet</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#222', marginTop: 8 }}>Share your overlay link to get started</div>
              </div>
            )}
          </div>
        )}

        {/* ── CHAT ── */}
        {view === 'chat' && profile?.id && (
          <div className="set-body">
            <div className="set-card">
              <div className="set-title">Live chat</div>
              <div className="set-sub" style={{ marginBottom: 12 }}>
                Viewer messages update in real time. Click × to delete.
              </div>
              <ChatPanel profileId={profile.id} viewerName={null} isAdmin variant="compact" />
            </div>
          </div>
        )}

        {/* ── SETTINGS ── */}
        {view === 'settings' && (
          <div className="set-body">

            {/* ── SKIN PICKER ── */}
            <div className="set-card">
              <div className="set-title">Studio skin</div>
              <div className="set-sub">Changes the colour palette for your admin view and viewer overlay</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {SKINS.map(s => {
                  const isActive = (activeSkin ?? 'casi-dark') === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setActiveSkin(s.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: isActive ? `rgba(var(--casi-accent-rgb),0.1)` : 'rgba(255,255,255,0.03)',
                        border: isActive ? '1px solid rgba(var(--casi-accent-rgb),0.4)' : '1px solid var(--casi-border)',
                        borderRadius: 10, padding: '8px 12px', cursor: 'pointer', transition: 'all .15s',
                      }}
                    >
                      {/* Mini palette swatch */}
                      <div style={{ display: 'flex', gap: 2 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: s.accent }} />
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: s.accent2 }} />
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: s.bg, border: '1px solid rgba(255,255,255,0.1)' }} />
                      </div>
                      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: isActive ? 'var(--casi-accent)' : 'var(--casi-text-muted)', letterSpacing: 0.5 }}>{s.name}</span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={async () => {
                  if (!profile || savingSkin) return;
                  setSavingSkin(true);
                  await supabase.from('profiles').update({ skin: activeSkin }).eq('id', profile.id);
                  setProfile((p: any) => ({ ...p, skin: activeSkin }));
                  setSavingSkin(false);
                }}
                disabled={savingSkin || (activeSkin ?? 'casi-dark') === (profile?.skin ?? 'casi-dark')}
                className="btn-sm b-orange"
                style={{ minWidth: 120, opacity: savingSkin || (activeSkin ?? 'casi-dark') === (profile?.skin ?? 'casi-dark') ? 0.5 : 1 }}
              >
                {savingSkin ? 'Saving…' : 'Save skin'}
              </button>
            </div>

            <div className="set-card">
              {/* ── Profile summary row ── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', border: `1px solid rgba(var(--casi-accent-rgb),0.25)`, overflow: 'hidden', background: 'var(--casi-bg)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                  {(editAvatarValid && editAvatar) || profile.avatar_url
                    ? <img src={editAvatarValid && editAvatar ? editAvatar : profile.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    : '👤'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--casi-text)' }}>
                    {editOpen ? (editName || profile.username) : (profile.display_name || profile.username)}
                  </div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--casi-text-muted)' }}>@{profile.username}</div>
                  {!editOpen && profile.bio && <div style={{ fontSize: 12, color: 'var(--casi-text-muted)', marginTop: 4 }}>{profile.bio}</div>}
                </div>
                <button
                  onClick={() => setEditOpen(o => !o)}
                  style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: 'var(--casi-accent)', background: editOpen ? 'rgba(var(--casi-accent-rgb),0.08)' : 'none', border: editOpen ? '1px solid rgba(var(--casi-accent-rgb),0.2)' : '1px solid transparent', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', letterSpacing: 1, textTransform: 'uppercase', flexShrink: 0, transition: 'all .15s' }}>
                  {editOpen ? '✕ Close' : 'Edit ↓'}
                </button>
              </div>

              {/* ── Inline edit form ── */}
              {editOpen && (
                <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--casi-border)', display: 'flex', flexDirection: 'column', gap: 14 }}>

                  {/* Display name */}
                  <div>
                    <label className="pe-lbl">Display name</label>
                    <input type="text" value={editName} maxLength={32} className="pe-inp"
                      placeholder={profile.username}
                      onChange={(e) => setEditName(e.target.value)} />
                  </div>

                  {/* Bio */}
                  <div>
                    <label className="pe-lbl">Bio</label>
                    <textarea value={editBio} maxLength={160} rows={3} className="pe-inp"
                      style={{ resize: 'none', lineHeight: 1.5 }}
                      placeholder="What do you stream?"
                      onChange={(e) => setEditBio(e.target.value)} />
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: 'var(--casi-text-muted)', textAlign: 'right', marginTop: 2 }}>{editBio.length}/160</div>
                  </div>

                  {/* Avatar */}
                  <div>
                    <label className="pe-lbl">Avatar URL</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', background: 'var(--casi-bg)', border: '1px solid var(--casi-border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                        {editAvatarValid && editAvatar ? <img src={editAvatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : '👤'}
                      </div>
                      <input type="text" value={editAvatar} className="pe-inp" style={{ flex: 1 }}
                        placeholder="https://your-image.png"
                        onChange={(e) => { setEditAvatar(e.target.value); setEditAvatarValid(false); }} />
                      {editAvatar && <img src={editAvatar} style={{ display: 'none' }} alt=""
                        onLoad={() => setEditAvatarValid(true)} onError={() => setEditAvatarValid(false)} />}
                    </div>
                    {editAvatar && (
                      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, marginTop: 4, color: editAvatarValid ? '#4ade80' : '#f87171' }}>
                        {editAvatarValid ? '✓ Image loaded' : 'Image not loading — check URL'}
                      </div>
                    )}
                  </div>

                  {/* Silhouette preview background */}
                  <div>
                    <label className="pe-lbl">
                      Preview background
                      <span style={{ fontFamily: 'inherit', letterSpacing: 0, textTransform: 'none', color: 'var(--casi-text-muted)', opacity: 0.6 }}> — OBS screenshot shown to viewers</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--casi-bg)', border: '1px solid var(--casi-border)', borderRadius: 10, padding: '10px 14px', cursor: uploadingPreviewBg ? 'wait' : 'pointer' }}>
                      <input type="file" accept="image/*" style={{ display: 'none' }}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePreviewBgUpload(f); }} />
                      {previewBgUrl
                        ? <img src={previewBgUrl} style={{ width: 48, height: 27, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--casi-border)', flexShrink: 0 }} alt="" />
                        : <div style={{ width: 48, height: 27, borderRadius: 4, border: '1px dashed var(--casi-border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>🖥</div>
                      }
                      <div>
                        <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 12, color: previewBgUrl ? '#4ade80' : 'var(--casi-text)', marginBottom: 2 }}>
                          {uploadingPreviewBg ? 'Uploading…' : previewBgUrl ? '✓ Preview set' : 'Upload screenshot'}
                        </div>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--casi-text-muted)' }}>
                          {previewBgUrl ? 'Click to replace' : 'jpg · png · max 5 MB'}
                        </div>
                      </div>
                    </label>
                  </div>

                  {/* Accent color */}
                  <div>
                    <label className="pe-lbl">Accent color <span style={{ fontFamily: 'inherit', letterSpacing: 0, textTransform: 'none', color: 'var(--casi-text-muted)', opacity: 0.6 }}>— overlays skin accent</span></label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
                      {THEME_PRESETS.map(p => (
                        <button key={p.color} type="button" title={p.name}
                          className={`pe-swatch${editThemeColor === p.color ? ' active' : ''}`}
                          style={{ background: p.color }}
                          onClick={() => { setEditThemeColor(p.color); setEditCustomColor(''); }} />
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: editThemeColor, border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0, boxShadow: `0 0 10px ${editThemeColor}50` }} />
                      <input type="text" value={editCustomColor || editThemeColor} placeholder="#F58220" maxLength={7}
                        className="pe-inp" style={{ flex: 1, fontFamily: "'DM Mono',monospace", fontSize: 12 }}
                        onChange={(e) => {
                          const v = e.target.value;
                          setEditCustomColor(v);
                          if (/^#[0-9A-Fa-f]{6}$/.test(v)) setEditThemeColor(v);
                        }} />
                    </div>
                    <div style={{ height: 3, borderRadius: 2, background: `linear-gradient(90deg, ${editThemeColor}, ${editThemeColor}40)`, marginTop: 10 }} />
                  </div>

                  {/* Stripe */}
                  <div>
                    <label className="pe-lbl">Payments — Stripe</label>
                    <div style={{ background: 'var(--casi-bg)', border: '1px solid var(--casi-border)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: stripeConnected ? '#4ade80' : 'var(--casi-text)', marginBottom: 2 }}>
                          {stripeConnected ? '✓ Connected to Stripe' : 'Connect Stripe to get paid'}
                        </div>
                        <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: 'var(--casi-text-muted)' }}>
                          {stripeConnected ? 'Viewers can pay for beam slots' : 'Required to accept card payments'}
                        </div>
                      </div>
                      <button type="button" onClick={handleStripeConnect} disabled={stripeLoading}
                        style={{ background: stripeConnected ? 'rgba(74,222,128,0.1)' : 'var(--casi-accent)', border: stripeConnected ? '1px solid rgba(74,222,128,0.25)' : 'none', borderRadius: 8, padding: '8px 14px', fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 11, textTransform: 'uppercase', color: stripeConnected ? '#4ade80' : 'var(--casi-bg)', cursor: stripeLoading ? 'wait' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {stripeLoading ? 'Redirecting…' : stripeConnected ? '↗ Manage' : 'Connect →'}
                      </button>
                    </div>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: 'var(--casi-text-muted)', marginTop: 5 }}>Casi takes a 5% platform fee. Payouts go directly to your bank.</div>
                  </div>

                  {/* Solana wallet */}
                  <div>
                    <label className="pe-lbl">Solana wallet <span style={{ letterSpacing: 0, textTransform: 'none', opacity: 0.6 }}>— USDC streaming payments</span></label>
                    <div style={{ background: 'var(--casi-bg)', border: '1px solid var(--casi-border)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: solanaWallet ? '#9945FF' : 'var(--casi-text)', marginBottom: 2 }}>
                          {solanaWallet ? `◎ ${solanaWallet.slice(0,6)}…${solanaWallet.slice(-4)}` : 'No wallet linked'}
                        </div>
                        <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: 'var(--casi-text-muted)' }}>
                          {solanaWallet ? 'Viewers can pay via Streamflow USDC' : 'Optional — Stripe works without this'}
                        </div>
                      </div>
                      {walletConnected && publicKey ? (
                        <button type="button" onClick={handleSaveWallet} disabled={savingWallet}
                          style={{ background: walletSaved ? 'rgba(74,222,128,0.1)' : 'rgba(153,69,255,0.15)', border: walletSaved ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(153,69,255,0.35)', borderRadius: 8, padding: '8px 14px', fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 11, textTransform: 'uppercase', color: walletSaved ? '#4ade80' : '#9945FF', cursor: savingWallet ? 'wait' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {savingWallet ? 'Saving…' : walletSaved ? '✓ Saved!' : `Save ${publicKey.toBase58().slice(0,4)}…${publicKey.toBase58().slice(-4)}`}
                        </button>
                      ) : (
                        <button type="button" onClick={openWalletModal} disabled={walletConnecting}
                          style={{ background: 'rgba(153,69,255,0.1)', border: '1px solid rgba(153,69,255,0.3)', borderRadius: 8, padding: '8px 14px', fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 11, textTransform: 'uppercase', color: '#9945FF', cursor: walletConnecting ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0, opacity: walletConnecting ? 0.6 : 1 }}>
                          {walletConnecting ? 'Connecting…' : 'Connect Wallet'}
                        </button>
                      )}
                    </div>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: 'var(--casi-text-muted)', marginTop: 5 }}>Connect your wallet then click Save to link it to your profile.</div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, paddingTop: 2 }}>
                    <button type="button" onClick={() => {
                      // Reset to current saved values
                      setEditName(profile.display_name || profile.username || '');
                      setEditBio(profile.bio || '');
                      setEditAvatar(profile.avatar_url || '');
                      setEditAvatarValid(!!profile.avatar_url);
                      setEditThemeColor(profile.theme_color || '#F58220');
                      setEditCustomColor('');
                      setEditOpen(false);
                    }} style={{ flex: 1, padding: '10px 0', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--casi-border)', borderRadius: 10, fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 12, color: 'var(--casi-text-muted)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Cancel
                    </button>
                    <button type="button" disabled={editSaving}
                      onClick={async () => {
                        if (!profile) return;
                        setEditSaving(true);
                        await supabase.from('profiles').update({
                          display_name: editName || profile.username,
                          bio: editBio || null,
                          avatar_url: editAvatarValid ? editAvatar : null,
                          theme_color: editThemeColor,
                        }).eq('id', profile.id);
                        setProfile((p: any) => ({ ...p,
                          display_name: editName || profile.username,
                          bio: editBio || null,
                          avatar_url: editAvatarValid ? editAvatar : null,
                          theme_color: editThemeColor,
                        }));
                        setEditSaving(false);
                        setEditSaved(true);
                        setEditOpen(false);
                        setTimeout(() => setEditSaved(false), 2000);
                      }}
                      style={{ flex: 2, padding: '10px 0', background: editSaved ? '#4ade80' : 'var(--casi-accent)', border: 'none', borderRadius: 10, fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 12, color: 'var(--casi-bg)', cursor: editSaving ? 'not-allowed' : 'pointer', textTransform: 'uppercase', letterSpacing: 0.5, opacity: editSaving ? 0.7 : 1 }}>
                      {editSaving ? 'Saving…' : 'Save profile'}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="set-card">
              <div className="set-title">Viewer overlay</div>
              <div className="set-sub">Share with your audience</div>
              <div className="code-row">
                <div className="code-box">{origin}/overlay?s={profile.username}</div>
                <button onClick={() => copyUrl(`${origin}/overlay?s=${profile.username}`, 'viewer')} className="btn-sm b-outline" style={{ border: '1px solid #222' }}>
                  {copiedUrl === 'viewer' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="set-card">
              <div className="set-title">OBS Setup</div>
              <div className="set-sub">Add two browser sources in OBS in this order</div>
              <div style={{ marginBottom: 16, borderRadius: 10, border: '1px solid #161616', overflow: 'hidden' }}>
                {[['TOP', 'Casi Beams', '#06b6d4', 'floating overlay, transparent bg'], ['MID', 'Your Camera', '#444', 'with chroma key / bg removal'], ['BTM', 'Casi Backdrop', '#c084fc', 'full screen, transparent bg']].map(([pos, name, color, desc]) => (
                  <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid #0d0d0d', background: 'rgba(255,255,255,0.02)' }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color, background: `${color}15`, border: `1px solid ${color}30`, borderRadius: 4, padding: '2px 7px', letterSpacing: 1, flexShrink: 0 }}>{pos}</span>
                    <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: 13, color: 'var(--casi-text)' }}>{name}</span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#444', marginLeft: 'auto' }}>{desc}</span>
                  </div>
                ))}
              </div>
              {[['beams', '#06b6d4', 'Beams URL'], ['backdrop', '#c084fc', 'Backdrop URL']].map(([layer, color, label]) => (
                <div key={layer} style={{ marginBottom: 10 }}>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: '#444', marginBottom: 6 }}>{label}</div>
                  <div className="code-row">
                    <div className="code-box" style={{ borderColor: `${color}20`, color }}>{origin}/obs?s={profile.username}&layer={layer}</div>
                    <button onClick={() => copyUrl(`${origin}/obs?s=${profile.username}&layer=${layer}`, layer)} className="btn-sm"
                      style={{ background: `${color}15`, color, border: `1px solid ${color}30`, fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 12, textTransform: 'uppercase', padding: '10px 16px', borderRadius: 8, cursor: 'pointer', flexShrink: 0 }}>
                      {copiedUrl === layer ? '✓' : 'Copy'}
                    </button>
                  </div>
                </div>
              ))}
              <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid #111', borderRadius: 8, padding: '10px 14px', marginTop: 8 }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#444', marginBottom: 4 }}>Custom CSS for both sources:</div>
                <code style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--casi-text-muted)' }}>{"body { background-color: rgba(0,0,0,0); }"}</code>
              </div>
            </div>
          </div>
        )}

        {/* MOBILE BOTTOM NAV */}
        <div className="bot-nav">
          {(['studio', 'requests', 'chat', 'settings'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} className={`bot-tab ${view === v ? 'active' : ''}`}>
              {v === 'requests' && totalPending > 0 && <span className="bot-badge">{totalPending}</span>}
              <span style={{ fontSize: 18 }}>{v === 'studio' ? '🎬' : v === 'requests' ? '📥' : v === 'chat' ? '💬' : '⚙️'}</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' }}>{v}</span>
            </button>
          ))}
          {/* Backdrop + Clear shown in bottom nav on mobile when in studio */}
          {view === 'studio' && (
            <button onClick={() => hasBackdrop && backdropEl ? (setSelectedSlotId(backdropEl.id), setShowInfoPanel(true)) : setShowBackdropModal(true)}
              className="bot-tab" style={{ color: hasBackdrop ? '#c084fc' : '#444' }}>
              <span style={{ fontSize: 18 }}>🖼️</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' }}>{hasBackdrop ? 'Backdrop' : 'Add BG'}</span>
            </button>
          )}
        </div>

      </div>
    </>
  );
}
