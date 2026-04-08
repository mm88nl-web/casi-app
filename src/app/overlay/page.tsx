"use client";
import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

/* ── Logo ── */
function Logo({ scale = 0.32, color = '#F58220', bg = '#050505' }: { scale?: number; color?: string; bg?: string }) {
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
function Countdown({ booking, onWarning }: { booking: any; onWarning?: (s: number) => void }) {
  const [seconds, setSeconds] = useState(getSecondsRemaining(booking));
  useEffect(() => {
    const interval = setInterval(() => {
      const s = getSecondsRemaining(booking);
      setSeconds(s);
      if (onWarning) onWarning(s);
    }, 1000);
    return () => clearInterval(interval);
  }, [booking, onWarning]);
  return <span>{formatTime(seconds)}</span>;
}

/* ── Constants ── */
const VIEWER_NAME_KEY = 'casi_viewer_name';
const ADJECTIVES = ['Cool', 'Fast', 'Bold', 'Wild', 'Epic', 'Slick', 'Dark', 'Neon', 'Hyper', 'Ultra', 'Turbo', 'Mega', 'Swift', 'Storm', 'Blaze'];
const ANIMALS = ['Tiger', 'Panda', 'Fox', 'Wolf', 'Hawk', 'Bear', 'Shark', 'Eagle', 'Viper', 'Lynx', 'Raven', 'Cobra', 'Falcon', 'Bison', 'Orca'];
function generateRandomName() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const num = Math.floor(Math.random() * 99) + 1;
  return `${adj}${animal}${num}`;
}

