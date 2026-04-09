"use client";
import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Rnd } from 'react-rnd';
import { useRouter } from 'next/navigation';

/* ── Logo ── */
function Logo({ scale = 0.38, color = '#F58220', bg = '#050505' }: { scale?: number; color?: string; bg?: string }) {
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
  const expiresAt = started + booking.duration_minutes * 60 * 1000;
  return Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
}
function formatTime(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
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
      background: isExpired ? 'rgba(239,68,68,0.12)' : isWarning ? 'rgba(234,179,8,0.12)' : 'rgba(6,182,212,0.10)',
      color: isExpired ? '#f87171' : isWarning ? '#facc15' : '#06b6d4',
      border: `1px solid ${isExpired ? 'rgba(239,68,68,0.3)' : isWarning ? 'rgba(234,179,8,0.3)' : 'rgba(6,182,212,0.2)'}`,
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
      <div style={{ background: '#0d0d0d', border: '1px solid #222', borderRadius: 16, padding: 32, width: '100%', maxWidth: 380 }}>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, color: '#f0f0f0', marginBottom: 6 }}>Full Backdrop</h2>
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#555', marginBottom: 24, lineHeight: 1.6 }}>Full-screen slot. Viewers send their image — you approve before it goes live.</p>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: '#555', marginBottom: 8 }}>Price</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#F58220', fontWeight: 800 }}>$</span>
            <input type="number" min={1} value={price} onChange={(e) => setPrice(Math.max(1, parseInt(e.target.value) || 1))}
              style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid #222', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: '#e8e8e8', outline: 'none', fontFamily: "'Syne', sans-serif" }} autoFocus />
            <select value={unit} onChange={(e) => setUnit(e.target.value)}
              style={{ background: '#0d0d0d', border: '1px solid #222', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#e8e8e8', outline: 'none', cursor: 'pointer', fontFamily: "'DM Mono', monospace" }}>
              <option value="min">/min</option>
              <option value="hr">/hr</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: '#555', marginBottom: 8 }}>Max duration (minutes, optional)</div>
          <input type="number" min={1} value={maxDuration} onChange={(e) => setMaxDuration(e.target.value)} placeholder="No limit"
            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid #222', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: '#e8e8e8', outline: 'none', fontFamily: "'Syne', sans-serif" }} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid #222', borderRadius: 8, padding: 12, color: '#888', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 12, textTransform: 'uppercase', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => onConfirm(price, unit, maxDuration ? parseInt(maxDuration) : null)}
            style={{ flex: 1, background: '#F58220', border: 'none', borderRadius: 8, padding: 12, color: '#050505', fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 12, textTransform: 'uppercase', cursor: 'pointer' }}>Create Slot</button>
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

  const totalValue = activeBooking ? (activeBooking.price_unit === 'min'
    ? (activeBooking.price_value * activeBooking.duration_minutes).toFixed(0)
    : (activeBooking.price_value * (activeBooking.duration_minutes / 60)).toFixed(2)) : null;
  const elapsed = activeBooking ? Math.max(0, activeBooking.duration_minutes * 60 - seconds) : 0;
  const earnedSoFar = activeBooking ? (activeBooking.price_unit === 'min'
    ? ((elapsed / 60) * activeBooking.price_value).toFixed(2)
    : ((elapsed / 3600) * activeBooking.price_value).toFixed(2)) : null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 250, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }} onClick={onClose}>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '90%', maxWidth: 500, background: '#0d0d0d', border: '1px solid #222', borderRadius: 16, overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #161616' }}>
          <div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: '#555', marginBottom: 4 }}>
              {el.is_background ? 'Full Backdrop' : 'Beam Slot'}
              {el.locked && <span style={{ color: '#f87171', marginLeft: 10 }}>● Locked</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 18, padding: 4 }}>✕</button>
        </div>
        <div style={{ padding: 24 }}>

          {/* Price editor */}
          <div style={{ background: 'rgba(245,130,32,0.05)', border: '1px solid rgba(245,130,32,0.15)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: '#555', marginBottom: 10 }}>Price</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#F58220', fontWeight: 800, fontSize: 16 }}>$</span>
              <input type="number" min={0} value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid #333', borderRadius: 8, padding: '10px 14px', fontSize: 16, color: '#e8e8e8', outline: 'none', fontFamily: "'DM Mono', monospace" }} />
              <select value={editUnit} onChange={(e) => setEditUnit(e.target.value)}
                style={{ background: '#0d0d0d', border: '1px solid #333', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#e8e8e8', outline: 'none', cursor: 'pointer', fontFamily: "'DM Mono', monospace" }}>
                <option value="min">/min</option>
                <option value="hr">/hr</option>
              </select>
              <button onClick={() => { onUpdatePrice(el.id, parseFloat(editPrice) || 0, editUnit); onClose(); }}
                style={{ background: '#F58220', border: 'none', borderRadius: 8, padding: '10px 16px', color: '#050505', fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 12, textTransform: 'uppercase', cursor: 'pointer' }}>
                Save
              </button>
            </div>
          </div>

          {/* Active booking */}
          {activeBooking ? (
            <div style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, border: '1px solid #222', overflow: 'hidden', background: '#050505', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {activeBooking.image_url && <img src={activeBooking.image_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="" />}
                </div>
                <div>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, color: '#e8e8e8', fontSize: 14 }}>● {activeBooking.viewer_name}</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#555' }}>{activeBooking.duration_minutes} min booked</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {[['Time left', formatTime(seconds), '#06b6d4'], ['Earned', `$${earnedSoFar}`, '#4ade80'], ['Total', `$${totalValue}`, '#e8e8e8']].map(([l, v, c]) => (
                  <div key={l} style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: '#444', marginBottom: 4 }}>{l}</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 500, color: c }}>{v}</div>
                  </div>
                ))}
              </div>
              {activeBooking.message && <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, color: '#555', fontStyle: 'italic', marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>"{activeBooking.message}"</div>}
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
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: '#555', marginBottom: 10 }}>{queueBookings.length} in queue</div>
              {queueBookings.map((b, idx) => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(245,130,32,0.05)', border: '1px solid rgba(245,130,32,0.12)', borderRadius: 8, padding: '8px 12px', marginBottom: 6 }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(245,130,32,0.4)', minWidth: 20 }}>#{idx + 1}</span>
                  <div style={{ width: 20, height: 20, borderRadius: 4, overflow: 'hidden', background: '#050505', flexShrink: 0 }}>
                    {b.image_url && <img src={b.image_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="" />}
                  </div>
                  <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, fontWeight: 600, color: '#e8e8e8', flex: 1 }}>{b.viewer_name}</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#555' }}>{b.duration_minutes}m</span>
                </div>
              ))}
            </div>
          )}

          {/* Controls */}
          <div style={{ paddingTop: 16, borderTop: '1px solid #161616', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 600, color: '#e8e8e8', marginBottom: 2 }}>Lock slot</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#555' }}>No new requests. Current runs to end.</div>
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

