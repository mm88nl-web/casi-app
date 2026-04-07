"use client";
import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Rnd } from 'react-rnd';
import { useRouter } from 'next/navigation';

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
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-black font-mono transition-all ${isExpired ? 'bg-red-500/20 text-red-400 border border-red-500/30' : isWarning ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 animate-pulse' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {isExpired ? 'EXPIRED' : formatTime(seconds)}
    </div>
  );
}

function BackdropModal({ onConfirm, onClose }: {
  onConfirm: (price: number, unit: string, maxDuration: number | null) => void;
  onClose: () => void;
}) {
  const [price, setPrice] = useState(10);
  const [unit, setUnit] = useState('hr');
  const [maxDuration, setMaxDuration] = useState('');
  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[300] p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-8 w-full max-w-sm shadow-2xl">
        <h2 className="text-xl font-black italic uppercase tracking-tighter mb-2">Full Backdrop</h2>
        <p className="text-xs text-gray-500 font-mono mb-6">Creates a full-screen slot. Viewers request their image — you approve before it goes live.</p>
        <div className="space-y-4 mb-6">
          <div>
            <label className="text-[10px] font-mono text-gray-500 uppercase tracking-widest block mb-1">Price</label>
            <div className="flex items-center gap-2">
              <span className="text-cyan-400 font-black">$</span>
              <input type="number" min={1} value={price} onChange={(e) => setPrice(Math.max(1, parseInt(e.target.value) || 1))}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-cyan-500/50 transition-colors" autoFocus />
              <select value={unit} onChange={(e) => setUnit(e.target.value)}
                className="bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-3 text-sm text-white outline-none cursor-pointer">
                <option value="min">/min</option>
                <option value="hr">/hr</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-mono text-gray-500 uppercase tracking-widest block mb-1">Max duration <span className="text-gray-700 normal-case">(minutes, optional)</span></label>
            <input type="number" min={1} value={maxDuration} onChange={(e) => setMaxDuration(e.target.value)} placeholder="No limit"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-cyan-500/50 transition-colors placeholder:text-gray-700" />
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 bg-white/5 hover:bg-white/10 text-gray-400 font-black text-sm py-3 rounded-xl uppercase tracking-widest transition-all">Cancel</button>
          <button onClick={() => onConfirm(price, unit, maxDuration ? parseInt(maxDuration) : null)}
            className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-black font-black text-sm py-3 rounded-xl uppercase tracking-widest transition-all">Create Slot</button>
        </div>
      </div>
    </div>
  );
}