/* ── Name Entry Screen ── */
function NameEntryScreen({ onConfirm }: { onConfirm: (name: string) => void }) {
  const [name, setName] = useState(generateRandomName());
  const [showSignInNote, setShowSignInNote] = useState(false);
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>
      <div style={{ minHeight: '100vh', background: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Syne', sans-serif" }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          {/* Logo + wordmark */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 40 }}>
            <Logo scale={0.5} />
            <div style={{ fontSize: 28, fontWeight: 800, color: '#F58220', letterSpacing: -1, marginTop: 8 }}>casi</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', color: '#444', marginTop: 4 }}>Viewer</div>
          </div>

          <div style={{ background: '#0a0a0a', border: '1px solid #1c1c1c', borderRadius: 16, padding: 28, marginBottom: 12 }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: '#555', marginBottom: 16 }}>Pick a name for this stream</div>
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <input type="text" value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && name.trim() && onConfirm(name.trim())}
                maxLength={24} autoFocus
                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid #1c1c1c', borderRadius: 10, padding: '13px 16px', paddingRight: 90, fontSize: 15, fontWeight: 700, color: '#e8e8e8', outline: 'none', fontFamily: "'Syne', sans-serif", transition: 'border-color .2s' }}
                onFocus={(e) => e.target.style.borderColor = 'rgba(245,130,32,0.4)'}
                onBlur={(e) => e.target.style.borderColor = '#1c1c1c'}
              />
              <button onClick={() => setName(generateRandomName())}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#555', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1, transition: 'color .2s', padding: '4px 0' }}
                onMouseOver={(e) => (e.currentTarget.style.color = '#F58220')}
                onMouseOut={(e) => (e.currentTarget.style.color = '#555')}>
                ↺ random
              </button>
            </div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#333', marginBottom: 20, letterSpacing: 0.5 }}>A random name was generated — change it or keep it.</div>
            <button onClick={() => name.trim() && onConfirm(name.trim())} disabled={!name.trim()}
              style={{ width: '100%', background: name.trim() ? '#F58220' : '#1c1c1c', border: 'none', borderRadius: 10, padding: '14px', fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5, color: name.trim() ? '#050505' : '#444', cursor: name.trim() ? 'pointer' : 'not-allowed', transition: 'all .2s' }}>
              Enter stream →
            </button>
          </div>

          <button onClick={() => setShowSignInNote(!showSignInNote)}
            style={{ width: '100%', background: 'none', border: 'none', fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#333', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1.5, padding: '10px 0', transition: 'color .2s' }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#555')}
            onMouseOut={(e) => (e.currentTarget.style.color = '#333')}>
            Have an account? Sign in
          </button>

          {showSignInNote && (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid #111', borderRadius: 10, padding: 16, textAlign: 'center', marginTop: 8 }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#444', lineHeight: 1.7 }}>
                Account sign-in coming soon.<br />Your name is saved on this device for now.
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════
   MAIN OVERLAY
══════════════════════════════════════════ */
function OverlayContent() {
  const searchParams = useSearchParams();
  const username = searchParams.get('s') || '';
  const isOBS = searchParams.get('mode') === 'obs';

  const [elements, setElements] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [activeBookings, setActiveBookings] = useState<any[]>([]);
  const [approvedQueuedBookings, setApprovedQueuedBookings] = useState<any[]>([]);
  const [queueCounts, setQueueCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [myBookings, setMyBookings] = useState<any[]>([]);
  const [expiringSoon, setExpiringSoon] = useState<Set<string>>(new Set());
  const [savedViewerName, setSavedViewerName] = useState<string | null>(null);
  const [nameConfirmed, setNameConfirmed] = useState(false);
  const [showChangeName, setShowChangeName] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [isQueue, setIsQueue] = useState(false);
  const [isExtend, setIsExtend] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageValid, setImageValid] = useState(false);
  const [message, setMessage] = useState('');
  const [duration, setDuration] = useState(30);
  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ text: string; type: string } | null>(null);

  const supabase = useRef(createClient()).current;
  const viewerNameRef = useRef('');

  useEffect(() => {
    if (!isOBS && !username) window.location.href = '/search';
  }, [username, isOBS]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEWER_NAME_KEY);
      if (saved) { setSavedViewerName(saved); viewerNameRef.current = saved; setNameConfirmed(true); }
    } catch {}
  }, []);

  const confirmName = (name: string) => {
    try { localStorage.setItem(VIEWER_NAME_KEY, name); } catch {}
    setSavedViewerName(name);
    viewerNameRef.current = name;
    setNameConfirmed(true);
  };

  const showNotification = (text: string, type: string) => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 6000);
  };

  const loadData = useCallback(async (profId: string, nameOverride?: string) => {
    const name = nameOverride ?? viewerNameRef.current;
    const [{ data: els }, { data: active }, { data: aq }, { data: queued }] = await Promise.all([
      supabase.from('overlay_elements').select('*').eq('profile_id', profId),
      supabase.from('bookings').select('*').eq('profile_id', profId).eq('status', 'active'),
      supabase.from('bookings').select('*').eq('profile_id', profId).eq('status', 'approved_queued').order('approved_at', { ascending: true }),
      supabase.from('bookings').select('element_id').eq('profile_id', profId).eq('status', 'pending'),
    ]);
    setElements(els || []);
    setActiveBookings(active || []);
    setApprovedQueuedBookings(aq || []);
    const counts: Record<string, number> = {};
    (queued || []).forEach((b: any) => { if (b.element_id) counts[b.element_id] = (counts[b.element_id] || 0) + 1; });
    setQueueCounts(counts);
    if (name) {
      const { data: mine } = await supabase.from('bookings').select('*')
        .eq('profile_id', profId).eq('viewer_name', name)
        .in('status', ['pending', 'active', 'approved_queued', 'denied'])
        .order('created_at', { ascending: false });
      const relevant = (mine || []).filter((b: any) => b.status !== 'denied' || Date.now() - new Date(b.created_at).getTime() < 30000);
      setMyBookings(relevant);
    }
  }, [supabase]);

  useEffect(() => {
    if (!username) return;
    let cleanup: (() => void) | undefined;
    const init = async () => {
      const { data: prof } = await supabase.from('profiles').select('*').eq('username', username).single();
      setProfile(prof);
      if (prof) {
        const saved = (() => { try { return localStorage.getItem(VIEWER_NAME_KEY) || ''; } catch { return ''; } })();
        viewerNameRef.current = saved;
        await loadData(prof.id, saved);
        setLoading(false);
        const channel = supabase.channel(`overlay_${prof.id}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'overlay_elements', filter: `profile_id=eq.${prof.id}` }, () => loadData(prof.id))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `profile_id=eq.${prof.id}` }, () => loadData(prof.id))
          .subscribe();
        cleanup = () => { supabase.removeChannel(channel); };
      } else { setLoading(false); }
    };
    init();
    return () => { if (cleanup) cleanup(); };
  }, [username, supabase, loadData]);

  const prevMyBookingsRef = useRef<any[]>([]);
  useEffect(() => {
    const prev = prevMyBookingsRef.current;
    myBookings.forEach(booking => {
      const old = prev.find((b: any) => b.id === booking.id);
      if (!old) return;
      if (old.status === 'pending' && booking.status === 'denied') showNotification('Your request was denied', 'denied');
      if (old.status === 'pending' && booking.status === 'active') showNotification('Your beam is live! 🎉', 'success');
      if (old.status === 'pending' && booking.status === 'approved_queued') showNotification("Approved — you're in the queue!", 'queue');
    });
    prevMyBookingsRef.current = myBookings;
  }, [myBookings]);

  const getActiveBookingForSlot = (id: string) => activeBookings.find((b: any) => b.element_id === id) || null;
  const getMyBookingForSlot = (id: string) => myBookings.find((b: any) => b.element_id === id && b.status !== 'denied') || null;

  const openSlot = (el: any, joinQueue: boolean, extend = false) => {
    setSelectedSlot(el);
    setIsQueue(joinQueue);
    setIsExtend(extend);
    setImageUrl('');
    setImageValid(false);
    setMessage('');
    const maxDur = el.max_duration_minutes;
    setDuration(maxDur ? Math.min(30, maxDur) : 30);
    if (extend) {
      const myBooking = getMyBookingForSlot(el.id);
      if (myBooking?.image_url) { setImageUrl(myBooking.image_url); setImageValid(true); }
    }
  };

  const closeSlot = () => { setSelectedSlot(null); setIsExtend(false); };

  const setDurationClamped = (val: number) => {
    const max = selectedSlot?.max_duration_minutes;
    setDuration(max ? Math.min(val, max) : val);
  };

  const submitBooking = async () => {
    if (!savedViewerName || !imageUrl || !selectedSlot) return;
    setSubmitting(true);
    const { data: existing } = await supabase.from('bookings').select('id')
      .eq('profile_id', profile.id).eq('element_id', selectedSlot.id)
      .eq('viewer_name', savedViewerName).eq('status', 'pending').single();
    if (existing) {
      setSubmitting(false);
      showNotification('You already have a pending request for this slot', 'warning');
      closeSlot();
      return;
    }
    const currentQueue = queueCounts[selectedSlot.id] || 0;
    const { error } = await supabase.from('bookings').insert({
      profile_id: profile.id, element_id: selectedSlot.id,
      viewer_name: savedViewerName, image_url: imageUrl, message,
      price_value: selectedSlot.price_value, price_unit: selectedSlot.price_unit,
      duration_minutes: duration, status: 'pending',
      queue_position: (isQueue || isExtend) ? currentQueue + 1 : null,
      is_queued: isQueue || isExtend,
    });
    setSubmitting(false);
    if (!error) {
      closeSlot();
      showNotification(isExtend ? 'Extension requested!' : isQueue ? 'Request sent — streamer will review' : 'Request sent!', isQueue || isExtend ? 'queue' : 'success');
      if (profile?.id) await loadData(profile.id, savedViewerName);
    }
  };

  const estimatedCost = selectedSlot
    ? selectedSlot.price_unit === 'min'
      ? (selectedSlot.price_value * duration).toFixed(0)
      : (selectedSlot.price_value * (duration / 60)).toFixed(2)
    : '0';

  const accentColor = isExtend ? '#eab308' : isQueue ? '#F58220' : '#06b6d4';
  const visibleMyBookings = myBookings.filter((b: any) => b.status !== 'denied');

  const notifStyles: Record<string, any> = {
    success: { background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.25)', color: '#06b6d4' },
    queue:   { background: 'rgba(245,130,32,0.1)', border: '1px solid rgba(245,130,32,0.25)', color: '#F58220' },
    denied:  { background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171' },
    warning: { background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)', color: '#facc15' },
  };

  if (loading) return null;
  if (!isOBS && !nameConfirmed) return <NameEntryScreen onConfirm={confirmName} />;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.2} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .overlay-page { min-height: 100vh; background: ${isOBS ? 'transparent' : '#050505'}; color: #e8e8e8; font-family: 'Syne', sans-serif; }

        /* NAV */
        .ov-nav { display: flex; align-items: center; justify-content: space-between; padding: 0 32px; height: 60px; border-bottom: 1px solid #0d0d0d; background: rgba(5,5,5,0.94); backdrop-filter: blur(20px); position: sticky; top: 0; z-index: 50; }
        .ov-nav-logo { display: flex; align-items: center; gap: 8px; text-decoration: none; }
        .ov-nav-wm { font-size: 18px; font-weight: 800; color: #F58220; letter-spacing: -0.5px; }
        .ov-nav-right { display: flex; align-items: center; gap: 12px; }
        .notif-pill { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 1px; padding: 5px 12px; border-radius: 20px; animation: fadeIn .3s ease; white-space: nowrap; max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
        .viewer-chip { display: flex; align-items: center; gap: 7px; background: rgba(255,255,255,0.04); border: 1px solid #1c1c1c; border-radius: 20px; padding: 5px 12px; cursor: pointer; transition: border-color .2s; }
        .viewer-chip:hover { border-color: #333; }
        .viewer-dot { width: 6px; height: 6px; border-radius: 50%; background: #06b6d4; animation: blink 1.5s infinite; flex-shrink: 0; }
        .viewer-name-text { font-family: 'DM Mono', monospace; font-size: 10px; color: #888; letter-spacing: 0.5px; }

        /* MAIN */
        .ov-main { max-width: 1200px; margin: 0 auto; padding: 20px 24px 40px; }

        /* MY BEAMS BAR */
        .my-beams { background: #080808; border: 1px solid #111; border-radius: 12px; padding: 14px 18px; margin-bottom: 16px; animation: fadeIn .3s ease; }
        .my-beams-label { font-family: 'DM Mono', monospace; font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: #444; margin-bottom: 10px; }
        .my-beams-list { display: flex; flex-wrap: wrap; gap: 8px; }
        .beam-status-chip { display: flex; align-items: center; gap: 8px; border-radius: 10px; padding: 7px 12px; border: 1px solid; font-size: 12px; }

        /* STREAM CANVAS */
        .stream-canvas { position: relative; width: 100%; aspect-ratio: 16/9; border-radius: 14px; border: 1px solid #1c1c1c; background: #050505; overflow: hidden; margin-bottom: 12px; }

        /* SLOT CARDS */
        .slots-section { margin-top: 24px; }
        .slots-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #444; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
        .slots-label::before { content: ''; display: block; width: 16px; height: 1px; background: #333; }
        .slots-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
        .slot-card { background: #080808; border: 1px solid #161616; border-radius: 12px; padding: 16px; cursor: pointer; transition: all .2s; display: flex; align-items: center; gap: 12px; }
        .slot-card:hover:not(.disabled) { border-color: #2a2a2a; transform: translateY(-1px); }
        .slot-card.disabled { cursor: default; opacity: 0.6; }
        .slot-thumb { width: 40px; height: 40px; border-radius: 8px; overflow: hidden; background: #050505; border: 1px solid #1c1c1c; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 16px; }
        .slot-info { flex: 1; min-width: 0; }
        .slot-type { font-family: 'DM Mono', monospace; font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: #444; margin-bottom: 3px; }
        .slot-price { font-family: 'DM Mono', monospace; font-size: 13px; font-weight: 500; }

        /* BOOKING FORM */
        .booking-form { background: #080808; border-radius: 14px; padding: 24px; margin-top: 12px; animation: fadeIn .25s ease; }
        .bf-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; }
        .bf-type { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 4px; }
        .bf-price { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
        .bf-close { background: none; border: none; color: #444; cursor: pointer; font-size: 18px; padding: 4px; transition: color .2s; }
        .bf-close:hover { color: #e8e8e8; }
        .bf-field { margin-bottom: 16px; }
        .bf-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #555; display: block; margin-bottom: 8px; }
        .bf-input { width: 100%; background: #050505; border: 1px solid #1c1c1c; border-radius: 10px; padding: 12px 16px; font-size: 14px; color: #e8e8e8; outline: none; font-family: 'Syne', sans-serif; transition: border-color .2s; }
        .bf-input::placeholder { color: #333; }
        .bf-hint { font-family: 'DM Mono', monospace; font-size: 10px; margin-top: 6px; }
        .bf-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .duration-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .dur-btn { font-family: 'DM Mono', monospace; font-size: 10px; padding: 8px 14px; border-radius: 8px; border: 1px solid #1c1c1c; background: none; color: #555; cursor: pointer; transition: all .2s; }
        .dur-btn:hover { border-color: #333; color: #e8e8e8; }
        .bf-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 16px; border-top: 1px solid #111; margin-top: 8px; }
        .bf-cost-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #444; }
        .bf-cost-val { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin-top: 2px; }
        .bf-submit { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 14px; text-transform: uppercase; letter-spacing: 0.3px; padding: 13px 28px; border-radius: 10px; border: none; cursor: pointer; transition: all .2s; }
        .bf-submit:disabled { background: #1c1c1c !important; color: #444 !important; cursor: not-allowed; }
        .bf-submit:hover:not(:disabled) { transform: translateY(-1px); }

        /* Name change inline */
        .name-change-input { background: rgba(255,255,255,0.05); border: 1px solid rgba(245,130,32,0.3); border-radius: 8px; padding: 6px 12px; font-size: 12px; color: #e8e8e8; outline: none; font-family: 'DM Mono', monospace; width: 140px; }

        /* MOBILE */
        @media (max-width: 640px) {
          .ov-nav { padding: 0 16px; }
          .ov-main { padding: 12px 16px 80px; }
          .bf-grid { grid-template-columns: 1fr; }
          .bf-footer { flex-direction: column; align-items: flex-start; gap: 12px; }
          .bf-submit { width: 100%; text-align: center; }
          .slots-grid { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 400px) {
          .slots-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="overlay-page">
        {/* NAV — hidden in OBS mode */}
        {!isOBS && (
          <nav className="ov-nav">
            <a href="/search" className="ov-nav-logo">
              <Logo scale={0.28} />
              <span className="ov-nav-wm">casi</span>
            </a>
            <div className="ov-nav-right">
              {notification && (
                <div className="notif-pill" style={notifStyles[notification.type] || notifStyles.success}>
                  {notification.text}
                </div>
              )}
              {selectedSlot && (
                <button onClick={closeSlot} style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#555', background: 'none', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1.5 }}>
                  Cancel
                </button>
              )}
              {savedViewerName && !selectedSlot && (
                showChangeName ? (
                  <input type="text" defaultValue={savedViewerName} autoFocus className="name-change-input"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value.trim(); if (v) { confirmName(v); setShowChangeName(false); } }
                      if (e.key === 'Escape') setShowChangeName(false);
                    }}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v) confirmName(v); setShowChangeName(false); }}
                  />
                ) : (
                  <div className="viewer-chip" onClick={() => setShowChangeName(true)}>
                    <span className="viewer-dot" />
                    <span className="viewer-name-text">@{savedViewerName}</span>
                  </div>
                )
              )}
            </div>
          </nav>
        )}

        <main className={isOBS ? '' : 'ov-main'}>

          {/* MY ACTIVE BEAMS */}
          {!isOBS && visibleMyBookings.length > 0 && !selectedSlot && (
            <div className="my-beams">
              <div className="my-beams-label">Your beams</div>
              <div className="my-beams-list">
                {visibleMyBookings.map((booking: any) => {
                  const isLive = booking.status === 'active';
                  const isApproved = booking.status === 'approved_queued';
                  const isExpiring = isLive && expiringSoon.has(booking.id);
                  const activeBooking = activeBookings.find((b: any) => b.id === booking.id);
                  const chipStyle = isExpiring
                    ? { background: 'rgba(234,179,8,0.08)', borderColor: 'rgba(234,179,8,0.25)', color: '#facc15' }
                    : isLive
                    ? { background: 'rgba(6,182,212,0.08)', borderColor: 'rgba(6,182,212,0.2)', color: '#06b6d4' }
                    : isApproved
                    ? { background: 'rgba(245,130,32,0.08)', borderColor: 'rgba(245,130,32,0.2)', color: '#F58220' }
                    : { background: 'rgba(255,255,255,0.03)', borderColor: '#1c1c1c', color: '#555' };
                  return (
                    <div key={booking.id} className="beam-status-chip" style={chipStyle}>
                      {booking.image_url && <img src={booking.image_url} style={{ width: 22, height: 22, objectFit: 'contain', borderRadius: 4 }} alt="" />}
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 500, letterSpacing: 0.5 }}>
                        {isExpiring ? '⚠ Expiring' : isLive ? '● Live' : isApproved ? '⏳ Queued' : '⌛ Pending'}
                      </span>
                      {isLive && activeBooking && (
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, opacity: 0.7 }}>
                          <Countdown booking={activeBooking} onWarning={(s) => {
                            if (s <= 120 && s > 0) setExpiringSoon(prev => new Set(prev).add(booking.id));
                            else if (s <= 0) setExpiringSoon(prev => { const n = new Set(prev); n.delete(booking.id); return n; });
                          }} />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STREAM CANVAS */}
          <div className={isOBS ? '' : 'stream-canvas'} style={isOBS ? { position: 'relative', width: '100vw', height: '100vh' } : {}}>
            {elements.map((el: any) => {
              const activeBooking = getActiveBookingForSlot(el.id);
              const isOccupied = !!activeBooking;
              const queueCount = queueCounts[el.id] || 0;
              const isSelected = selectedSlot?.id === el.id;
              const myBookingForSlot = getMyBookingForSlot(el.id);
              const myBookingIsExpiring = myBookingForSlot && expiringSoon.has(myBookingForSlot.id);
              const isLocked = !!el.locked;
              const displayImage = (isSelected && imageValid && imageUrl) ? imageUrl : (el.image_url || null);

              return (
                <div key={el.id} style={{
                  position: 'absolute',
                  left: `${el.pos_x}%`, top: `${el.pos_y}%`,
                  width: `${el.width}%`, height: `${el.height}%`,
                  zIndex: el.is_background ? 10 : 50,
                  transition: 'all 0.35s cubic-bezier(0.16,1,0.3,1)',
                }}>
                  {displayImage ? (
                    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                      <img src={displayImage} style={{ width: '100%', height: '100%', objectFit: el.is_background ? 'cover' : 'fill', pointerEvents: 'none' }} alt="" />
                      {isSelected && imageValid && (
                        <div style={{ position: 'absolute', inset: 0, borderRadius: 4, boxShadow: `inset 0 0 0 2px ${accentColor}80`, pointerEvents: 'none' }} />
                      )}
                    </div>
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: el.is_background ? 12 : 6, border: `1.5px dashed ${isLocked ? 'rgba(248,113,113,0.3)' : isOccupied ? 'rgba(245,130,32,0.3)' : el.is_background ? 'rgba(168,85,247,0.3)' : 'rgba(6,182,212,0.3)'}`, background: isLocked ? 'rgba(248,113,113,0.03)' : isOccupied ? 'rgba(245,130,32,0.03)' : el.is_background ? 'rgba(168,85,247,0.03)' : 'rgba(6,182,212,0.03)' }}>
                      <span style={{ fontSize: el.is_background ? 20 : 14, marginBottom: 4 }}>{isLocked ? '🔒' : isOccupied ? '' : el.is_background ? '🖼' : '✦'}</span>
                      {isOccupied && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(245,130,32,0.7)' }}><Countdown booking={activeBooking} /></span>}
                    </div>
                  )}

                  {/* Slot action buttons — shown on viewer page, not OBS */}
                  {el.price_value > 0 && !isOBS && (
                    <div style={{ position: 'absolute', bottom: el.is_background ? 12 : -52, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, zIndex: 100, whiteSpace: 'nowrap' }}>
                      {/* Price tag */}
                      <div style={{ background: 'rgba(5,5,5,0.92)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 500, color: '#F58220' }}>${el.price_value}/{el.price_unit}</span>
                        {el.max_duration_minutes && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#444' }}>· max {el.max_duration_minutes}m</span>}
                      </div>
                      {/* Action */}
                      {isLocked ? (
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(248,113,113,0.5)', padding: '3px 8px', border: '1px solid rgba(248,113,113,0.15)', borderRadius: 20, background: 'rgba(248,113,113,0.04)' }}>🔒 Locked</span>
                      ) : myBookingForSlot ? (
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, padding: '3px 10px', borderRadius: 20, border: '1px solid', ...(myBookingIsExpiring ? { color: '#facc15', borderColor: 'rgba(234,179,8,0.3)', background: 'rgba(234,179,8,0.08)' } : myBookingForSlot.status === 'active' ? { color: '#06b6d4', borderColor: 'rgba(6,182,212,0.3)', background: 'rgba(6,182,212,0.08)' } : myBookingForSlot.status === 'approved_queued' ? { color: '#F58220', borderColor: 'rgba(245,130,32,0.3)', background: 'rgba(245,130,32,0.08)' } : { color: '#555', borderColor: '#1c1c1c', background: 'rgba(255,255,255,0.03)' }) }}>
                          {myBookingIsExpiring ? '⚠ Expiring' : myBookingForSlot.status === 'active' ? '● Your beam is live' : myBookingForSlot.status === 'approved_queued' ? '⏳ Queued' : '⌛ Pending'}
                        </span>
                      ) : isOccupied ? (
                        <button onClick={() => openSlot(el, true)}
                          style={{ background: '#F58220', border: 'none', borderRadius: 20, padding: '5px 14px', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: '#050505', cursor: 'pointer', transition: 'all .2s' }}>
                          Join queue{queueCount > 0 ? ` (${queueCount})` : ''}
                        </button>
                      ) : !selectedSlot ? (
                        <button onClick={() => openSlot(el, false)}
                          style={{ background: '#06b6d4', border: 'none', borderRadius: 20, padding: '5px 14px', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: '#050505', cursor: 'pointer', transition: 'all .2s', boxShadow: '0 4px 14px rgba(6,182,212,0.25)' }}>
                          Rent this slot
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* BOOKING FORM */}
          {!isOBS && selectedSlot && (
            <div className="booking-form" style={{ border: `1px solid ${accentColor}25` }}>
              <div className="bf-header">
                <div>
                  <div className="bf-type" style={{ color: accentColor }}>
                    {isExtend ? '⏱ Extend slot' : isQueue ? '⏳ Join queue' : '🎯 Rent slot'}
                  </div>
                  <div className="bf-price" style={{ color: accentColor }}>${selectedSlot.price_value}/{selectedSlot.price_unit}</div>
                </div>
                <button className="bf-close" onClick={closeSlot}>✕</button>
              </div>

              <div className="bf-grid">
                <div>
                  <div className="bf-field">
                    <label className="bf-label">Image or GIF URL</label>
                    <input type="text" value={imageUrl} placeholder="https://your-image.png or .gif"
                      className="bf-input" autoFocus={!isExtend}
                      style={{ borderColor: imageValid ? `${accentColor}50` : undefined }}
                      onChange={(e) => { setImageUrl(e.target.value); setImageValid(false); }} />
                    {imageUrl && <img src={imageUrl} style={{ display: 'none' }} alt="" onLoad={() => setImageValid(true)} onError={() => setImageValid(false)} />}
                    <div className={`bf-hint`} style={{ color: imageValid ? accentColor : imageUrl ? '#f87171' : '#444' }}>
                      {imageValid ? '✓ Image loaded — preview showing on stream above' : imageUrl ? 'Image not loading — check URL' : 'Paste a direct image URL'}
                    </div>
                  </div>

                  {/* Viewer name */}
                  <div className="bf-field">
                    <label className="bf-label">Viewing as</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#050505', border: '1px solid #1c1c1c', borderRadius: 10, padding: '10px 14px' }}>
                      <span className="viewer-dot" />
                      <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, flex: 1 }}>@{savedViewerName}</span>
                      <button onClick={() => setShowChangeName(true)} style={{ background: 'none', border: 'none', fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#444', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1 }}>change</button>
                    </div>
                  </div>
                </div>

                <div>
                  {/* Duration */}
                  <div className="bf-field">
                    <label className="bf-label">Duration{selectedSlot.max_duration_minutes ? ` — max ${selectedSlot.max_duration_minutes}m` : ''}</label>
                    <div className="duration-row">
                      <input type="number" min={1} max={selectedSlot.max_duration_minutes || 480} value={duration}
                        className="bf-input" style={{ width: 80 }}
                        onChange={(e) => setDurationClamped(Math.max(1, parseInt(e.target.value) || 1))} />
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#555' }}>min</span>
                      {[15, 30, 60].filter(d => !selectedSlot.max_duration_minutes || d <= selectedSlot.max_duration_minutes).map(d => (
                        <button key={d} className="dur-btn"
                          style={duration === d ? { background: accentColor, borderColor: accentColor, color: '#050505', fontWeight: 700 } : {}}
                          onClick={() => setDurationClamped(d)}>{d}m</button>
                      ))}
                    </div>
                  </div>

                  {/* Message */}
                  <div className="bf-field">
                    <label className="bf-label">Message (optional)</label>
                    <textarea value={message} onChange={(e) => setMessage(e.target.value)}
                      placeholder="Anything for the streamer…" rows={3}
                      className="bf-input" style={{ resize: 'none' }} />
                  </div>
                </div>
              </div>

              <div className="bf-footer">
                <div>
                  <div className="bf-cost-label">Estimated cost</div>
                  <div className="bf-cost-val" style={{ color: accentColor }}>${estimatedCost}</div>
                </div>
                <button onClick={submitBooking} disabled={!imageValid || submitting} className="bf-submit"
                  style={{ background: accentColor, color: '#050505' }}>
                  {submitting ? 'Sending…' : isExtend ? 'Extend' : isQueue ? 'Join Queue' : 'Send Request'}
                </button>
              </div>
            </div>
          )}

          {/* SLOTS LIST */}
          {!isOBS && !selectedSlot && elements.filter((el: any) => el.price_value > 0).length > 0 && (
            <div className="slots-section">
              <div className="slots-label">Available slots</div>
              <div className="slots-grid">
                {elements.filter((el: any) => el.price_value > 0).map((el: any) => {
                  const activeBooking = getActiveBookingForSlot(el.id);
                  const isOccupied = !!activeBooking;
                  const queueCount = queueCounts[el.id] || 0;
                  const myBookingForSlot = getMyBookingForSlot(el.id);
                  const isLocked = !!el.locked;
                  const priceColor = isLocked ? '#555' : myBookingForSlot ? '#555' : isOccupied ? '#F58220' : '#06b6d4';
                  return (
                    <button key={el.id} className={`slot-card ${myBookingForSlot || isLocked ? 'disabled' : ''}`}
                      style={{ borderColor: isOccupied && !myBookingForSlot && !isLocked ? 'rgba(245,130,32,0.15)' : !myBookingForSlot && !isLocked ? 'rgba(6,182,212,0.1)' : undefined }}
                      onClick={() => !myBookingForSlot && !isLocked && openSlot(el, isOccupied)}>
                      <div className="slot-thumb" style={{ borderColor: isOccupied ? 'rgba(245,130,32,0.2)' : 'rgba(6,182,212,0.15)' }}>
                        {el.image_url ? <img src={el.image_url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="" /> : <span>{isLocked ? '🔒' : el.is_background ? '🖼' : '✦'}</span>}
                      </div>
                      <div className="slot-info">
                        <div className="slot-type">{isLocked ? 'Locked' : myBookingForSlot ? myBookingForSlot.status.replace('_', ' ') : isOccupied ? `In use · ${queueCount > 0 ? `${queueCount} waiting` : 'join queue'}` : el.is_background ? 'Full Backdrop' : 'Beam'}</div>
                        <div className="slot-price" style={{ color: priceColor }}>${el.price_value}/{el.price_unit}{el.max_duration_minutes ? ` · max ${el.max_duration_minutes}m` : ''}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer link */}
          {!isOBS && (
            <div style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid #0d0d0d', textAlign: 'center' }}>
              <a href="/search" style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: '#2a2a2a', textDecoration: 'none', transition: 'color .2s' }}
                onMouseOver={(e) => (e.currentTarget.style.color = '#555')}
                onMouseOut={(e) => (e.currentTarget.style.color = '#2a2a2a')}>
                Browse other streams →
              </a>
            </div>
          )}
        </main>
      </div>
    </>
  );
}

export default function PerfectOverlay() {
  return <Suspense fallback={null}><OverlayContent /></Suspense>;
}