/* ── Slider control ── */
function SliderRow({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: '#555', width: 28, flexShrink: 0 }}>{label}</div>
      <input type="range" min={min} max={max} step={1} value={Math.round(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: '#F58220', cursor: 'pointer', height: 4 }} />
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#e8e8e8', width: 32, textAlign: 'right', flexShrink: 0 }}>{Math.round(value)}%</div>
    </div>
  );
}

/* ══════════════════════════════════════════
   MAIN ADMIN PAGE
══════════════════════════════════════════ */
export default function AdminStudio() {
  const [view, setView] = useState<'studio' | 'requests' | 'settings'>('studio');
  const [profile, setProfile] = useState<any>(null);
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
  const [togglingLive, setTogglingLive] = useState(false);

  const router = useRouter();
  const supabase = useRef(createClient()).current;

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(prof);
      const { data: els } = await supabase.from('overlay_elements').select('*').eq('profile_id', user.id);
      if (els) setElements(els);
      setIsReady(true);
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
    await supabase.from('bookings').update({ status: 'expired' }).eq('id', booking.id);
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
      setSelectedSlotId(data.id); // auto-select new beam
    }
  };

  const deleteLayer = async (id: string) => {
    if (selectedSlotId === id) setSelectedSlotId(null);
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
    setSaveStatus(`Cleared ${toDelete.length}`);
    setTimeout(() => setSaveStatus('Ready'), 2000);
  };

  const toggleLock = useCallback(async (id: string, locked: boolean) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, locked } : el));
    await supabase.from('overlay_elements').update({ locked }).eq('id', id);
  }, [supabase]);

  const approveBooking = async (booking: any) => {
    setPreviewBooking(null);
    const slotOccupied = activeBookings.some(b => b.element_id === booking.element_id);
    if (slotOccupied) {
      await supabase.from('bookings').update({ status: 'approved_queued', approved_at: new Date().toISOString() }).eq('id', booking.id);
    } else {
      await supabase.from('bookings').update({ status: 'active', started_at: new Date().toISOString() }).eq('id', booking.id);
      if (booking.element_id) {
        await supabase.from('overlay_elements').update({ image_url: booking.image_url }).eq('id', booking.element_id);
        setElements(prev => prev.map(el => el.id === booking.element_id ? { ...el, image_url: booking.image_url } : el));
      }
    }
    setPendingBookings(prev => prev.filter(b => b.id !== booking.id));
    setQueuedBookings(prev => prev.filter(b => b.id !== booking.id));
  };

  const denyBooking = async (id: string) => {
    setPreviewBooking(null);
    await supabase.from('bookings').update({ status: 'denied' }).eq('id', id);
    setPendingBookings(prev => prev.filter(b => b.id !== id));
    setQueuedBookings(prev => prev.filter(b => b.id !== id));
  };

  const kickBeam = useCallback(async (booking: any) => {
    setSelectedSlotId(null);
    await expireBooking(booking);
  }, [expireBooking]);

  const copyUrl = (url: string, key: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(key);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const calcTotal = (booking: any) => booking.price_unit === 'min'
    ? (booking.price_value * booking.duration_minutes).toFixed(0)
    : (booking.price_value * (booking.duration_minutes / 60)).toFixed(2);

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
    <div style={{ minHeight: '100vh', background: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <Logo scale={0.5} />
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: '#F58220', animation: 'pulse 1.5s infinite' }}>Loading studio…</span>
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
        body { background: #050505; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes blink  { 0%,100%{opacity:1} 50%{opacity:.2} }

        .sw { min-height:100vh; background:#050505; color:#e8e8e8; font-family:'Syne',sans-serif; display:flex; flex-direction:column; }

        /* NAV */
        .top-nav { display:flex; align-items:center; justify-content:space-between; padding:0 32px; height:64px; flex-shrink:0; border-bottom:1px solid #111; background:rgba(5,5,5,0.96); backdrop-filter:blur(20px); position:sticky; top:0; z-index:100; }
        .tnl { display:flex; align-items:center; gap:32px; }
        .nav-logo { display:flex; align-items:center; gap:10px; text-decoration:none; }
        .nav-wm { font-size:20px; font-weight:800; color:#F58220; letter-spacing:-0.5px; }
        .nav-tabs { display:flex; gap:4px; }
        .nav-tab { font-family:'DM Mono',monospace; font-size:11px; letter-spacing:1.5px; text-transform:uppercase; padding:7px 14px; border-radius:8px; border:none; background:none; color:#555; cursor:pointer; transition:all .2s; position:relative; }
        .nav-tab:hover { color:#e8e8e8; background:rgba(255,255,255,0.04); }
        .nav-tab.active { color:#F58220; background:rgba(245,130,32,0.08); }
        .nav-badge { position:absolute; top:2px; right:2px; background:#F58220; color:#050505; font-size:9px; font-weight:800; width:16px; height:16px; border-radius:50%; display:flex; align-items:center; justify-content:center; }
        .tnr { display:flex; align-items:center; gap:12px; }
        .live-toggle { display:flex; align-items:center; gap:8px; padding:8px 16px; border-radius:8px; border:1px solid; cursor:pointer; font-family:'Syne',sans-serif; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; transition:all .2s; }
        .lt-off { background:rgba(255,255,255,0.04); border-color:#222; color:#555; }
        .lt-on  { background:rgba(239,68,68,0.12); border-color:rgba(239,68,68,0.35); color:#f87171; }
        .live-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
        .ld-off { background:#444; }
        .ld-on  { background:#f87171; animation:blink 1.5s infinite; }
        .btn-sm { font-family:'Syne',sans-serif; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.3px; padding:8px 16px; border-radius:8px; border:none; cursor:pointer; transition:all .2s; white-space:nowrap; }
        .b-orange  { background:#F58220; color:#050505; }
        .b-orange:hover { background:#ff9030; }
        .b-outline { background:rgba(255,255,255,0.04); color:#888; border:1px solid #222 !important; }
        .b-outline:hover { background:rgba(255,255,255,0.08); color:#e8e8e8; }
        .b-danger  { background:rgba(248,113,113,0.08); color:#f87171; border:1px solid rgba(248,113,113,0.2) !important; }
        .b-danger:hover  { background:rgba(248,113,113,0.15); }
        .b-purple  { background:rgba(168,85,247,0.1); color:#c084fc; border:1px solid rgba(168,85,247,0.25) !important; }
        .b-purple:hover { background:rgba(168,85,247,0.18); }

        /* BEAMS BAR */
        .beams-bar { display:flex; flex-wrap:wrap; gap:8px; padding:12px 32px; border-bottom:1px solid #0d0d0d; }
        .beam-chip { display:flex; align-items:center; gap:10px; background:#0d0d0d; border:1px solid #1c1c1c; border-radius:10px; padding:8px 14px; cursor:pointer; transition:border-color .2s; }
        .beam-chip:hover { border-color:rgba(245,130,32,0.3); }

        /* STUDIO */
        .studio-body { flex:1; display:flex; flex-direction:column; padding:20px 32px 32px; gap:16px; overflow:auto; }
        .canvas-wrap { position:relative; aspect-ratio:16/9; border-radius:12px; border:1px solid #1c1c1c; background:#080808; overflow:visible; }
        .canvas-hint { text-align:center; font-family:'DM Mono',monospace; font-size:10px; letter-spacing:2px; text-transform:uppercase; color:#1e1e1e; margin-top:10px; }

        /* ── SLIDER PANEL ── */
        .slider-panel { background:#0a0a0a; border:1px solid rgba(245,130,32,0.2); border-radius:12px; padding:16px 20px; display:flex; flex-direction:column; gap:12px; animation:fadeIn .2s ease; }
        .slider-panel-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; }
        .slider-panel-title { font-family:'Syne',sans-serif; font-size:13px; font-weight:700; color:#F58220; }
        @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }

        /* REQUESTS */
        .req-body { flex:1; padding:24px 32px; overflow:auto; max-width:800px; width:100%; margin:0 auto; }
        .sec-head { font-family:'DM Mono',monospace; font-size:10px; letter-spacing:2px; text-transform:uppercase; margin-bottom:14px; display:flex; align-items:center; gap:8px; }
        .sec-head::before { content:''; display:block; width:16px; height:1px; background:currentColor; opacity:0.5; }
        .slot-type-badge { font-family:'DM Mono',monospace; font-size:9px; letter-spacing:1.5px; padding:2px 8px; border-radius:20px; border:1px solid; }
        .badge-beam { color:#06b6d4; border-color:rgba(6,182,212,0.3); background:rgba(6,182,212,0.06); }
        .badge-backdrop { color:#c084fc; border-color:rgba(192,132,252,0.3); background:rgba(168,85,247,0.06); }
        .req-card { background:#0a0a0a; border:1px solid #1a1a1a; border-radius:14px; padding:20px; margin-bottom:10px; display:flex; gap:16px; align-items:flex-start; transition:border-color .2s; }
        .req-card:hover { border-color:#2a2a2a; }
        .req-thumb { width:72px; height:72px; border-radius:10px; border:1px solid #1c1c1c; overflow:hidden; background:#050505; flex-shrink:0; display:flex; align-items:center; justify-content:center; cursor:pointer; }
        .req-thumb:hover { border-color:rgba(245,130,32,0.3); }
        .req-info { flex:1; min-width:0; }
        .req-name { font-size:17px; font-weight:700; color:#e8e8e8; margin-bottom:6px; }
        .req-meta { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px; }
        .tag { font-family:'DM Mono',monospace; font-size:10px; letter-spacing:1px; padding:3px 10px; border-radius:20px; border:1px solid; }
        .t-orange { color:#F58220; background:rgba(245,130,32,0.08); border-color:rgba(245,130,32,0.2); }
        .t-green  { color:#4ade80; background:rgba(74,222,128,0.08); border-color:rgba(74,222,128,0.2); }
        .t-cyan   { color:#06b6d4; background:rgba(6,182,212,0.08); border-color:rgba(6,182,212,0.2); }
        .t-dim    { color:rgba(245,130,32,0.6); background:rgba(245,130,32,0.05); border-color:rgba(245,130,32,0.12); }
        .req-msg { font-size:13px; color:#555; font-style:italic; border-left:2px solid #1c1c1c; padding-left:10px; margin-top:6px; }
        .req-actions { display:flex; flex-direction:column; gap:8px; flex-shrink:0; }
        .act-btn { font-family:'Syne',sans-serif; font-weight:800; font-size:12px; text-transform:uppercase; padding:10px 18px; border-radius:8px; border:none; cursor:pointer; transition:all .2s; white-space:nowrap; }
        .c-active  { background:rgba(6,182,212,0.05);  border-color:rgba(6,182,212,0.2) !important; }
        .c-queued  { background:rgba(245,130,32,0.04);  border-color:rgba(245,130,32,0.15) !important; }
        .c-backdrop-active { background:rgba(168,85,247,0.05); border-color:rgba(168,85,247,0.2) !important; }
        .c-backdrop-queue  { background:rgba(168,85,247,0.03); border-color:rgba(168,85,247,0.12) !important; }
        .sep { width:100%; height:1px; background:#0d0d0d; margin:24px 0; }

        /* SETTINGS */
        .set-body { flex:1; padding:24px 32px; overflow:auto; max-width:680px; width:100%; margin:0 auto; display:flex; flex-direction:column; gap:12px; }
        .set-card { background:#0a0a0a; border:1px solid #1a1a1a; border-radius:14px; padding:24px; }
        .set-title { font-size:14px; font-weight:700; color:#e8e8e8; margin-bottom:4px; }
        .set-sub   { font-family:'DM Mono',monospace; font-size:10px; color:#555; margin-bottom:16px; }
        .code-row  { display:flex; align-items:center; gap:10px; }
        .code-box  { flex:1; background:rgba(0,0,0,0.4); border:1px solid #161616; border-radius:8px; padding:10px 14px; font-family:'DM Mono',monospace; font-size:11px; color:#888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

        /* MOBILE BOTTOM NAV */
        .bot-nav { display:none; }

        /* Range slider touch-friendly */
        input[type=range] { -webkit-appearance: none; appearance: none; height: 4px; border-radius: 2px; background: #222; outline: none; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: #F58220; cursor: pointer; border: 2px solid #050505; }
        input[type=range]::-moz-range-thumb { width: 20px; height: 20px; border-radius: 50%; background: #F58220; cursor: pointer; border: 2px solid #050505; }

        @media (max-width:768px) {
          .top-nav { padding:0 16px; }
          .nav-tabs { display:none; }
          .save-status-txt { display:none; }
          .studio-body { padding:12px 16px 100px; }
          .beams-bar { padding:10px 16px; }
          .req-body { padding:16px 16px 100px; }
          .set-body { padding:16px 16px 100px; }
          .req-card { flex-direction:column; }
          .req-actions { flex-direction:row; width:100%; }
          .req-actions .act-btn { flex:1; text-align:center; }
          .bot-nav { display:flex; position:fixed; bottom:0; left:0; right:0; z-index:90; background:rgba(5,5,5,0.97); border-top:1px solid #111; padding:8px 0 env(safe-area-inset-bottom,8px); }
          .bot-tab { flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; padding:8px 4px; border:none; background:none; cursor:pointer; position:relative; transition:color .2s; }
          .bot-tab.active { color:#F58220; }
          .bot-tab:not(.active) { color:#444; }
          .bot-badge { position:absolute; top:4px; right:calc(50% - 16px); background:#F58220; color:#050505; font-size:9px; font-weight:800; width:14px; height:14px; border-radius:50%; display:flex; align-items:center; justify-content:center; }
          /* Hide studio actions except beam on mobile — use the info panel for price */
          .studio-action-hide { display:none; }
        }
      `}</style>

      <div className="sw">

        {/* NAV */}
        <nav className="top-nav">
          <div className="tnl">
            <a href="/" className="nav-logo">
              <Logo scale={0.36} />
              <span className="nav-wm">casi</span>
            </a>
            <div className="nav-tabs">
              {(['studio', 'requests', 'settings'] as const).map(v => (
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
                <button onClick={addBeam} className="btn-sm b-orange">+ Beam</button>
                <button onClick={() => hasBackdrop && backdropEl ? setSelectedSlotId(backdropEl.id) : setShowBackdropModal(true)} className={`btn-sm ${hasBackdrop ? 'b-purple' : 'b-outline'} studio-action-hide`}>
                  {hasBackdrop ? '● Backdrop' : 'Backdrop'}
                </button>
                <button onClick={clearAll} className="btn-sm b-danger studio-action-hide">Clear</button>
              </>
            )}
            <a href={`/s/${profile.username}`} target="_blank" rel="noopener noreferrer"
              style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#444', textDecoration: 'none', letterSpacing: 1 }}>
              @{profile.username}
            </a>
          </div>
        </nav>

        {/* MODALS */}
        {showBackdropModal && <BackdropModal onConfirm={createFullBackdrop} onClose={() => setShowBackdropModal(false)} />}
        {selectedEl && view === 'studio' && (
          <SlotInfoPanel
            el={selectedEl}
            activeBooking={activeBookings.find(b => b.element_id === selectedEl.id) || null}
            queueBookings={approvedQueued.filter(b => b.element_id === selectedEl.id).sort((a, b) => new Date(a.approved_at).getTime() - new Date(b.approved_at).getTime())}
            onClose={() => setSelectedSlotId(null)}
            onKick={kickBeam} onLockToggle={toggleLock} onDelete={deleteLayer}
            onUpdatePrice={(id, price, unit) => updateLayer(id, { price_value: price, price_unit: unit })}
          />
        )}

        {/* PREVIEW MODAL */}
        {previewBooking && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}
            onClick={(e) => { if (e.target === e.currentTarget) setPreviewBooking(null); }}>
            <div style={{ background: '#0d0d0d', border: '1px solid #222', borderRadius: 16, padding: 28, width: '100%', maxWidth: 520 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, color: '#f0f0f0' }}>Review Request</h2>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: isBackdropBooking(previewBooking) ? '#c084fc' : '#06b6d4', marginTop: 4, letterSpacing: 1 }}>
                    {isBackdropBooking(previewBooking) ? '🖼 Full Backdrop' : '✦ Beam Slot'}
                    {slotOccupiedForPreview && <span style={{ color: '#F58220', marginLeft: 8 }}>— slot occupied, will queue</span>}
                  </div>
                </div>
                <button onClick={() => setPreviewBooking(null)} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 18 }}>✕</button>
              </div>
              <div style={{ aspectRatio: '16/9', background: '#050505', border: '1px solid #1c1c1c', borderRadius: 10, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                {previewBooking.image_url ? <img src={previewBooking.image_url} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} alt="" /> : <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#333' }}>No image</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                {[['From', previewBooking.viewer_name, '#e8e8e8'], ['Price', `$${previewBooking.price_value}/${previewBooking.price_unit}`, '#06b6d4'], ['Duration', `${previewBooking.duration_minutes} min`, '#e8e8e8'], ['Total', `$${calcTotal(previewBooking)}`, '#4ade80']].map(([l, v, c]) => (
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
                <button onClick={() => denyBooking(previewBooking.id)} style={{ flex: 1, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: 12, color: '#f87171', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 13, textTransform: 'uppercase', cursor: 'pointer' }}>Deny</button>
                <button onClick={() => approveBooking(previewBooking)} style={{ flex: 1, background: slotOccupiedForPreview ? '#F58220' : '#06b6d4', border: 'none', borderRadius: 10, padding: 12, color: '#050505', fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 13, textTransform: 'uppercase', cursor: 'pointer' }}>
                  {slotOccupiedForPreview ? 'Approve → Queue' : 'Approve → Live'}
                </button>
              </div>
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
                    <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, fontWeight: 600, color: '#e8e8e8' }}>{booking.viewer_name}</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: isBackdrop ? 'rgba(192,132,252,0.6)' : 'rgba(6,182,212,0.6)', letterSpacing: 1 }}>
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
                // Deselect if clicking canvas background (not a beam)
                if ((e.target as HTMLElement).classList.contains('canvas-wrap')) setSelectedSlotId(null);
              }}>
              {dimensions.width > 0 && elements.map((el) => {
                const isSelected = selectedSlotId === el.id;
                return (
                  <Rnd key={el.id}
                    size={{ width: el.is_background ? '100%' : `${(el.width / 100) * dimensions.width}px`, height: el.is_background ? '100%' : `${(el.height / 100) * dimensions.height}px` }}
                    position={{ x: el.is_background ? 0 : (el.pos_x / 100) * dimensions.width, y: el.is_background ? 0 : (el.pos_y / 100) * dimensions.height }}
                    onDragStop={(_e, d) => { updateLayer(el.id, { pos_x: (d.x / dimensions.width) * 100, pos_y: (d.y / dimensions.height) * 100 }); }}
                    onResizeStop={(_e, _dir, ref, _delta, pos) => { updateLayer(el.id, { width: (ref.offsetWidth / dimensions.width) * 100, height: (ref.offsetHeight / dimensions.height) * 100, pos_x: (pos.x / dimensions.width) * 100, pos_y: (pos.y / dimensions.height) * 100 }); }}
                    disableDragging={el.is_background} enableResizing={!el.is_background} bounds="parent"
                    style={{ zIndex: el.is_background ? 0 : (isSelected ? 40 : 30) }}>
                    <div
                      onClick={(e) => { e.stopPropagation(); if (!el.is_background) setSelectedSlotId(el.id); }}
                      style={{ position: 'relative', width: '100%', height: '100%', border: el.is_background ? 'none' : isSelected ? '2px solid #F58220' : '1.5px solid rgba(245,130,32,0.3)', borderRadius: el.is_background ? 0 : 6, opacity: el.locked ? 0.7 : 1, cursor: el.is_background ? 'default' : 'pointer' }}>
                      {!el.image_url ? (
                        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: `1.5px dashed ${el.locked ? 'rgba(248,113,113,0.3)' : el.is_background ? 'rgba(168,85,247,0.35)' : 'rgba(245,130,32,0.35)'}`, borderRadius: el.is_background ? 12 : 6, background: el.locked ? 'rgba(248,113,113,0.04)' : el.is_background ? 'rgba(168,85,247,0.04)' : 'rgba(245,130,32,0.04)' }}>
                          {el.locked && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(248,113,113,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>🔒 Locked</span>}
                          <span style={{ fontSize: el.is_background ? 24 : 16, marginBottom: 4 }}>{el.is_background ? '🖼️' : '✦'}</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: el.locked ? 'rgba(248,113,113,0.5)' : el.is_background ? 'rgba(168,85,247,0.6)' : 'rgba(245,130,32,0.6)' }}>
                            {el.locked ? 'No requests' : el.is_background ? 'Backdrop' : 'Beam'}
                          </span>
                          {el.price_value > 0 && !el.locked && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 500, marginTop: 3, color: el.is_background ? 'rgba(168,85,247,0.9)' : '#F58220' }}>${el.price_value}/{el.price_unit}</span>}
                        </div>
                      ) : (
                        <img src={el.image_url} style={{ width: '100%', height: '100%', objectFit: el.is_background ? 'cover' : 'fill', pointerEvents: 'none' }} alt="" />
                      )}
                      {/* Selection indicator */}
                      {isSelected && !el.is_background && (
                        <div style={{ position: 'absolute', top: -2, left: -2, right: -2, bottom: -2, border: '2px solid #F58220', borderRadius: 8, pointerEvents: 'none', boxShadow: '0 0 0 3px rgba(245,130,32,0.15)' }} />
                      )}
                      {/* Info button (desktop) */}
                      {!el.is_background && (
                        <button onClick={(e) => { e.stopPropagation(); setSelectedSlotId(el.id); }}
                          style={{ position: 'absolute', top: 4, right: 28, background: 'rgba(0,0,0,0.85)', border: 'none', borderRadius: 4, color: '#888', fontSize: 9, padding: '3px 6px', cursor: 'pointer', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: 1, zIndex: 50 }}>
                          ⚙
                        </button>
                      )}
                      {/* Delete button */}
                      {!el.is_background && (
                        <button onClick={(e) => { e.stopPropagation(); deleteLayer(el.id); }}
                          style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(239,68,68,0.85)', border: 'none', borderRadius: 4, color: 'white', fontSize: 9, padding: '3px 7px', cursor: 'pointer', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: 1, zIndex: 50 }}>
                          ✕
                        </button>
                      )}
                    </div>
                  </Rnd>
                );
              })}
            </div>

            {/* Slider position panel — shown when a non-background beam is selected */}
            {selectedEl && !selectedEl.is_background && (
              <div className="slider-panel">
                <div className="slider-panel-header">
                  <span className="slider-panel-title">
                    ✦ Beam position &amp; size
                    {selectedEl.price_value > 0 && <span style={{ color: '#888', fontWeight: 400, marginLeft: 8, fontSize: 12 }}>${selectedEl.price_value}/{selectedEl.price_unit}</span>}
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setSelectedSlotId(null)}
                      style={{ background: 'none', border: '1px solid #222', borderRadius: 6, color: '#555', fontFamily: "'DM Mono', monospace", fontSize: 10, padding: '4px 10px', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1 }}>
                      Done
                    </button>
                    <button onClick={() => { /* open info panel */ setSelectedSlotId(selectedEl.id); }}
                      style={{ background: 'rgba(245,130,32,0.08)', border: '1px solid rgba(245,130,32,0.2)', borderRadius: 6, color: '#F58220', fontFamily: "'DM Mono', monospace", fontSize: 10, padding: '4px 10px', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1 }}>
                      Info / Price
                    </button>
                  </div>
                </div>
                <SliderRow label="X" value={selectedEl.pos_x} min={0} max={80}
                  onChange={(v) => updateSlider(selectedEl.id, { pos_x: v })} />
                <SliderRow label="Y" value={selectedEl.pos_y} min={0} max={80}
                  onChange={(v) => updateSlider(selectedEl.id, { pos_y: v })} />
                <SliderRow label="W" value={selectedEl.width} min={5} max={60}
                  onChange={(v) => updateSlider(selectedEl.id, { width: v })} />
                <SliderRow label="H" value={selectedEl.height} min={5} max={60}
                  onChange={(v) => updateSlider(selectedEl.id, { height: v })} />
              </div>
            )}

            <div className="canvas-hint">
              {selectedEl && !selectedEl.is_background
                ? 'Drag beam on canvas · Use sliders below for precise control'
                : 'Tap a beam to select · Drag to reposition · Resize from corners'}
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
                  <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 800, color: '#e8e8e8', letterSpacing: -0.5 }}>Beam Slots</div>
                  <span className="slot-type-badge badge-beam">✦ Beams</span>
                </div>

                {activeBeams.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div className="sec-head" style={{ color: '#06b6d4' }}>● Live — {activeBeams.length}</div>
                    {activeBeams.map(booking => {
                      const queueForSlot = approvedBeams.filter(b => b.element_id === booking.element_id).sort((a, b) => new Date(a.approved_at).getTime() - new Date(b.approved_at).getTime());
                      return (
                        <div key={booking.id} className="req-card c-active">
                          <div style={{ width: 64, height: 64, borderRadius: 10, border: '1px solid rgba(6,182,212,0.2)', overflow: 'hidden', background: '#050505', flexShrink: 0 }}>
                            {booking.image_url && <img src={booking.image_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="" />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: '#e8e8e8', marginBottom: 4 }}>{booking.viewer_name}</div>
                            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#555', marginBottom: 6 }}>${booking.price_value}/{booking.price_unit} · {booking.duration_minutes} min</div>
                            {booking.message && <div className="req-msg">"{booking.message}"</div>}
                            {queueForSlot.length > 0 && (
                              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                {queueForSlot.map((next, idx) => (
                                  <div key={next.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(245,130,32,0.4)', minWidth: 20 }}>#{idx + 1}</span>
                                    <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, color: 'rgba(245,130,32,0.7)' }}>{next.viewer_name}</span>
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
                    <div className="sec-head" style={{ color: '#F58220' }}>⏳ Approved queue — {approvedBeams.length}</div>
                    {approvedBeams.map(booking => (
                      <div key={booking.id} className="req-card c-queued">
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, fontWeight: 500, color: 'rgba(245,130,32,0.3)', minWidth: 28 }}>#{getQueuePosition(booking)}</span>
                        <div style={{ width: 52, height: 52, borderRadius: 8, border: '1px solid rgba(245,130,32,0.15)', overflow: 'hidden', background: '#050505', flexShrink: 0 }}>
                          {booking.image_url && <img src={booking.image_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="" />}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, color: '#e8e8e8', marginBottom: 3 }}>{booking.viewer_name}</div>
                          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#555' }}>${booking.price_value}/{booking.price_unit} · {booking.duration_minutes} min</div>
                        </div>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(245,130,32,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>
                          {getQueuePosition(booking) === 1 ? 'Next up' : `Queue #${getQueuePosition(booking)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {pendingBeams.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div className="sec-head" style={{ color: '#555' }}>Pending — {pendingBeams.length}</div>
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
                            <span className="tag t-cyan">{booking.duration_minutes} min</span>
                          </div>
                          {booking.message && <div className="req-msg">"{booking.message}"</div>}
                        </div>
                        <div className="req-actions">
                          <button onClick={() => approveBooking(booking)} className="act-btn"
                            style={{ background: activeBookings.some(b => b.element_id === booking.element_id) ? '#F58220' : '#06b6d4', color: '#050505' }}>
                            {activeBookings.some(b => b.element_id === booking.element_id) ? 'Queue' : 'Approve'}
                          </button>
                          <button onClick={() => denyBooking(booking.id)} className="act-btn b-danger" style={{ border: '1px solid rgba(248,113,113,0.2)' }}>Deny</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {queuedBeams.length > 0 && (
                  <div>
                    <div className="sec-head" style={{ color: 'rgba(245,130,32,0.5)' }}>Wants next beam — {queuedBeams.length}</div>
                    {queuedBeams.map(booking => (
                      <div key={booking.id} className="req-card" style={{ borderColor: 'rgba(245,130,32,0.12)', background: 'rgba(245,130,32,0.03)' }}>
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
                          <button onClick={() => approveBooking(booking)} className="act-btn" style={{ background: '#F58220', color: '#050505' }}>Queue</button>
                          <button onClick={() => denyBooking(booking.id)} className="act-btn b-danger" style={{ border: '1px solid rgba(248,113,113,0.2)' }}>Deny</button>
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
                  <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 800, color: '#e8e8e8', letterSpacing: -0.5 }}>Full Backdrop</div>
                  <span className="slot-type-badge badge-backdrop">🖼 Backdrop</span>
                </div>

                {activeBackdrop.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div className="sec-head" style={{ color: '#c084fc' }}>● Live</div>
                    {activeBackdrop.map(booking => (
                      <div key={booking.id} className="req-card c-backdrop-active">
                        <div style={{ width: 64, height: 64, borderRadius: 10, border: '1px solid rgba(192,132,252,0.2)', overflow: 'hidden', background: '#050505', flexShrink: 0 }}>
                          {booking.image_url && <img src={booking.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: '#e8e8e8', marginBottom: 4 }}>{booking.viewer_name}</div>
                          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#555', marginBottom: 6 }}>${booking.price_value}/{booking.price_unit} · {booking.duration_minutes} min</div>
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
                        <div style={{ width: 52, height: 52, borderRadius: 8, border: '1px solid rgba(192,132,252,0.15)', overflow: 'hidden', background: '#050505', flexShrink: 0 }}>
                          {booking.image_url && <img src={booking.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, color: '#e8e8e8', marginBottom: 3 }}>{booking.viewer_name}</div>
                          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#555' }}>${booking.price_value}/{booking.price_unit} · {booking.duration_minutes} min</div>
                        </div>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(192,132,252,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>
                          {getQueuePosition(booking) === 1 ? 'Next up' : `Queue #${getQueuePosition(booking)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {pendingBackdrop.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div className="sec-head" style={{ color: '#555' }}>Pending — {pendingBackdrop.length}</div>
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
                            <span className="tag" style={{ color: '#888', background: 'rgba(255,255,255,0.04)', borderColor: '#1c1c1c' }}>{booking.duration_minutes} min</span>
                          </div>
                          {booking.message && <div className="req-msg">"{booking.message}"</div>}
                        </div>
                        <div className="req-actions">
                          <button onClick={() => approveBooking(booking)} className="act-btn"
                            style={{ background: '#c084fc', color: '#050505' }}>
                            {activeBookings.some(b => b.element_id === booking.element_id) ? 'Queue' : 'Approve'}
                          </button>
                          <button onClick={() => denyBooking(booking.id)} className="act-btn b-danger" style={{ border: '1px solid rgba(248,113,113,0.2)' }}>Deny</button>
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
                          <button onClick={() => approveBooking(booking)} className="act-btn" style={{ background: '#c084fc', color: '#050505' }}>Queue</button>
                          <button onClick={() => denyBooking(booking.id)} className="act-btn b-danger" style={{ border: '1px solid rgba(248,113,113,0.2)' }}>Deny</button>
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

        {/* ── SETTINGS ── */}
        {view === 'settings' && (
          <div className="set-body">
            <div className="set-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', border: '1px solid #222', overflow: 'hidden', background: '#0d0d0d', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                  {profile.avatar_url ? <img src={profile.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : '👤'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: '#e8e8e8' }}>{profile.display_name || profile.username}</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#555' }}>@{profile.username}</div>
                  {profile.bio && <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>{profile.bio}</div>}
                </div>
                <a href="/profile/edit" style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#F58220', textDecoration: 'none', letterSpacing: 1, textTransform: 'uppercase', flexShrink: 0 }}>Edit →</a>
              </div>
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
                    <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: 13, color: '#e8e8e8' }}>{name}</span>
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
                <code style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#555' }}>{"body { background-color: rgba(0,0,0,0); }"}</code>
              </div>
            </div>
          </div>
        )}

        {/* MOBILE BOTTOM NAV */}
        <div className="bot-nav">
          {(['studio', 'requests', 'settings'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} className={`bot-tab ${view === v ? 'active' : ''}`}>
              {v === 'requests' && totalPending > 0 && <span className="bot-badge">{totalPending}</span>}
              <span style={{ fontSize: 18 }}>{v === 'studio' ? '🎬' : v === 'requests' ? '📥' : '⚙️'}</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' }}>{v}</span>
            </button>
          ))}
        </div>

      </div>
    </>
  );
}
