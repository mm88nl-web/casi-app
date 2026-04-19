"use client";
import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Rnd } from 'react-rnd';
import { useRouter } from 'next/navigation';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import SkinProvider from '@/components/SkinProvider';
import { SKINS } from '@/lib/skins';
import WalletNav from '@/components/WalletNav';
import ChatPanel from '@/components/ChatPanel';
import { WALLET_ADAPTER_CLUSTER, EXPLORER_CLUSTER_QUERY } from '@/lib/solana-network';
import Logo from './_components/Logo';
import SlotMedia from './_components/SlotMedia';
import BeamTimer from './_components/BeamTimer';
import BackdropModal from './_components/BackdropModal';
import SlotInfoPanel from './_components/SlotInfoPanel';
import BeamCtrlPanel from './_components/BeamCtrlPanel';
import FlashCard from './_components/FlashCard';
import PendingRequestCard from './_components/PendingRequestCard';
import QueuedRequestCard from './_components/QueuedRequestCard';
import { getSecondsRemaining, formatTime, fmtDuration } from './_components/time';

// Explicit column list for bookings reads. Swapping `*` for this is belt +
// suspenders alongside the column-level GRANT in 20260423 — if a new
// sensitive column lands on bookings and someone forgets to update the
// REVOKE/GRANT list, clients here still only ask for known columns.
const BOOKING_COLS = 'id, created_at, profile_id, element_id, viewer_name, status, image_url, storage_path, file_type, message, duration_minutes, price_value, price_unit, payment_method, tx_signature, payment_intent_id, original_amount_cents, approved_at, started_at, escrow_pda, viewer_wallet, is_queued, queue_position';
const FLASH_COLS = 'id, created_at, profile_id, viewer_name, status, message, amount_cents, payment_method, tx_signature, payment_intent_id, escrow_pda, viewer_wallet';
// Hard cap per-status list to keep worst-case payload bounded even if a
// streamer somehow accumulates thousands of bookings / flashes pending.
const BOOKING_PAGE_LIMIT = 200;

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
  const [editAllowFreeFlashes, setEditAllowFreeFlashes] = useState(false);
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
  const [pendingFlashes, setPendingFlashes] = useState<any[]>([]);
  // Keyed by flash id: true while the streamer is signing approve/deny on-chain.
  const [settlingSolana, setSettlingSolana] = useState<Record<string, boolean>>({});
  const [flashToast, setFlashToast] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);
  const showFlashToast = (text: string, kind: 'ok' | 'err' = 'ok') => {
    setFlashToast({ text, kind });
    setTimeout(() => setFlashToast(null), 5000);
  };
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
  const [sendingTestFlash, setSendingTestFlash] = useState(false);
  const dragStartPos = useRef<{x:number;y:number}|null>(null);
  const isDragging = useRef(false);

  const router = useRouter();
  const supabase = useRef(createClient()).current;

  // Wallet hooks
  const { wallet, connected: walletConnected, connecting: walletConnecting, connect, publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection: walletConnection } = useConnection();
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
    const { data: { session } } = await supabase.auth.getSession();
    fetch('/api/solana/sync-webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
      },
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
        setEditAllowFreeFlashes(!!prof.allow_free_flashes);
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
      supabase.from('bookings').select(BOOKING_COLS).eq('profile_id', profileId).eq('status', 'pending').order('created_at', { ascending: true }).limit(BOOKING_PAGE_LIMIT),
      supabase.from('bookings').select(BOOKING_COLS).eq('profile_id', profileId).eq('status', 'active').order('started_at', { ascending: false }).limit(BOOKING_PAGE_LIMIT),
      supabase.from('bookings').select(BOOKING_COLS).eq('profile_id', profileId).eq('status', 'approved_queued').order('approved_at', { ascending: true }).limit(BOOKING_PAGE_LIMIT),
    ]);
    const all = pending || [];
    setPendingBookings(all.filter(b => !b.is_queued));
    setQueuedBookings(all.filter(b => b.is_queued));
    setActiveBookings(active || []);
    setApprovedQueued(aq || []);
  }, [supabase]);

  const loadFlashes = useCallback(async (profileId: string) => {
    const { data } = await supabase
      .from('flashes')
      .select(FLASH_COLS)
      .eq('profile_id', profileId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(BOOKING_PAGE_LIMIT);
    setPendingFlashes(data || []);
  }, [supabase]);

  useEffect(() => {
    if (!profile?.id) return;
    loadBookings(profile.id);
    const channel = supabase.channel(`admin_bookings_${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `profile_id=eq.${profile.id}` }, () => loadBookings(profile.id))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, supabase, loadBookings]);

  // Keep local `elements` in sync with overlay_elements DB writes from other
  // contexts (Vercel Cron janitor, queue advance, other admin sessions).
  // Without this, a beam flipping active → expired via cron clears
  // overlay_elements.image_url server-side but the Studio canvas keeps
  // rendering the stale image_url until manual refresh.
  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase.channel(`admin_elements_${profile.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'overlay_elements', filter: `profile_id=eq.${profile.id}` }, (payload: any) => {
        const row = payload.new;
        if (!row?.id) return;
        setElements(prev => prev.map(el => el.id === row.id ? { ...el, ...row } : el));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, supabase]);

  useEffect(() => {
    if (!profile?.id) return;
    loadFlashes(profile.id);
    const channel = supabase.channel(`admin_flashes_${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flashes', filter: `profile_id=eq.${profile.id}` }, () => loadFlashes(profile.id))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, supabase, loadFlashes]);

  /* ── FIX: callback ref so canvas dimensions fire on first mount ── */
  const setMonitorRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const measure = () => {
      if (node.clientWidth > 0) setDimensions({ width: node.clientWidth, height: node.clientHeight });
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(node);
    return () => ro.disconnect();
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
      const { data: next } = await supabase.from('bookings').select('id, element_id, image_url, payment_method')
        .eq('element_id', booking.element_id).eq('status', 'approved_queued')
        .order('approved_at', { ascending: true }).limit(1).single();
      // Solana beams require an explicit start_beam signature from the streamer,
      // so we CANNOT auto-promote them from a timer / background context — the
      // streamer's wallet may not be connected here. Leave the next booking in
      // approved_queued; the admin UI renders a "Start Beam" action for it.
      if (next && next.payment_method !== 'solana') {
        await supabase.from('bookings').update({ status: 'active', started_at: new Date().toISOString() }).eq('id', next.id);
        await supabase.from('overlay_elements').update({ image_url: next.image_url }).eq('id', next.element_id);
        setElements(prev => prev.map(el => el.id === next.element_id ? { ...el, image_url: next.image_url } : el));
      } else {
        // No eligible auto-promotable next booking → clear the slot. For a
        // Solana next-up the streamer will click Start Beam manually.
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

  // Payment is confirmed if Stripe PaymentIntent exists, Solana tx_signature
  // exists, or the booking is on the free tier (no payment required — just
  // moderation approval).
  const isPaymentConfirmed = (b: any) =>
    !!(b.payment_intent_id || b.tx_signature || b.payment_method === 'free' || Number(b.price_value) === 0);

  /**
   * Fire `start_beam` on-chain for a Solana beam booking. The streamer must
   * sign; the on-chain clock then drives the vesting schedule for settle_beam.
   *
   * Throws on wallet / signature errors so the caller can keep the booking in
   * its current status and surface the failure to the streamer — we never
   * want the DB to show "active" when the on-chain state is still "pending".
   * No-op for non-Solana bookings.
   */
  const startSolanaBeamOnChain = async (booking: any) => {
    if (booking.payment_method !== 'solana') return;
    if (!booking.escrow_pda) {
      console.warn('[startSolanaBeam] booking has no escrow_pda — skipping');
      return;
    }
    const anchorWallet = buildAnchorWalletForEscrow();
    if (!anchorWallet) {
      openWalletModal();
      throw new Error('Connect your streamer wallet');
    }
    if (profile?.solana_wallet && publicKey!.toBase58() !== profile.solana_wallet) {
      throw new Error('Connected wallet is not the streamer wallet on file');
    }
    const { CasiEscrowClient } = await import('@/lib/casi-escrow');
    const client = new CasiEscrowClient(walletConnection, anchorWallet, WALLET_ADAPTER_CLUSTER);
    await client.startBeam({ escrowId: booking.id, streamer: publicKey! });
  };

  const approveBooking = async (booking: any) => {
  setPreviewBooking(null);
  const slotOccupied = activeBookings.some(b => b.element_id === booking.element_id);

  if (slotOccupied || booking.is_queued) {
    // Queued: the on-chain beam is NOT started yet — we start it only when
    // the slot becomes live (via Play Now or auto-promotion). DB status just
    // records that the streamer approved the request.
    await supabase
      .from('bookings')
      .update({ status: 'approved_queued', approved_at: new Date().toISOString() })
      .eq('id', booking.id);
  } else {
    // Direct booking: beam goes live immediately. For Solana we MUST fire
    // start_beam on-chain before flipping DB status, so the vesting clock
    // and the UI countdown stay in lockstep. If the chain call fails we
    // bail out and leave the booking in 'pending' for retry.
    try {
      await startSolanaBeamOnChain(booking);
    } catch (err: unknown) {
      const { formatEscrowError } = await import('@/lib/casi-errors');
      showFlashToast(formatEscrowError(err), 'err');
      return;
    }
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
    // Solana: just mark denied in DB. The viewer's overlay subscribes to
    // status changes and auto-calls cancel_escrow (reclaimSolanaEscrow) to
    // pull funds back from the PDA — no on-chain action is required here.
    await supabase.from('bookings').update({ status: 'denied' }).eq('id', id);
  } else {
    // Stripe: void/refund PaymentIntent then mark denied
    const { data: { session } } = await supabase.auth.getSession();
    await fetch('/api/stripe/cancel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ booking_id: id }),
    });
  }
  setPendingBookings(prev => prev.filter(b => b.id !== id));
  setQueuedBookings(prev => prev.filter(b => b.id !== id));
};

  /**
   * Build an AnchorWallet adapter shim for the CasiEscrowClient from the
   * currently connected wallet-adapter wallet. Returns null if the wallet
   * isn't ready to sign.
   */
  const buildAnchorWalletForEscrow = () => {
    if (!publicKey || !signTransaction) return null;
    return {
      publicKey,
      signTransaction,
      signAllTransactions:
        signAllTransactions ||
        (async (txs: any[]) => {
          const out = [];
          for (const tx of txs) out.push(await signTransaction(tx));
          return out;
        }),
    } as any;
  };

  /**
   * Moderate a flash on the Solana rail: viewer-funded escrow PDA is settled
   * by calling `approve_flash` or `deny_flash` on-chain, then the streamer's
   * session tells the DB (/api/flashes/moderate) to flip status after
   * server-side tx verification.
   */
  const moderateSolanaFlash = async (flash: any, action: 'approve' | 'deny') => {
    const anchorWallet = buildAnchorWalletForEscrow();
    if (!anchorWallet) {
      openWalletModal();
      throw new Error('Connect your streamer wallet');
    }
    if (profile?.solana_wallet && publicKey!.toBase58() !== profile.solana_wallet) {
      throw new Error('Connected wallet is not the streamer wallet on file');
    }
    if (!flash.viewer_wallet || !flash.escrow_pda) {
      throw new Error('Flash is missing on-chain metadata');
    }

    setSettlingSolana(prev => ({ ...prev, [flash.id]: true }));
    try {
      const { CasiEscrowClient } = await import('@/lib/casi-escrow');
      const { PublicKey: PK }    = await import('@solana/web3.js');
      const client = new CasiEscrowClient(walletConnection, anchorWallet, WALLET_ADAPTER_CLUSTER);

      const viewerPk   = new PK(flash.viewer_wallet);
      const streamerPk = publicKey!;

      const { sig } =
        action === 'approve'
          ? await client.approveFlash({ escrowId: flash.id, viewer: viewerPk, streamer: streamerPk })
          : await client.denyFlash   ({ escrowId: flash.id, viewer: viewerPk, streamer: streamerPk });

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/flashes/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ flash_id: flash.id, action, tx_signature: sig }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.error) throw new Error(json?.error || 'Server verification failed');
      return sig;
    } finally {
      setSettlingSolana(prev => { const n = { ...prev }; delete n[flash.id]; return n; });
    }
  };

  const approveFlash = async (flash: any) => {
    try {
      if (flash.payment_method === 'solana') {
        const sig = await moderateSolanaFlash(flash, 'approve');
        showFlashToast(`⚡ Approved on-chain · ${sig.slice(0, 8)}…`, 'ok');
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/flashes/moderate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify({ flash_id: flash.id, action: 'approve' }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Approve failed');
        showFlashToast('⚡ Flash approved', 'ok');
      }
      setPendingFlashes(prev => prev.filter(f => f.id !== flash.id));
    } catch (err: unknown) {
      const { formatEscrowError } = await import('@/lib/casi-errors');
      showFlashToast(formatEscrowError(err), 'err');
    }
  };

  const denyFlash = async (flash: any) => {
    try {
      if (flash.payment_method === 'solana') {
        const sig = await moderateSolanaFlash(flash, 'deny');
        showFlashToast(`✕ Denied & refunded · ${sig.slice(0, 8)}…`, 'ok');
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/flashes/moderate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify({ flash_id: flash.id, action: 'deny' }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Deny failed');
        showFlashToast('✕ Flash denied', 'ok');
      }
      setPendingFlashes(prev => prev.filter(f => f.id !== flash.id));
    } catch (err: unknown) {
      const { formatEscrowError } = await import('@/lib/casi-errors');
      showFlashToast(formatEscrowError(err), 'err');
    }
  };

  const kickBeam = useCallback(async (booking: any) => {
    setSelectedSlotId(null);
    setShowInfoPanel(false);
    if (booking.payment_method === 'solana') {
      // Settle the on-chain escrow: streamer receives 100% of the vested
      // portion, viewer receives the unvested portion as a refund. The
      // vault ATA + EscrowState are closed in the same tx.
      const canSettleOnChain =
        booking.escrow_pda && booking.viewer_wallet && publicKey &&
        profile?.solana_wallet && publicKey.toBase58() === profile.solana_wallet;

      if (canSettleOnChain) {
        try {
          const anchorWallet = buildAnchorWalletForEscrow();
          if (!anchorWallet) throw new Error('Wallet not ready to sign');
          const { CasiEscrowClient } = await import('@/lib/casi-escrow');
          const { PublicKey: PK }    = await import('@solana/web3.js');
          const client = new CasiEscrowClient(walletConnection, anchorWallet, WALLET_ADAPTER_CLUSTER);
          await client.settleBeam({
            escrowId: booking.id,
            viewer:   new PK(booking.viewer_wallet),
            streamer: publicKey!,
          });
        } catch (err) {
          // Log and continue to expireBooking — DB still needs to advance
          // the queue even if on-chain settle failed (e.g. already settled
          // by viewer). The escrow_pda remains so the viewer can see it.
          console.error('[kickBeam] settleBeam failed:', err);
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
  }, [expireBooking, publicKey, profile?.solana_wallet, walletConnection, supabase]);

  const copyUrl = (url: string, key: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(key);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const sendTestFlash = async () => {
    if (!profile || sendingTestFlash) return;
    if (!profile.allow_free_flashes) {
      showFlashToast('Enable free Flashes in your profile first, then try again.', 'err');
      return;
    }
    setSendingTestFlash(true);
    try {
      const res = await fetch('/api/flashes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id: profile.id,
          viewer_name: 'Test',
          message: 'Test Flash from your admin panel ✦',
          payment_method: 'free',
        }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Test failed' }));
        showFlashToast(error || 'Test failed', 'err');
      } else {
        showFlashToast('Test Flash sent — approve it in Requests to see it fire on your overlay.', 'ok');
      }
    } catch {
      showFlashToast('Test Flash failed — check your connection.', 'err');
    } finally {
      setSendingTestFlash(false);
    }
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

  const confirmedFlashes = pendingFlashes.filter(f => !!(f.payment_intent_id || f.tx_signature));
  const totalPending = pendingBookings.length + queuedBookings.length + confirmedFlashes.length;
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
        @keyframes springPop { from{opacity:0;transform:scale(0.88) translateY(8px)} to{opacity:1;transform:scale(1) translateY(0)} }
        .flash-toast { position:fixed; bottom:28px; left:50%; transform:translateX(-50%); z-index:9999; padding:12px 20px; border-radius:10px; font-family:'DM Mono',monospace; font-size:11px; letter-spacing:1px; max-width:420px; animation:springPop 0.45s cubic-bezier(0.34,1.56,0.64,1) both; }
        .flash-toast-ok  { background:rgba(74,222,128,0.1); border:1px solid rgba(74,222,128,0.3); color:#4ade80; }
        .flash-toast-err { background:rgba(248,113,113,0.1); border:1px solid rgba(248,113,113,0.3); color:#f87171; }

        .sw { min-height:100vh; background:var(--casi-bg); color:var(--casi-text); font-family:'Syne',sans-serif; display:flex; flex-direction:column; }

        /* NAV */
        .util-bar { display:flex; align-items:center; justify-content:flex-end; gap:14px; padding:0 32px; height:32px; flex-shrink:0; background:rgba(0,0,0,0.25); border-bottom:1px solid rgba(var(--casi-accent-rgb),0.05); }
        .vlink-strip { display:flex; align-items:center; gap:10px; padding:10px 32px; background:rgba(var(--casi-accent-rgb),0.03); border-bottom:1px solid rgba(var(--casi-accent-rgb),0.08); flex-shrink:0; flex-wrap:wrap; }
        .vlink-lbl { font-family:'DM Mono',monospace; font-size:10px; color:var(--casi-text-muted); flex-shrink:0; letter-spacing:1px; text-transform:uppercase; }
        .vlink-url { flex:1; min-width:200px; font-family:'DM Mono',monospace; font-size:11px; color:var(--casi-accent); background:rgba(0,0,0,0.3); border:1px solid rgba(var(--casi-accent-rgb),0.12); border-radius:6px; padding:6px 10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .save-status-txt { font-family:'DM Mono',monospace; font-size:10px; letter-spacing:1px; color:#333; }
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
        .t-flash  { color:#facc15; background:rgba(250,204,21,0.08); border-color:rgba(250,204,21,0.2); }
        .c-flash  { background:rgba(250,204,21,0.04); border-color:rgba(250,204,21,0.15) !important; }
        .badge-flash { color:#facc15; border-color:rgba(250,204,21,0.3); background:rgba(250,204,21,0.06); }
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
          .util-bar { padding:0 12px; height:28px; }
          .top-nav { padding:0 12px; height:52px; }
          .vlink-strip { padding:8px 12px; gap:8px; }
          .vlink-lbl { display:none; }
          .vlink-url { min-width:0; font-size:10px; padding:5px 8px; }
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

        {/* UTILITY BAR — wallet + save status, slim row above the main nav */}
        <div className="util-bar">
          <span className="save-status-txt">{saveStatus}</span>
          <WalletNav />
        </div>

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
          </div>
        </nav>

        {/* VIEWER LINK STRIP — quick-access share + self-test in studio view */}
        {view === 'studio' && (
          <div className="vlink-strip">
            <span className="vlink-lbl">Your viewer link</span>
            <code className="vlink-url">{origin}/overlay?s={profile.username}</code>
            <button
              onClick={() => copyUrl(`${origin}/overlay?s=${profile.username}`, 'vlink')}
              className="btn-sm b-outline"
              style={{ border: '1px solid rgba(var(--casi-accent-rgb),0.25)', color: 'var(--casi-accent)' }}>
              {copiedUrl === 'vlink' ? '✓ Copied' : 'Copy'}
            </button>
            <button
              onClick={sendTestFlash}
              disabled={sendingTestFlash}
              className="btn-sm"
              title={profile.allow_free_flashes ? 'Send a free test Flash to yourself to preview the overlay animation' : 'Enable free Flashes in your profile to test'}
              style={{
                background: 'rgba(var(--casi-accent2-rgb),0.1)',
                color: 'var(--casi-accent2)',
                border: '1px solid rgba(var(--casi-accent2-rgb),0.3)',
                opacity: sendingTestFlash ? 0.6 : 1,
                cursor: sendingTestFlash ? 'wait' : 'pointer',
              }}>
              {sendingTestFlash ? 'Sending…' : '⚡ Test Flash'}
            </button>
          </div>
        )}

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
                {previewBooking.image_url ? <SlotMedia src={previewBooking.image_url} fileType={previewBooking.file_type} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#333' }}>No image</span>}
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

            {/* 3-surface explainer row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, padding: '8px 24px 4px', fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--casi-text-muted)' }}>
              <span><span style={{ color: '#facc15' }}>⚡ Flash</span> = one-shot popup message</span>
              <span><span style={{ color: 'var(--casi-accent2)' }}>✦ Beam</span> = timed image/video in a slot</span>
              <span><span style={{ color: '#c084fc' }}>🖼 Backdrop</span> = full-screen takeover</span>
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
                  body: 'Hit Go Live, copy your viewer link, and share it in your stream chat. Viewers can now tip to display their image or video in your slots.',
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
                  {booking.image_url && <SlotMedia src={booking.image_url} fileType={booking.file_type} style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 6 }} />}
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

        {/* ── STUDIO ──
            Always mounted, hidden via CSS when not active. Unmounting on tab
            switch restarted canvas <SlotMedia> videos, reran the
            ResizeObserver-driven dimension measurement, and reset Rnd
            drag/resize state every time the user came back to studio. */}
        <div className="studio-body" style={{ display: view === 'studio' ? undefined : 'none' }}>

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
                        <SlotMedia src={el.image_url} fileType={null} style={{ width: '100%', height: '100%', objectFit: el.is_background ? 'cover' : 'fill', pointerEvents: 'none' }} />
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
              {elements.length === 0
                ? 'No slots yet — hit + Beam above to let viewers tip to display an image or video here'
                : selectedEl && !selectedEl.is_background
                ? 'Drag beam to move · Use arrows to nudge · Edit price inline'
                : 'Tap a beam to select · Drag to move · Resize from corners'}
            </div>
        </div>

        {/* ── REQUESTS — separated by beam vs backdrop ── */}
        {view === 'requests' && (
          <div className="req-body">

            {/* ── FLASH MESSAGES ── */}
            {pendingFlashes.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 800, color: 'var(--casi-text)', letterSpacing: -0.5 }}>Flash Messages</div>
                  <span className="slot-type-badge badge-flash">⚡ Flashes</span>
                  {confirmedFlashes.length > 0 && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#4ade80' }}>{confirmedFlashes.length} paid</span>}
                </div>
                {pendingFlashes.map(flash => (
                  <FlashCard
                    key={flash.id}
                    flash={flash}
                    settling={!!settlingSolana[flash.id]}
                    onApprove={approveFlash}
                    onDeny={denyFlash}
                  />
                ))}
              </div>
            )}

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
                            {booking.image_url && <SlotMedia src={booking.image_url} fileType={booking.file_type} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--casi-text)', marginBottom: 4 }}>{booking.viewer_name}</div>
                            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--casi-text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span>${booking.price_value}/{booking.price_unit} · {fmtDuration(booking.duration_minutes)}</span>
                              {booking.tx_signature && (
                                <a href={`https://solscan.io/tx/${booking.tx_signature}${EXPLORER_CLUSTER_QUERY}`} target="_blank" rel="noopener noreferrer"
                                  style={{ color: '#9945FF', textDecoration: 'none', fontSize: 10 }}>↗ Solscan</a>
                              )}
                            </div>
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
          {booking.image_url && <SlotMedia src={booking.image_url} fileType={booking.file_type} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
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
  // End current active booking on this slot first — use kickBeam to route
  // Solana beams through settle_beam and Stripe beams through the prorate API.
  // kickBeam also calls expireBooking which advances the queue; since the
  // next candidate on a Solana-rail slot is now intentionally NOT auto-promoted,
  // we always finish by flipping THIS booking to active ourselves.
  const current = activeBookings.find(b => b.element_id === booking.element_id);
  if (current) await kickBeam(current);
  // For Solana: start_beam must land on-chain before the DB shows active.
  if (booking.payment_method === 'solana') {
    try { await startSolanaBeamOnChain(booking); }
    catch (err: unknown) {
      const { formatEscrowError } = await import('@/lib/casi-errors');
      showFlashToast(formatEscrowError(err), 'err');
      return;
    }
  }
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
                      <PendingRequestCard
                        key={booking.id}
                        booking={booking}
                        kind="beam"
                        slotOccupied={activeBookings.some(b => b.element_id === booking.element_id)}
                        paymentConfirmed={isPaymentConfirmed(booking)}
                        calcTotal={calcTotal}
                        onApprove={approveBooking}
                        onDeny={denyBooking}
                        onPreview={setPreviewBooking}
                      />
                    ))}
                  </div>
                )}

                {queuedBeams.length > 0 && (
                  <div>
                    <div className="sec-head" style={{ color: 'rgba(var(--casi-accent-rgb),0.5)' }}>Wants next beam — {queuedBeams.length}</div>
                    {queuedBeams.map(booking => (
                      <QueuedRequestCard
                        key={booking.id}
                        booking={booking}
                        kind="beam"
                        paymentConfirmed={isPaymentConfirmed(booking)}
                        calcTotal={calcTotal}
                        onApprove={approveBooking}
                        onDeny={denyBooking}
                        onPreview={setPreviewBooking}
                      />
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
                          {booking.image_url && <SlotMedia src={booking.image_url} fileType={booking.file_type} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
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
          {booking.image_url && <SlotMedia src={booking.image_url} fileType={booking.file_type} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
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
  const current = activeBookings.find(b => b.element_id === booking.element_id);
  if (current) await kickBeam(current);
  if (booking.payment_method === 'solana') {
    try { await startSolanaBeamOnChain(booking); }
    catch (err: unknown) {
      const { formatEscrowError } = await import('@/lib/casi-errors');
      showFlashToast(formatEscrowError(err), 'err');
      return;
    }
  }
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
                      <PendingRequestCard
                        key={booking.id}
                        booking={booking}
                        kind="backdrop"
                        slotOccupied={activeBookings.some(b => b.element_id === booking.element_id)}
                        paymentConfirmed={isPaymentConfirmed(booking)}
                        calcTotal={calcTotal}
                        onApprove={approveBooking}
                        onDeny={denyBooking}
                        onPreview={setPreviewBooking}
                      />
                    ))}
                  </div>
                )}

                {queuedBackdrop.length > 0 && (
                  <div>
                    <div className="sec-head" style={{ color: 'rgba(192,132,252,0.5)' }}>Wants next backdrop — {queuedBackdrop.length}</div>
                    {queuedBackdrop.map(booking => (
                      <QueuedRequestCard
                        key={booking.id}
                        booking={booking}
                        kind="backdrop"
                        paymentConfirmed={isPaymentConfirmed(booking)}
                        calcTotal={calcTotal}
                        onApprove={approveBooking}
                        onDeny={denyBooking}
                        onPreview={setPreviewBooking}
                      />
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
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: 'var(--casi-text-muted)', marginTop: 5 }}>100% of every tip lands in your Stripe account — no platform fee. Payouts go directly to your bank.</div>
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
                          {solanaWallet ? 'Viewers can pay with USDC on-chain' : 'Optional — Stripe works without this'}
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

                  {/* Free Flashes toggle — gates the Test Flash button on Studio */}
                  <div>
                    <label className="pe-lbl">Free tier <span style={{ letterSpacing: 0, textTransform: 'none', opacity: 0.6 }}>— let viewers send Flashes without paying</span></label>
                    <div style={{ background: 'var(--casi-bg)', border: '1px solid var(--casi-border)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--casi-text)', marginBottom: 2 }}>Allow free Flashes</div>
                        <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: 'var(--casi-text-muted)' }}>Chat messages without payment · 1 per minute per viewer</div>
                      </div>
                      <button type="button" role="switch" aria-checked={editAllowFreeFlashes}
                        onClick={() => setEditAllowFreeFlashes(v => !v)}
                        style={{ position: 'relative', width: 44, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0, background: editAllowFreeFlashes ? 'var(--casi-accent)' : 'rgba(255,255,255,0.12)', transition: 'background .15s' }}>
                        <span style={{ position: 'absolute', top: 2, left: editAllowFreeFlashes ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
                      </button>
                    </div>
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
                      setEditAllowFreeFlashes(!!profile.allow_free_flashes);
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
                          allow_free_flashes: editAllowFreeFlashes,
                        }).eq('id', profile.id);
                        setProfile((p: any) => ({ ...p,
                          display_name: editName || profile.username,
                          bio: editBio || null,
                          avatar_url: editAvatarValid ? editAvatar : null,
                          theme_color: editThemeColor,
                          allow_free_flashes: editAllowFreeFlashes,
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
                <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid #111', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#444', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Dimensions</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--casi-text-muted)' }}>1920 × 1080</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid #111', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#444', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Not updating?</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--casi-text-muted)' }}>Right-click source → Refresh cache</div>
                </div>
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

      {flashToast && (
        <div className={`flash-toast flash-toast-${flashToast.kind}`} role="status">
          {flashToast.text}
        </div>
      )}
    </>
  );
}