function SlotInfoPanel({ el, activeBooking, queueBookings, onClose, onKick, onLockToggle, onDelete }: {
  el: any; activeBooking: any; queueBookings: any[];
  onClose: () => void; onKick: (b: any) => void;
  onLockToggle: (id: string, locked: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [seconds, setSeconds] = useState(activeBooking ? getSecondsRemaining(activeBooking) : 0);
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
    <div className="fixed inset-0 z-[250] bg-black/40 backdrop-blur-[1px]" onClick={onClose}>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] bg-[#0d0d0d] border border-white/20 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div>
            <p className="text-[9px] font-mono text-gray-500 uppercase tracking-widest">
              {el.is_background ? 'Full Backdrop' : 'Beam Slot'}
              {el.locked && <span className="ml-2 text-red-400">● locked</span>}
            </p>
            <p className="text-sm font-black text-white">${el.price_value}/{el.price_unit}{el.max_duration_minutes ? ` · max ${el.max_duration_minutes}min` : ''}</p>
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-white text-xs font-mono transition-colors w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10">✕</button>
        </div>
        <div className="p-5">
          {activeBooking ? (
            <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg border border-white/10 overflow-hidden bg-black flex-shrink-0">
                  {activeBooking.image_url && <img src={activeBooking.image_url} className="w-full h-full object-contain" alt="" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-white text-sm truncate">● {activeBooking.viewer_name}</p>
                  <p className="text-[9px] font-mono text-gray-500">{activeBooking.duration_minutes} min booked</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-black/50 rounded-lg p-3 text-center">
                  <p className="text-[8px] font-mono text-gray-600 uppercase tracking-widest mb-1">Left</p>
                  <p className="text-base font-black font-mono text-cyan-400">{formatTime(seconds)}</p>
                </div>
                <div className="bg-black/50 rounded-lg p-3 text-center">
                  <p className="text-[8px] font-mono text-gray-600 uppercase tracking-widest mb-1">Earned</p>
                  <p className="text-base font-black text-green-400">${earnedSoFar}</p>
                </div>
                <div className="bg-black/50 rounded-lg p-3 text-center">
                  <p className="text-[8px] font-mono text-gray-600 uppercase tracking-widest mb-1">Total</p>
                  <p className="text-base font-black text-white">${totalValue}</p>
                </div>
              </div>
              {activeBooking.message && <p className="text-[9px] text-gray-500 italic mt-3 pt-3 border-t border-white/5">"{activeBooking.message}"</p>}
              <button onClick={() => onKick(activeBooking)} className="mt-3 w-full text-[9px] font-mono text-red-500/50 hover:text-red-400 uppercase tracking-widest transition-colors">End early</button>
            </div>
          ) : (
            <div className="bg-white/3 border border-white/8 rounded-xl p-3 mb-4 text-center">
              <p className="text-gray-600 font-mono text-[10px]">No active booking</p>
            </div>
          )}
          {queueBookings.length > 0 && (
            <div className="mb-4">
              <p className="text-[9px] font-mono text-gray-500 uppercase tracking-widest mb-2">{queueBookings.length} in queue</p>
              <div className="space-y-1.5">
                {queueBookings.map((b, idx) => (
                  <div key={b.id} className="flex items-center gap-2 bg-orange-500/5 border border-orange-500/15 rounded-lg px-3 py-2">
                    <span className="text-[8px] font-black font-mono text-orange-400/50 w-4">#{idx + 1}</span>
                    <div className="w-5 h-5 rounded overflow-hidden bg-black flex-shrink-0">
                      {b.image_url && <img src={b.image_url} className="w-full h-full object-contain" alt="" />}
                    </div>
                    <span className="text-[10px] font-black text-orange-300 flex-1 truncate">{b.viewer_name}</span>
                    <span className="text-[8px] font-mono text-gray-600">{b.duration_minutes}m</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="pt-3 border-t border-white/8 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black text-white">Lock slot</p>
                <p className="text-[9px] font-mono text-gray-600">No new requests. Current runs to end.</p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); onLockToggle(el.id, !el.locked); }}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${el.locked ? 'bg-red-500' : 'bg-white/15'}`}>
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${el.locked ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
            <button onClick={(e) => { e.stopPropagation(); onDelete(el.id); onClose(); }}
              className="w-full bg-white/5 hover:bg-red-500/20 text-red-400 text-[9px] font-black py-2.5 rounded-lg uppercase transition-all border border-red-500/20">
              Delete slot
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminStudio() {
  const [view, setView] = useState<'studio' | 'requests' | 'settings'>('studio');
  const [profile, setProfile] = useState<any>(null);
  const [elements, setElements] = useState<any[]>([]);
  const [pendingBookings, setPendingBookings] = useState<any[]>([]);
  const [queuedBookings, setQueuedBookings] = useState<any[]>([]);
  const [activeBookings, setActiveBookings] = useState<any[]>([]);
  const [approvedQueued, setApprovedQueued] = useState<any[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Ready");
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [previewBooking, setPreviewBooking] = useState<any>(null);
  const [showBackdropModal, setShowBackdropModal] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [togglingLive, setTogglingLive] = useState(false);

  const monitorRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
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

  useEffect(() => {
    let observer: ResizeObserver | null = null;
    if (view === 'studio') {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => { if (videoRef.current) videoRef.current.srcObject = stream; })
        .catch(() => {});
      if (monitorRef.current) {
        setDimensions({ width: monitorRef.current.clientWidth, height: monitorRef.current.clientHeight });
        observer = new ResizeObserver(entries => {
          for (const e of entries)
            if (e.contentRect.width > 0)
              setDimensions({ width: e.contentRect.width, height: e.contentRect.height });
        });
        observer.observe(monitorRef.current);
      }
    }
    return () => { if (observer) observer.disconnect(); };
  }, [view]);

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
    setSaveStatus("Saving...");
    const s = { ...updates };
    if (s.price_value !== undefined) s.price_value = parseFloat(s.price_value) || 0;
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...s } : el));
    await supabase.from('overlay_elements').update(s).eq('id', id);
    setSaveStatus("Saved");
    setTimeout(() => setSaveStatus("Ready"), 2000);
  }, [supabase]);

  const updateLocalOnly = useCallback((id: string, updates: any) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el));
  }, []);

  const createFullBackdrop = async (price: number, unit: string, maxDuration: number | null) => {
    setShowBackdropModal(false);
    setSaveStatus("Creating...");
    const existing = elements.find(el => el.is_background);
    if (existing) await supabase.from('overlay_elements').delete().eq('id', existing.id);
    const { data } = await supabase.from('overlay_elements').insert({
      profile_id: profile.id, image_url: '', pos_x: 0, pos_y: 0, width: 100, height: 100,
      is_background: true, price_value: price, price_unit: unit, max_duration_minutes: maxDuration, locked: false,
    }).select().single();
    if (data) setElements(prev => [...prev.filter(el => !el.is_background), data]);
    setSaveStatus("Ready");
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
    const { data } = await supabase.from('overlay_elements').insert({
      profile_id: profile.id, image_url: '', pos_x: 10, pos_y: 10, width: 20, height: 20,
      is_background: false, price_value: 0, price_unit: 'min', max_duration_minutes: null, locked: false,
    }).select().single();
    if (data) setElements(prev => [...prev, data]);
  };

  const deleteLayer = async (id: string) => {
    if (selectedSlotId === id) setSelectedSlotId(null);
    await supabase.from('overlay_elements').delete().eq('id', id);
    setElements(prev => prev.filter(el => el.id !== id));
  };

  const clearAll = async () => {
    if (!profile) return;
    setSaveStatus("Clearing...");
    const protectedIds = new Set([...activeBookings.map(b => b.element_id), ...approvedQueued.map(b => b.element_id)]);
    const toDelete = elements.filter(el => !protectedIds.has(el.id));
    if (toDelete.length === 0) { setSaveStatus("Nothing to clear"); setTimeout(() => setSaveStatus("Ready"), 2000); return; }
    await Promise.all(toDelete.map(el => supabase.from('overlay_elements').delete().eq('id', el.id)));
    setElements(prev => prev.filter(el => protectedIds.has(el.id)));
    setSaveStatus(`Cleared ${toDelete.length} slot${toDelete.length > 1 ? 's' : ''}`);
    setTimeout(() => setSaveStatus("Ready"), 2000);
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

  const totalPending = pendingBookings.length + queuedBookings.length;
  const slotOccupiedForPreview = previewBooking ? activeBookings.some(b => b.element_id === previewBooking.element_id) : false;
  const backdropEl = elements.find(el => el.is_background);
  const hasBackdrop = !!backdropEl;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const selectedEl = elements.find(el => el.id === selectedSlotId) || null;

  if (!isReady || !profile) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center">
      <p className="text-cyan-500 font-mono text-sm tracking-widest animate-pulse">INITIALIZING...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans">
      {showBackdropModal && <BackdropModal onConfirm={createFullBackdrop} onClose={() => setShowBackdropModal(false)} />}

      {selectedEl && view === 'studio' && (
        <SlotInfoPanel
          el={selectedEl}
          activeBooking={activeBookings.find(b => b.element_id === selectedEl.id) || null}
          queueBookings={approvedQueued.filter(b => b.element_id === selectedEl.id).sort((a, b) => new Date(a.approved_at).getTime() - new Date(b.approved_at).getTime())}
          onClose={() => setSelectedSlotId(null)}
          onKick={kickBeam} onLockToggle={toggleLock} onDelete={deleteLayer}
        />
      )}

      {previewBooking && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[200] p-6"
          onClick={(e) => { if (e.target === e.currentTarget) setPreviewBooking(null); }}>
          <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-8 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-black italic uppercase tracking-tighter">Review Request</h2>
                {slotOccupiedForPreview && <p className="text-[10px] font-mono text-orange-400 uppercase tracking-widest mt-1">Slot occupied — will be queued</p>}
              </div>
              <button onClick={() => setPreviewBooking(null)} className="text-gray-600 hover:text-white text-xs font-mono uppercase transition-colors">Close</button>
            </div>
            <div className="w-full aspect-video bg-black rounded-xl border border-white/10 overflow-hidden flex items-center justify-center mb-6">
              {previewBooking.image_url ? <img src={previewBooking.image_url} className="max-w-full max-h-full object-contain" alt="" /> : <span className="text-gray-700 font-mono text-sm">No image</span>}
            </div>
            <div className="space-y-3 mb-6">
              {[['From', previewBooking.viewer_name, 'text-white'], ['Price', `$${previewBooking.price_value}/${previewBooking.price_unit}`, 'text-cyan-400'], ['Duration', `${previewBooking.duration_minutes} min`, 'text-white'], ['Total value', `$${calcTotal(previewBooking)}`, 'text-green-400']].map(([label, val, color]) => (
                <div key={label as string} className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">{label}</span>
                  <span className={`font-black ${color}`}>{val}</span>
                </div>
              ))}
              {previewBooking.message && (
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-1">Message</p>
                  <p className="text-sm text-gray-300 italic">"{previewBooking.message}"</p>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => denyBooking(previewBooking.id)} className="flex-1 bg-white/5 hover:bg-red-500/20 text-red-400 font-black text-sm py-3 rounded-xl uppercase tracking-widest transition-all border border-red-500/20">Deny</button>
              <button onClick={() => approveBooking(previewBooking)} className={`flex-1 font-black text-sm py-3 rounded-xl uppercase tracking-widest transition-all ${slotOccupiedForPreview ? 'bg-orange-500 hover:bg-orange-400 text-black' : 'bg-cyan-500 hover:bg-cyan-400 text-black'}`}>
                {slotOccupiedForPreview ? 'Approve → Queue' : 'Approve → Go Live'}
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="flex items-center justify-between px-8 py-4 border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-[100]">
        <div className="flex items-center gap-8">
          <h1 className="text-2xl font-black italic tracking-tighter uppercase">Casi Control</h1>
          <div className="flex gap-4">
            {(['studio', 'requests', 'settings'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={`text-[10px] font-bold uppercase tracking-widest pb-1 transition-colors relative ${view === v ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-500 hover:text-gray-300'}`}>
                {v}
                {v === 'requests' && totalPending > 0 && <span className="absolute -top-2 -right-4 bg-cyan-500 text-black text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center">{totalPending}</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-cyan-500/70 mr-1">[{saveStatus.toUpperCase()}]</span>

          {/* Go live toggle */}
          <button onClick={toggleLive} disabled={togglingLive}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest transition-all ${profile.is_live ? 'bg-red-500/20 border-red-500/40 text-red-400 animate-pulse' : 'bg-white/5 border-white/10 text-gray-500 hover:border-white/20 hover:text-white'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${profile.is_live ? 'bg-red-400' : 'bg-gray-600'}`} />
            {profile.is_live ? '● Live' : 'Go Live'}
          </button>

          {/* Profile link */}
          <a href={`/s/${profile.username}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 bg-white/5 border border-white/10 hover:border-white/20 rounded-full px-3 py-1.5 text-[10px] font-mono text-gray-400 hover:text-white transition-all">
            <span className="text-sm">👤</span>
            @{profile.username}
          </a>

          {view === 'studio' && (
            <div className="flex gap-2 ml-1">
              <button onClick={addBeam} className="bg-cyan-500 hover:bg-cyan-400 text-black text-[10px] font-black py-2 px-4 rounded uppercase shadow-lg shadow-cyan-500/20 transition-all">Add Beam +</button>
              <button onClick={() => hasBackdrop && backdropEl ? setSelectedSlotId(backdropEl.id) : setShowBackdropModal(true)}
                className={`text-[10px] font-black py-2 px-4 rounded uppercase transition-all ${hasBackdrop ? 'bg-purple-500/20 border border-purple-500/40 text-purple-400' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
                {hasBackdrop ? '● Backdrop' : 'Full Backdrop'}
              </button>
              <button onClick={clearAll} className="bg-white/5 hover:bg-red-500/20 text-red-400 text-[10px] font-black py-2 px-4 rounded uppercase transition-all border border-red-500/20">Clear All</button>
            </div>
          )}
        </div>
      </nav>

      <div className="p-8">
        {view === 'studio' && (
          <div className="mx-auto max-w-6xl">
            {activeBookings.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-3">
                {activeBookings.map(booking => {
                  const queueForSlot = approvedQueued.filter(b => b.element_id === booking.element_id);
                  const el = elements.find(e => e.id === booking.element_id);
                  return (
                    <div key={booking.id} onClick={() => setSelectedSlotId(booking.element_id)}
                      className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-2 cursor-pointer hover:border-cyan-500/30 transition-all">
                      {booking.image_url && <img src={booking.image_url} className="w-8 h-8 object-contain rounded-lg" alt="" />}
                      <div>
                        <p className="text-[10px] font-black text-white">{booking.viewer_name}</p>
                        {queueForSlot.length > 0 && <p className="text-[8px] font-mono text-orange-400/60">+{queueForSlot.length} in queue</p>}
                      </div>
                      <BeamTimer booking={booking} onExpire={expireBooking} />
                      {el?.locked && <span className="text-[8px] font-mono text-red-400/60 uppercase">locked</span>}
                    </div>
                  );
                })}
              </div>
            )}
            <div ref={monitorRef} className="relative aspect-video overflow-visible rounded-2xl border border-white/10 bg-black shadow-2xl">
              <video ref={videoRef} autoPlay muted className="absolute inset-0 h-full w-full object-cover z-10 opacity-65 grayscale pointer-events-none rounded-2xl" />
              {dimensions.width > 0 && elements.map((el) => (
                <Rnd key={el.id}
                  style={{ willChange: 'transform' }}
                  size={{ width: el.is_background ? '100%' : `${(el.width / 100) * dimensions.width}px`, height: el.is_background ? '100%' : `${(el.height / 100) * dimensions.height}px` }}
                  position={{ x: el.is_background ? 0 : (el.pos_x / 100) * dimensions.width, y: el.is_background ? 0 : (el.pos_y / 100) * dimensions.height }}
                  onDragStop={(e, d) => updateLayer(el.id, { pos_x: (d.x / dimensions.width) * 100, pos_y: (d.y / dimensions.height) * 100 })}
                  onResizeStop={(e, dir, ref, delta, pos) => updateLayer(el.id, { width: (ref.offsetWidth / dimensions.width) * 100, height: (ref.offsetHeight / dimensions.height) * 100, pos_x: (pos.x / dimensions.width) * 100, pos_y: (pos.y / dimensions.height) * 100 })}
                  disableDragging={el.is_background} enableResizing={!el.is_background} bounds="parent"
                  className={`group ${el.is_background ? 'z-0' : 'z-30'}`}>
                  <div className={`relative h-full w-full ${el.is_background ? '' : 'border-2 border-cyan-500/30'} ${el.locked ? 'opacity-75' : ''}`}>
                    {!el.image_url ? (
                      <div className={`h-full w-full flex flex-col items-center justify-center border-2 border-dashed rounded-lg ${el.locked ? 'border-red-500/40 bg-red-500/5' : el.is_background ? 'border-purple-500/40 bg-purple-500/5' : 'border-cyan-500/40 bg-cyan-500/5'}`}>
                        {el.locked && <span className="text-[10px] font-mono text-red-400/60 uppercase tracking-widest mb-1">🔒 Locked</span>}
                        <span className="text-2xl mb-1">{el.is_background ? '🖼️' : '✦'}</span>
                        <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: el.locked ? 'rgba(239,68,68,0.5)' : el.is_background ? 'rgba(168,85,247,0.6)' : 'rgba(6,182,212,0.6)' }}>
                          {el.locked ? 'No new requests' : el.is_background ? 'Backdrop Available' : 'Beam Available'}
                        </span>
                        {el.price_value > 0 && !el.locked && <span className="text-xs font-black mt-1" style={{ color: el.is_background ? 'rgba(168,85,247,0.9)' : 'rgba(6,182,212,0.9)' }}>${el.price_value}/{el.price_unit}</span>}
                      </div>
                    ) : (
                      <div className="relative h-full w-full">
                        <img src={el.image_url} className="h-full w-full object-fill pointer-events-none" alt="" />
                        {el.locked && <div className="absolute top-2 right-2 bg-red-500/80 text-white text-[8px] font-black px-2 py-1 rounded uppercase">🔒</div>}
                      </div>
                    )}
                    {!el.is_background && (
                      <button onClick={(e) => { e.stopPropagation(); deleteLayer(el.id); }}
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 bg-red-600 hover:bg-red-500 text-white text-[8px] px-2 py-1 rounded transition-all z-30">
                        CLEAR
                      </button>
                    )}
                    <div className={`absolute flex items-center gap-1 bg-black/90 p-1 rounded border border-white/20 shadow-xl z-50 ${el.is_background ? 'bottom-10 left-1/2 -translate-x-1/2 scale-150' : 'left-0 -bottom-10'}`}>
                      <span className="text-[10px] font-bold text-cyan-500">$</span>
                      <input type="number" className="w-10 bg-transparent text-[10px] outline-none text-white border-b border-white/10"
                        value={el.price_value || 0}
                        onChange={(e) => updateLocalOnly(el.id, { price_value: e.target.value })}
                        onBlur={(e) => updateLayer(el.id, { price_value: e.target.value })} />
                      <select className="bg-black text-[10px] outline-none text-white cursor-pointer"
                        value={el.price_unit || (el.is_background ? 'hr' : 'min')}
                        onChange={(e) => updateLayer(el.id, { price_unit: e.target.value })}>
                        <option value="min">/min</option>
                        <option value="hr">/hr</option>
                      </select>
                      <button onClick={(e) => { e.stopPropagation(); setSelectedSlotId(el.id); }}
                        className="ml-1 text-[9px] font-black font-mono text-gray-400 hover:text-white bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded transition-all uppercase">
                        Info
                      </button>
                    </div>
                  </div>
                </Rnd>
              ))}
            </div>
            <p className="text-[10px] font-mono text-gray-700 mt-2 text-center">Hover beam → CLEAR · Click Info or timer chip → slot details</p>
          </div>
        )}

        {view === 'requests' && (
          <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
            {activeBookings.length > 0 && (
              <div>
                <p className="text-xs font-mono text-cyan-500/70 uppercase tracking-widest mb-4">● Live now — {activeBookings.length} active</p>
                <div className="space-y-3">
                  {activeBookings.map(booking => {
                    const queueForSlot = approvedQueued.filter(b => b.element_id === booking.element_id).sort((a, b) => new Date(a.approved_at).getTime() - new Date(b.approved_at).getTime());
                    return (
                      <div key={booking.id} className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-5">
                        <div className="flex gap-4 items-center">
                          <div className="w-16 h-16 rounded-xl border border-white/10 overflow-hidden flex-shrink-0 bg-black">
                            {booking.image_url && <img src={booking.image_url} className="w-full h-full object-contain" alt="" />}
                          </div>
                          <div className="flex-1">
                            <p className="font-black text-white">{booking.viewer_name}</p>
                            <p className="text-xs text-gray-500 font-mono">${booking.price_value}/{booking.price_unit} · {booking.duration_minutes} min</p>
                            {booking.message && <p className="text-xs text-gray-500 italic mt-1">"{booking.message}"</p>}
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <BeamTimer booking={booking} onExpire={expireBooking} />
                            <button onClick={() => kickBeam(booking)} className="text-[9px] font-mono text-red-500/50 hover:text-red-400 uppercase tracking-widest transition-colors">End early</button>
                          </div>
                        </div>
                        {queueForSlot.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
                            {queueForSlot.map((next, idx) => (
                              <div key={next.id} className="flex items-center gap-3">
                                <span className="text-[8px] font-black font-mono text-orange-400/50 w-6">#{idx + 1}</span>
                                <div className="w-7 h-7 rounded-lg border border-orange-500/20 overflow-hidden bg-black flex-shrink-0">
                                  {next.image_url && <img src={next.image_url} className="w-full h-full object-contain" alt="" />}
                                </div>
                                <p className="text-[10px] font-mono text-orange-400/70">
                                  <span className="text-orange-400 font-black">{next.viewer_name}</span>
                                  {idx === 0 ? ' — auto-starts when timer ends' : ` — position #${idx + 1}`}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {approvedQueued.length > 0 && (
              <div>
                <p className="text-xs font-mono text-orange-500/70 uppercase tracking-widest mb-4">⏳ Approved — waiting in queue</p>
                <div className="space-y-3">
                  {approvedQueued.map(booking => {
                    const pos = getQueuePosition(booking);
                    return (
                      <div key={booking.id} className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-5 flex gap-4 items-center">
                        <span className="text-lg font-black font-mono text-orange-400/40 w-8 text-center">#{pos}</span>
                        <div className="w-14 h-14 rounded-xl border border-white/10 overflow-hidden flex-shrink-0 bg-black">
                          {booking.image_url && <img src={booking.image_url} className="w-full h-full object-contain" alt="" />}
                        </div>
                        <div className="flex-1">
                          <p className="font-black text-white">{booking.viewer_name}</p>
                          <p className="text-xs text-gray-500 font-mono">${booking.price_value}/{booking.price_unit} · {booking.duration_minutes} min</p>
                        </div>
                        <span className="text-[10px] font-mono text-orange-400/60 uppercase tracking-widest">{pos === 1 ? 'Auto-starting next' : `Queue #${pos}`}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {(pendingBookings.length > 0 || queuedBookings.length > 0) && (
              <div className="space-y-4">
                {pendingBookings.length > 0 && <p className="text-xs font-mono text-gray-500 uppercase tracking-widest">🎯 Wants slot now — {pendingBookings.length}</p>}
                {pendingBookings.map((booking) => (
                  <div key={booking.id} className="bg-white/5 border border-white/10 rounded-2xl p-6 flex gap-5 items-start hover:border-white/20 transition-all">
                    <button onClick={() => setPreviewBooking(booking)} className="w-20 h-20 rounded-xl border border-white/10 overflow-hidden flex-shrink-0 bg-black flex items-center justify-center hover:border-cyan-500/40 transition-all group/img">
                      {booking.image_url ? <img src={booking.image_url} className="w-full h-full object-contain group-hover/img:scale-105 transition-transform" alt="" /> : <span className="text-gray-700 text-xs font-mono">No img</span>}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-black text-white text-lg">{booking.viewer_name}</p>
                        <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full">${booking.price_value}/{booking.price_unit}</span>
                        <span className="text-[10px] font-mono text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">${calcTotal(booking)} total</span>
                      </div>
                      <p className="text-xs text-gray-500 font-mono mb-2">{booking.duration_minutes} min</p>
                      {booking.message && <p className="text-sm text-gray-400 italic border-l-2 border-white/10 pl-3">"{booking.message}"</p>}
                      <button onClick={() => setPreviewBooking(booking)} className="text-[10px] font-mono text-cyan-500/60 hover:text-cyan-400 uppercase tracking-widest transition-colors mt-2">Preview →</button>
                    </div>
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button onClick={() => approveBooking(booking)}
                        className={`text-black text-[10px] font-black px-5 py-2 rounded-xl uppercase transition-all ${activeBookings.some(b => b.element_id === booking.element_id) ? 'bg-orange-500 hover:bg-orange-400' : 'bg-cyan-500 hover:bg-cyan-400'}`}>
                        {activeBookings.some(b => b.element_id === booking.element_id) ? 'Queue' : 'Approve'}
                      </button>
                      <button onClick={() => denyBooking(booking.id)} className="bg-white/5 hover:bg-red-500/20 text-red-400 text-[10px] font-black px-5 py-2 rounded-xl uppercase transition-all border border-red-500/20">Deny</button>
                    </div>
                  </div>
                ))}
                {queuedBookings.length > 0 && <p className="text-xs font-mono text-orange-500/60 uppercase tracking-widest pt-2">⏳ Wants next slot — {queuedBookings.length}</p>}
                {queuedBookings.map((booking) => (
                  <div key={booking.id} className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-6 flex gap-5 items-start hover:border-orange-500/30 transition-all">
                    <button onClick={() => setPreviewBooking(booking)} className="w-20 h-20 rounded-xl border border-white/10 overflow-hidden flex-shrink-0 bg-black flex items-center justify-center hover:border-orange-500/40 transition-all group/img">
                      {booking.image_url ? <img src={booking.image_url} className="w-full h-full object-contain group-hover/img:scale-105 transition-transform" alt="" /> : <span className="text-gray-700 text-xs font-mono">No img</span>}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-black text-white text-lg">{booking.viewer_name}</p>
                        <span className="text-[10px] font-mono text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full">Queue #{booking.queue_position}</span>
                        <span className="text-[10px] font-mono text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">${calcTotal(booking)} total</span>
                      </div>
                      <p className="text-xs text-gray-500 font-mono mb-2">{booking.duration_minutes} min</p>
                      {booking.message && <p className="text-sm text-gray-400 italic border-l-2 border-orange-500/20 pl-3">"{booking.message}"</p>}
                      <button onClick={() => setPreviewBooking(booking)} className="text-[10px] font-mono text-orange-500/60 hover:text-orange-400 uppercase tracking-widest transition-colors mt-2">Preview →</button>
                    </div>
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button onClick={() => approveBooking(booking)} className="bg-orange-500 hover:bg-orange-400 text-black text-[10px] font-black px-5 py-2 rounded-xl uppercase transition-all">Approve queue</button>
                      <button onClick={() => denyBooking(booking.id)} className="bg-white/5 hover:bg-red-500/20 text-red-400 text-[10px] font-black px-5 py-2 rounded-xl uppercase transition-all border border-red-500/20">Deny</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {totalPending === 0 && activeBookings.length === 0 && approvedQueued.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 border border-dashed border-white/10 rounded-2xl">
                <p className="text-gray-600 font-mono text-sm">Waiting for viewers to send requests...</p>
              </div>
            )}
          </div>
        )}

        {view === 'settings' && (
          <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-4">
            <div className="p-6 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-4">
              <div className="w-12 h-12 rounded-full border border-white/10 overflow-hidden bg-white/5 flex-shrink-0 flex items-center justify-center text-xl">
                {profile.avatar_url ? <img src={profile.avatar_url} className="w-full h-full object-cover" alt="" /> : '👤'}
              </div>
              <div className="flex-1">
                <p className="font-black text-white">{profile.display_name || profile.username}</p>
                <p className="text-gray-500 font-mono text-xs">@{profile.username}</p>
                {profile.bio && <p className="text-gray-600 text-xs mt-1">{profile.bio}</p>}
              </div>
              <a href={`/s/${profile.username}`} target="_blank" rel="noopener noreferrer"
                className="text-[10px] font-black text-purple-400 uppercase tracking-widest hover:text-purple-300 transition-colors whitespace-nowrap">
                View public profile →
              </a>
            </div>
            <div className="p-6 bg-white/5 border border-white/10 rounded-2xl">
              <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-2">Viewer Page</p>
              <div className="flex items-center gap-3">
                <code className="flex-1 bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-[11px] font-mono text-gray-300 truncate">{origin}/overlay?s={profile.username}</code>
                <button onClick={() => copyUrl(`${origin}/overlay?s=${profile.username}`, 'viewer')} className="bg-white/10 hover:bg-white/20 text-white text-[10px] font-black px-4 py-2 rounded-xl uppercase transition-all whitespace-nowrap">
                  {copiedUrl === 'viewer' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="p-6 bg-white/5 border border-white/10 rounded-2xl">
              <h3 className="font-black italic uppercase text-lg mb-1 text-cyan-400">OBS Setup</h3>
              <p className="text-xs text-gray-500 font-mono mb-5">Add two browser sources in this order</p>
              <div className="mb-5 rounded-xl border border-white/10 overflow-hidden">
                {[['TOP', 'Casi Beams', 'cyan', 'floating, transparent bg'], ['MID', 'Your Camera', 'gray', 'with bg removal filter'], ['BOT', 'Casi Backdrop', 'purple', 'full screen, transparent bg']].map(([pos, name, color, desc]) => (
                  <div key={pos} className={`px-4 py-3 flex items-center gap-3 border-b border-white/10 last:border-0 ${color === 'cyan' ? 'bg-cyan-500/10' : color === 'purple' ? 'bg-purple-500/5' : 'bg-white/5'}`}>
                    <span className={`text-[10px] font-black font-mono px-2 py-0.5 rounded ${color === 'cyan' ? 'text-cyan-400 bg-cyan-500/20' : color === 'purple' ? 'text-purple-400 bg-purple-500/20' : 'text-gray-400 bg-white/10'}`}>{pos}</span>
                    <span className="text-sm font-black text-white">{name}</span>
                    <span className="text-[10px] text-gray-500 font-mono ml-auto">{desc}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                {[['beams', 'cyan'], ['backdrop', 'purple']].map(([layer, color]) => (
                  <div key={layer} className="flex items-center gap-2">
                    <code className={`flex-1 bg-black/50 border rounded-xl px-3 py-2 text-[11px] font-mono truncate ${color === 'cyan' ? 'border-cyan-500/20 text-cyan-300' : 'border-purple-500/20 text-purple-300'}`}>
                      {origin}/obs?s={profile.username}&layer={layer}
                    </code>
                    <button onClick={() => copyUrl(`${origin}/obs?s=${profile.username}&layer=${layer}`, layer)}
                      className={`text-[10px] font-black px-4 py-2 rounded-xl uppercase transition-all whitespace-nowrap ${color === 'cyan' ? 'bg-cyan-500 hover:bg-cyan-400 text-black' : 'bg-purple-500 hover:bg-purple-400 text-white'}`}>
                      {copiedUrl === layer ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                ))}
                <div className="bg-black/30 border border-white/5 rounded-xl px-4 py-3">
                  <p className="text-[10px] font-mono text-gray-500 mb-1">Custom CSS for both sources:</p>
                  <code className="text-[10px] font-mono text-gray-400">body {'{ background-color: rgba(0,0,0,0); }'}</code>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
