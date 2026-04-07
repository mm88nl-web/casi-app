"use client";
import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

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

const VIEWER_NAME_KEY = 'casi_viewer_name';
const ADJECTIVES = ['Cool', 'Fast', 'Bold', 'Wild', 'Epic', 'Slick', 'Dark', 'Neon', 'Hyper', 'Ultra', 'Turbo', 'Mega', 'Swift', 'Storm', 'Blaze'];
const ANIMALS = ['Tiger', 'Panda', 'Fox', 'Wolf', 'Hawk', 'Bear', 'Shark', 'Eagle', 'Viper', 'Lynx', 'Raven', 'Cobra', 'Falcon', 'Bison', 'Orca'];

function generateRandomName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const num = Math.floor(Math.random() * 99) + 1;
  return `${adj}${animal}${num}`;
}

function NameEntryScreen({ onConfirm }: { onConfirm: (name: string) => void }) {
  const [name, setName] = useState(generateRandomName());
  const [showSignInNote, setShowSignInNote] = useState(false);

  return (
    <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-black italic uppercase tracking-tighter leading-none mb-2">Casi</h1>
          <p className="text-gray-600 font-mono text-xs uppercase tracking-widest">Viewer</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-4">
          <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-4">Pick a name for this stream</p>
          <div className="relative mb-2">
            <input type="text" value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && onConfirm(name.trim())}
              maxLength={24} autoFocus
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-black outline-none focus:border-cyan-500/50 transition-colors pr-24" />
            <button onClick={() => setName(generateRandomName())}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-mono text-gray-500 hover:text-cyan-400 uppercase tracking-widest transition-colors">
              ↺ random
            </button>
          </div>
          <p className="text-[9px] font-mono text-gray-600 mb-5">A random name was generated — change it or keep it.</p>
          <button onClick={() => name.trim() && onConfirm(name.trim())} disabled={!name.trim()}
            className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:bg-gray-800 disabled:text-gray-600 text-black font-black text-sm py-3 rounded-xl uppercase tracking-widest transition-all">
            Enter stream →
          </button>
        </div>
        <button onClick={() => setShowSignInNote(!showSignInNote)}
          className="w-full text-center text-[10px] font-mono text-gray-600 hover:text-gray-400 uppercase tracking-widest transition-colors py-2">
          Have an account? Sign in
        </button>
        {showSignInNote && (
          <div className="mt-3 bg-white/3 border border-white/8 rounded-xl p-4 text-center animate-in fade-in duration-200">
            <p className="text-xs font-mono text-gray-500 leading-relaxed">
              Account sign-in coming soon.<br />Your name is saved on this device for now.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

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

  // Redirect if no username
  useEffect(() => {
    if (!isOBS && !username) {
      window.location.href = '/search';
    }
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
      const relevant = (mine || []).filter((b: any) =>
        b.status !== 'denied' || Date.now() - new Date(b.created_at).getTime() < 30000
      );
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
      } else {
        setLoading(false);
      }
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
      if (old.status === 'pending' && booking.status === 'active') showNotification('Your beam is now live! 🎉', 'success');
      if (old.status === 'pending' && booking.status === 'approved_queued') showNotification('Approved — you\'re in the queue!', 'queue');
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

    // Spam protection
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
      showNotification(
        isExtend ? 'Extension requested!' : isQueue ? 'Request sent — streamer will review' : 'Request sent!',
        isQueue || isExtend ? 'queue' : 'success'
      );
      if (profile?.id) await loadData(profile.id, savedViewerName);
    }
  };

  const estimatedCost = selectedSlot
    ? selectedSlot.price_unit === 'min'
      ? (selectedSlot.price_value * duration).toFixed(0)
      : (selectedSlot.price_value * (duration / 60)).toFixed(2)
    : '0';

  const activeForSelected = selectedSlot ? getActiveBookingForSlot(selectedSlot.id) : null;
  const accentColor = isExtend ? '#eab308' : isQueue ? '#f97316' : '#06b6d4';
  const visibleMyBookings = myBookings.filter((b: any) => b.status !== 'denied');

  const notificationColors: Record<string, string> = {
    success: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400',
    queue: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
    denied: 'bg-red-500/10 border-red-500/30 text-red-400',
    warning: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
  };

  if (loading) return null;
  if (!isOBS && !nameConfirmed) return <NameEntryScreen onConfirm={confirmName} />;

  return (
    <div className={`min-h-screen ${isOBS ? 'bg-transparent' : 'bg-[#050505]'} text-white`}>

      {!isOBS && (
        <nav className="flex items-center justify-between px-4 sm:px-8 py-4 border-b border-white/5 bg-black/40 backdrop-blur-xl">
          <a href="/search" className="text-xl sm:text-3xl font-black italic tracking-tighter uppercase leading-none hover:text-cyan-400 transition-colors">Casi</a>
          <div className="flex items-center gap-2 sm:gap-4">
            {notification && (
              <div className={`border text-[10px] sm:text-xs font-mono px-3 py-1.5 rounded-full animate-in fade-in duration-300 max-w-[160px] sm:max-w-none truncate ${notificationColors[notification.type] || notificationColors.success}`}>
                {notification.text}
              </div>
            )}
            {selectedSlot && (
              <button onClick={closeSlot} className="text-[10px] font-mono text-gray-500 hover:text-white uppercase tracking-widest transition-colors">Cancel</button>
            )}
            {savedViewerName && !selectedSlot && (
              showChangeName ? (
                <input type="text" defaultValue={savedViewerName} autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { const val = (e.target as HTMLInputElement).value.trim(); if (val) { confirmName(val); setShowChangeName(false); } }
                    if (e.key === 'Escape') setShowChangeName(false);
                  }}
                  onBlur={(e) => { const val = e.target.value.trim(); if (val) confirmName(val); setShowChangeName(false); }}
                  className="bg-white/5 border border-white/20 rounded-lg px-3 py-1 text-xs text-white outline-none focus:border-cyan-500/50 w-28" />
              ) : (
                <button onClick={() => setShowChangeName(true)}
                  className="flex items-center gap-1.5 bg-white/5 border border-white/10 hover:border-white/20 rounded-full px-3 py-1.5 transition-all">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                  <span className="text-[10px] font-mono text-gray-400">@{savedViewerName}</span>
                </button>
              )
            )}
          </div>
        </nav>
      )}

      <main className={`${isOBS ? 'p-0' : 'px-3 sm:px-6 py-4 sm:py-6'} max-w-6xl mx-auto`}>

        {/* My active beams */}
        {!isOBS && visibleMyBookings.length > 0 && !selectedSlot && (
          <div className="mb-4 p-3 sm:p-4 bg-white/3 border border-white/10 rounded-2xl">
            <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-2">Your beams</p>
            <div className="flex flex-wrap gap-2">
              {visibleMyBookings.map((booking: any) => {
                const activeBooking = activeBookings.find((b: any) => b.id === booking.id);
                const isLive = booking.status === 'active';
                const isApproved = booking.status === 'approved_queued';
                const isExpiring = isLive && expiringSoon.has(booking.id);
                return (
                  <div key={booking.id} className={`flex items-center gap-2 rounded-xl px-3 py-1.5 border text-xs transition-all ${isExpiring ? 'bg-yellow-500/10 border-yellow-500/30 animate-pulse' : isLive ? 'bg-cyan-500/10 border-cyan-500/20' : isApproved ? 'bg-orange-500/10 border-orange-500/20' : 'bg-white/5 border-white/10'}`}>
                    {booking.image_url && <img src={booking.image_url} className="w-6 h-6 object-contain rounded" alt="" />}
                    <span className={`text-[10px] font-black uppercase tracking-widest ${isExpiring ? 'text-yellow-400' : isLive ? 'text-cyan-400' : isApproved ? 'text-orange-400' : 'text-gray-400'}`}>
                      {isExpiring ? '⚠ Expiring' : isLive ? '● Live' : isApproved ? '⏳ Queued' : '⌛ Pending'}
                    </span>
                    {isLive && activeBooking && (
                      <span className="text-[10px] font-mono text-cyan-400/70"><Countdown booking={activeBooking} /></span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Stream view */}
        <div className={`relative ${isOBS ? '' : 'aspect-video rounded-xl sm:rounded-2xl border border-white/10 bg-black shadow-2xl overflow-hidden'}`}>
          {elements.map((el: any) => {
            const activeBooking = getActiveBookingForSlot(el.id);
            const isOccupied = !!activeBooking;
            const queueCount = queueCounts[el.id] || 0;
            const isSelected = selectedSlot?.id === el.id;
            const myBookingForSlot = getMyBookingForSlot(el.id);
            const myBookingIsExpiring = myBookingForSlot && expiringSoon.has(myBookingForSlot.id);
            const isLocked = !!el.locked;
            const maxDur = el.max_duration_minutes;
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
                  <div className="relative w-full h-full">
                    <img src={displayImage} className={`w-full h-full pointer-events-none ${el.is_background ? 'object-cover' : 'object-fill'}`} alt="" />
                    {isSelected && imageValid && (
                      <div className="absolute inset-0 rounded pointer-events-none" style={{ boxShadow: `inset 0 0 0 2px ${accentColor}80` }} />
                    )}
                  </div>
                ) : (
                  <div className={`w-full h-full flex flex-col items-center justify-center rounded-xl border-2 border-dashed ${isLocked ? 'border-red-500/30 bg-red-500/5' : isOccupied ? 'border-orange-500/40 bg-orange-500/5' : el.is_background ? 'border-purple-500/40 bg-purple-500/5' : 'border-cyan-500/40 bg-cyan-500/5'}`}>
                    {isLocked ? <span className="text-[10px] font-mono text-red-400/60 uppercase">🔒 Locked</span> :
                     isOccupied ? <span className="text-xs font-black text-orange-400"><Countdown booking={activeBooking} /></span> :
                     <span className="text-[10px] font-mono uppercase" style={{ color: el.is_background ? 'rgba(168,85,247,0.6)' : 'rgba(6,182,212,0.6)' }}>{el.is_background ? 'Backdrop' : 'Beam'}</span>}
                  </div>
                )}

                {/* Action buttons */}
                {el.price_value > 0 && !isOBS && (
                  <div className="absolute flex flex-col items-center gap-1.5 z-[100]"
                    style={{ bottom: el.is_background ? '1rem' : '-4.5rem', left: '50%', transform: 'translateX(-50%)' }}>
                    <div className="bg-black/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-cyan-500/40 flex items-center gap-1 pointer-events-none whitespace-nowrap">
                      <span className="text-[11px] font-black text-cyan-400">${el.price_value}/{el.price_unit}</span>
                      {maxDur && <span className="text-[9px] font-mono text-gray-500 ml-1">· max {maxDur}m</span>}
                    </div>
                    {isLocked ? (
                      <span className="text-[9px] font-mono text-red-400/60 px-2 py-1 rounded-full border border-red-500/20 bg-red-500/5 whitespace-nowrap">🔒 Locked</span>
                    ) : myBookingForSlot ? (
                      <span className={`text-[9px] font-mono px-3 py-1 rounded-full border whitespace-nowrap ${myBookingIsExpiring ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10 animate-pulse' : myBookingForSlot.status === 'active' ? 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10' : myBookingForSlot.status === 'approved_queued' ? 'text-orange-400 border-orange-500/30 bg-orange-500/10' : 'text-gray-500 border-white/10 bg-white/5'}`}>
                        {myBookingIsExpiring ? '⚠ Expiring' : myBookingForSlot.status === 'active' ? '● Live' : myBookingForSlot.status === 'approved_queued' ? '⏳ Queued' : '⌛ Pending'}
                      </span>
                    ) : isOccupied ? (
                      <button onClick={() => openSlot(el, true)}
                        className="bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-black text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest transition-all whitespace-nowrap touch-manipulation">
                        Join queue{queueCount > 0 ? ` (${queueCount})` : ''}
                      </button>
                    ) : !selectedSlot ? (
                      <button onClick={() => openSlot(el, false)}
                        className="bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-black text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest transition-all shadow-lg shadow-cyan-500/30 whitespace-nowrap touch-manipulation">
                        Rent this slot
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Booking form — full screen on mobile */}
        {!isOBS && selectedSlot && (
          <div className="mt-3 rounded-2xl p-4 sm:p-5 animate-in slide-in-from-bottom-4 duration-300"
            style={{ background: '#0a0a0a', border: `1px solid ${accentColor}40` }}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: accentColor }}>
                  {isExtend ? '⏱ Extend' : isQueue ? '⏳ Join queue' : '🎯 Rent slot'}
                </p>
                <p className="text-lg font-black" style={{ color: accentColor }}>${selectedSlot.price_value}/{selectedSlot.price_unit}</p>
              </div>
              <button onClick={closeSlot} className="text-[10px] font-mono text-gray-600 hover:text-white uppercase tracking-widest transition-colors">Cancel</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-mono text-gray-500 uppercase tracking-widest block mb-1">Image or GIF URL</label>
                <input type="text" value={imageUrl}
                  onChange={(e) => { setImageUrl(e.target.value); setImageValid(false); }}
                  placeholder="https://your-image.png or .gif"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-gray-700"
                  style={{ borderColor: imageValid ? `${accentColor}60` : undefined }}
                  autoFocus={!isExtend} />
                {imageUrl && <img src={imageUrl} className="hidden" alt="" onLoad={() => setImageValid(true)} onError={() => setImageValid(false)} />}
                {imageValid && <p className="text-[10px] font-mono mt-1" style={{ color: accentColor }}>✓ Image loaded</p>}
                {imageUrl && !imageValid && <p className="text-red-400 text-[10px] font-mono mt-1">Image not loading</p>}
              </div>

              {/* Name display */}
              <div className="flex items-center gap-2 bg-white/3 border border-white/8 rounded-xl px-4 py-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 flex-shrink-0" />
                <span className="text-sm text-white font-black flex-1">@{savedViewerName}</span>
                <button onClick={() => setShowChangeName(true)} className="text-[9px] font-mono text-gray-600 hover:text-gray-400 uppercase tracking-widest transition-colors">change</button>
              </div>

              {/* Duration */}
              <div>
                <label className="text-[10px] font-mono text-gray-500 uppercase tracking-widest block mb-1">
                  Duration{selectedSlot.max_duration_minutes ? ` — max ${selectedSlot.max_duration_minutes} min` : ''}
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  <input type="number" min={1} max={selectedSlot.max_duration_minutes || 480} value={duration}
                    onChange={(e) => setDurationClamped(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none" />
                  <span className="text-xs text-gray-500 font-mono">min</span>
                  <div className="flex gap-1">
                    {[15, 30, 60].filter(d => !selectedSlot.max_duration_minutes || d <= selectedSlot.max_duration_minutes).map(d => (
                      <button key={d} onClick={() => setDurationClamped(d)}
                        className={`text-[10px] font-mono px-3 py-2 rounded-lg border transition-all touch-manipulation ${duration === d ? 'text-black' : 'border-white/10 text-gray-500'}`}
                        style={duration === d ? { background: accentColor, borderColor: accentColor } : {}}>
                        {d}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Message */}
              <div>
                <label className="text-[10px] font-mono text-gray-500 uppercase tracking-widest block mb-1">Message (optional)</label>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)}
                  placeholder="Anything for the streamer..." rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-gray-700 resize-none" />
              </div>

              {/* Cost + submit */}
              <div className="flex items-center justify-between pt-1">
                <div>
                  <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">Est. cost</p>
                  <p className="text-lg font-black" style={{ color: accentColor }}>${estimatedCost}</p>
                </div>
                <button onClick={submitBooking} disabled={!imageValid || submitting}
                  className="font-black text-sm py-3 px-6 sm:px-8 rounded-xl uppercase tracking-widest transition-all disabled:bg-gray-800 disabled:text-gray-600 touch-manipulation"
                  style={{ background: (!imageValid || submitting) ? undefined : accentColor, color: (!imageValid || submitting) ? undefined : 'black' }}>
                  {submitting ? 'Sending...' : isExtend ? 'Extend' : isQueue ? 'Join Queue' : 'Send Request'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Slots list */}
        {!isOBS && !selectedSlot && elements.filter((el: any) => el.price_value > 0).length > 0 && (
          <div className="mt-6 sm:mt-8">
            <h2 className="text-xs font-mono text-gray-500 uppercase tracking-widest mb-3">Available Slots</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
              {elements.filter((el: any) => el.price_value > 0).map((el: any) => {
                const activeBooking = getActiveBookingForSlot(el.id);
                const isOccupied = !!activeBooking;
                const queueCount = queueCounts[el.id] || 0;
                const myBookingForSlot = getMyBookingForSlot(el.id);
                const isLocked = !!el.locked;
                return (
                  <button key={el.id}
                    onClick={() => !myBookingForSlot && !isLocked && openSlot(el, isOccupied)}
                    disabled={!!myBookingForSlot || isLocked}
                    className={`flex items-center gap-3 border rounded-xl px-4 py-3 transition-all text-left touch-manipulation ${isLocked ? 'opacity-50 cursor-not-allowed border-red-500/20 bg-red-500/5' : myBookingForSlot ? 'opacity-60 cursor-default border-white/10 bg-white/5' : isOccupied ? 'bg-orange-500/5 border-orange-500/20 hover:border-orange-500/40 active:bg-orange-500/10' : 'bg-white/5 border-white/10 hover:border-cyan-500/40 active:bg-white/10'}`}>
                    {el.image_url ? (
                      <img src={el.image_url} className="w-10 h-10 object-contain rounded-lg flex-shrink-0" alt="" />
                    ) : (
                      <div className={`w-10 h-10 rounded-lg border border-dashed flex items-center justify-center flex-shrink-0 ${isLocked ? 'border-red-500/30' : isOccupied ? 'border-orange-500/30' : el.is_background ? 'border-purple-500/30' : 'border-cyan-500/30'}`}>
                        <span className="text-xs">{isLocked ? '🔒' : el.is_background ? '🖼' : '✦'}</span>
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">
                        {isLocked ? 'Locked' : myBookingForSlot ? myBookingForSlot.status.replace('_', ' ') : isOccupied ? `In use${queueCount > 0 ? ` · ${queueCount} waiting` : ''}` : el.is_background ? 'Full Backdrop' : 'Beam'}
                      </p>
                      <p className={`text-sm font-black ${isLocked ? 'text-red-400/50' : myBookingForSlot ? 'text-gray-400' : isOccupied ? 'text-orange-400' : 'text-cyan-400'}`}>
                        ${el.price_value}/{el.price_unit}
                        {el.max_duration_minutes && !isLocked && <span className="text-xs font-normal ml-1 text-gray-500">· max {el.max_duration_minutes}m</span>}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!isOBS && (
          <div className="mt-8 pt-4 border-t border-white/5 text-center">
            <a href="/search" className="text-[10px] font-mono text-gray-700 hover:text-gray-500 uppercase tracking-widest transition-colors">Browse other streams →</a>
          </div>
        )}
      </main>
    </div>
  );
}

export default function PerfectOverlay() {
  return <Suspense fallback={null}><OverlayContent /></Suspense>;
}
