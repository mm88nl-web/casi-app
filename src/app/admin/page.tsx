"use client";
import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Rnd } from 'react-rnd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import SkinProvider from '@/components/SkinProvider';
import WalletNav from '@/components/WalletNav';
import FlashPanel from '@/components/FlashPanel';
import { WALLET_ADAPTER_CLUSTER, EXPLORER_CLUSTER_QUERY } from '@/lib/solana-network';
import {
  trySolanaStartDelegated,
  trySolanaSettleDelegated,
  trySolanaFlashDelegated,
  describeDelegateSettleFailure,
  approveBooking as libApproveBooking,
  denyBooking as libDenyBooking,
  type ModerationContext,
} from '@/lib/streamer-moderation';
import { CasiMark, Wordmark } from '@/components/v9';
import SlotMedia from '@/components/SlotMedia';
import BeamTimer from './_components/BeamTimer';
import SlotInfoPanel from './_components/SlotInfoPanel';
import BeamCtrlPanel from './_components/BeamCtrlPanel';
import FlashCard from './_components/FlashCard';
import PendingRequestCard from './_components/PendingRequestCard';
import QueuedRequestCard from './_components/QueuedRequestCard';
import ActiveCard from './_components/ActiveCard';
import ApprovedQueueCard from './_components/ApprovedQueueCard';
import ProfileEditCard from './_components/ProfileEditCard';
import { getSecondsRemaining, formatTime, fmtDuration } from './_components/time';
import PreviewBookingModal from './_components/PreviewBookingModal';
import OnboardingBanner from './_components/OnboardingBanner';
import SkinPickerCard from './_components/SkinPickerCard';
import ViewerOverlayCard from './_components/ViewerOverlayCard';
import OBSSetupCard from './_components/OBSSetupCard';

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


/* ══════════════════════════════════════════
   MAIN ADMIN PAGE
══════════════════════════════════════════ */
export default function AdminStudio() {
  const [view, setView] = useState<'studio' | 'requests' | 'settings'>('studio');
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
        if (prof.ink_color || prof.theme_color) setEditThemeColor(prof.ink_color || prof.theme_color);
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
    loadFlashes(profile.id);

    // Bump timestamp on each realtime event — watchdog below reloads if
    // the channel goes silent (dropped socket, devnet RPC flap, etc.)
    // for too long, so a missed INSERT doesn't leave the queue stale.
    const lastEventAt = { t: Date.now() };
    const bump = () => { lastEventAt.t = Date.now(); };

    const bookingsChannel = supabase.channel(`admin_bookings_${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `profile_id=eq.${profile.id}` }, () => {
        bump();
        loadBookings(profile.id);
      })
      .subscribe();

    const flashesChannel = supabase.channel(`admin_flashes_${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flashes', filter: `profile_id=eq.${profile.id}` }, () => {
        bump();
        loadFlashes(profile.id);
      })
      .subscribe();

    // Silence watchdog. If we haven't heard from realtime in 30 s, refetch
    // both tables; the query result is authoritative so a dropped WebSocket
    // can't indefinitely hide a new flash from the admin.
    const watchdog = setInterval(() => {
      if (Date.now() - lastEventAt.t > 30_000) {
        bump();
        loadBookings(profile.id);
        loadFlashes(profile.id);
      }
    }, 30_000);

    return () => {
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(flashesChannel);
      clearInterval(watchdog);
    };
  }, [profile?.id, supabase, loadBookings, loadFlashes]);

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

  // Not memoized: this closes over startSolanaBeamOnChain (declared below) and
  // a useCallback wrapper here would need startSolanaBeamOnChain in its deps,
  // which is itself unmemoized. The onExpire prop's identity churn is harmless
  // — BeamTimer keys on booking.id, not callback identity.
  /**
   * Flip a booking to expired, clean its media, and (by default) auto-promote
   * the next approved_queued entry on the same slot.
   *
   * `opts.skipAutoAdvance` is set by playNow's kick path: playNow has already
   * picked which queued booking to start, so letting expireBooking promote
   * the FIRST approved_queued (which may be a different booking) would leave
   * two active bookings on the same slot. Natural expiry, manual kick from
   * the slot card, and the BeamTimer onExpire path all want the default
   * auto-advance behaviour.
   */
  const expireBooking = async (booking: any, opts?: { skipAutoAdvance?: boolean }) => {
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
    if (booking.element_id && !opts?.skipAutoAdvance) {
      const { data: next } = await supabase.from('bookings')
        .select('id, element_id, image_url, payment_method, escrow_pda')
        .eq('element_id', booking.element_id).eq('status', 'approved_queued')
        .order('approved_at', { ascending: true }).limit(1).maybeSingle();

      if (!next) {
        await supabase.from('overlay_elements').update({ image_url: '' }).eq('id', booking.element_id);
        setElements(prev => prev.map(el => el.id === booking.element_id ? { ...el, image_url: '' } : el));
      } else if (next.payment_method === 'solana') {
        // Solana queue: on-chain Pending → Active MUST happen before the DB
        // flip, or settle_beam will revert. startSolanaBeamOnChain tries the
        // server-held delegate first (cranker pays fees, no popup) and falls
        // back to a wallet-signed start_beam if the delegate is missing /
        // revoked / expired / unfunded. If both fail we leave the row in
        // approved_queued and nudge the streamer to click Play Now.
        try {
          await startSolanaBeamOnChain(next);
          await supabase.from('bookings').update({ status: 'active', started_at: new Date().toISOString() }).eq('id', next.id);
          await supabase.from('overlay_elements').update({ image_url: next.image_url }).eq('id', next.element_id);
          setElements(prev => prev.map(el => el.id === next.element_id ? { ...el, image_url: next.image_url } : el));
        } catch (err) {
          console.warn('[expireBooking] Solana auto-promote failed, leaving queued', err);
          await supabase.from('overlay_elements').update({ image_url: '' }).eq('id', booking.element_id);
          setElements(prev => prev.map(el => el.id === booking.element_id ? { ...el, image_url: '' } : el));
          showFlashToast('Next Solana beam ready — click Play Now to start', 'ok');
        }
      } else {
        await supabase.from('bookings').update({ status: 'active', started_at: new Date().toISOString() }).eq('id', next.id);
        await supabase.from('overlay_elements').update({ image_url: next.image_url }).eq('id', next.element_id);
        setElements(prev => prev.map(el => el.id === next.element_id ? { ...el, image_url: next.image_url } : el));
      }
    }
    setActiveBookings(prev => prev.filter(b => b.id !== booking.id));
    if (profile?.id) loadBookings(profile.id);
  };

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

  // Shape-change autosnap. Canvas is 16:9 (OBS standard), so a "pixel-
  // square" slot — what circle / hex need to look balanced — requires
  // width% / height% = 9/16. Keep the current height and shrink width
  // rather than the opposite, so the autosnap never pushes the slot off
  // the bottom edge. Banner snaps to a full-width strip at the bottom
  // of the canvas; backdrop snaps to full-canvas + flips is_background
  // so the /obs?layer=backdrop filter still picks it up. Non-target
  // shape changes (rect/rounded) don't un-snap dimensions — streamers
  // resize manually if they want.
  //
  // Backdrop has a special constraint: at most one per streamer. Picking
  // "Backdrop" on a slot while another backdrop already exists swaps
  // the flag over — the previous backdrop becomes a regular rect so
  // we don't orphan an is_background=true row.
  const handleUpdateShape = useCallback(async (id: string, shape: string) => {
    const el = elements.find(e => e.id === id);
    if (!el) return;
    const patch: Record<string, unknown> = { shape };
    if (shape === 'circle' || shape === 'hex') {
      patch.width = Math.round(Number(el.height) * 9 / 16 * 100) / 100;
    } else if (shape === 'banner') {
      patch.width  = 100;
      patch.height = 8;
      patch.pos_x  = 0;
      patch.pos_y  = 92;
      patch.is_background = false;
    } else if (shape === 'backdrop') {
      patch.width  = 100;
      patch.height = 100;
      patch.pos_x  = 0;
      patch.pos_y  = 0;
      patch.is_background = true;
      // Demote the previous backdrop (if any) so at most one row has
      // is_background=true at a time. We clear its shape too so it
      // doesn't keep pretending to be a backdrop in the picker UI.
      const prior = elements.find(e => e.id !== id && e.is_background);
      if (prior) {
        await updateLayer(prior.id, { is_background: false, shape: 'rect' });
      }
    } else {
      // Shape-change to rect / rounded on a slot that WAS a backdrop
      // needs to unflip is_background; otherwise the OBS filter keeps
      // treating it as the backdrop and it still renders full-canvas.
      if (el.is_background) patch.is_background = false;
    }
    await updateLayer(id, patch);
  }, [elements, updateLayer]);

  const handleUpdateGlow = useCallback((id: string, glow: boolean) => {
    updateLayer(id, { glow_on_start: glow });
  }, [updateLayer]);

  const addBeam = async () => {
    // Beams and backdrops now coexist freely — backdrop is just a shape,
    // not a mutually exclusive top-level entity. Legacy eviction of the
    // existing backdrop on "+ Beam" was a holdover from the old mental
    // model and surprised streamers who had a backdrop set up.
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
    // Guard against deleting a slot that still has bookings attached.
    // The ✕ on the canvas is already hidden for this case in the UI, but
    // the SlotInfoPanel and BeamCtrlPanel Delete buttons also call this —
    // plus the UI check races the realtime feed. Doing it here is the
    // single source of truth: dropping the row without settling leaves
    // USDC locked in the on-chain escrow and orphans queued bookings
    // whose element_id FK becomes dangling.
    const hasActive = activeBookings.some(b => b.element_id === id);
    const hasQueued = approvedQueued.some(b => b.element_id === id);
    if (hasActive || hasQueued) {
      showFlashToast(
        hasActive
          ? 'End the live beam first — delete settles nothing on chain.'
          : 'Clear the queue first — viewers in line have funds locked.',
        'err',
      );
      return;
    }
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

    // Prefer the server-held session-key delegate. If it exists, is healthy,
    // and the on-chain program accepts it (the server will probe all three
    // constraints), the streamer doesn't need to pop open their wallet.
    // Fall back to streamer-signed start_beam if the delegate is missing /
    // expired / revoked / server errored.
    const delegated = await trySolanaStartDelegated(supabase, booking.id);
    if (delegated.ok) return;

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

  /**
   * Sign `set_delegate` on-chain after the server has generated + stored a
   * session keypair. This is the ONE wallet pop-up in the session-key flow —
   * every subsequent Approve is popup-free because the server signs
   * `start_beam_delegated` with the registered session key.
   *
   * Returns the tx's Solscan URL so the card can surface a "view tx" link on
   * success. Throws on signing failure so the card can transition to
   * `needs-finalize` and offer a retry — NEVER regenerates a session key
   * silently, that would leave an orphan secret in the DB.
   */
  const installDelegateOnChain = async (
    sessionPubkey: string,
    expiresAt: number,
  ): Promise<{ solscanUrl: string }> => {
    const anchorWallet = buildAnchorWalletForEscrow();
    if (!anchorWallet) {
      openWalletModal();
      throw new Error('Connect your streamer wallet to finalize the session key');
    }
    if (profile?.solana_wallet && publicKey!.toBase58() !== profile.solana_wallet) {
      throw new Error('Connected wallet is not the streamer wallet on file');
    }
    const { CasiEscrowClient } = await import('@/lib/casi-escrow');
    const { PublicKey }        = await import('@solana/web3.js');
    const client = new CasiEscrowClient(walletConnection, anchorWallet, WALLET_ADAPTER_CLUSTER);
    const { solscanUrl } = await client.setDelegate({
      sessionKey: new PublicKey(sessionPubkey),
      expiresAt,
    });
    return { solscanUrl };
  };

  /**
   * Build a ModerationContext from the admin component's React state.
   * Inline (not memoized) on purpose — the values it captures (wallet hooks,
   * profile, activeBookings) change on every relevant render and a memo'd
   * version with the right deps would invalidate as often as a fresh build.
   */
  const buildModCtx = (): ModerationContext => ({
    supabase,
    connection: walletConnection,
    profile: { id: profile?.id ?? '', solana_wallet: profile?.solana_wallet ?? null },
    activeBookings,
    wallet: publicKey && signTransaction
      ? { publicKey, signTransaction, signAllTransactions }
      : null,
    cluster: WALLET_ADAPTER_CLUSTER as 'devnet' | 'mainnet-beta',
  });

  const approveBooking = async (booking: any) => {
    setPreviewBooking(null);
    const result = await libApproveBooking(buildModCtx(), booking);
    if (!result.ok) {
      showFlashToast(result.message, 'err');
      return;
    }
    // Optimistic UI: lib already wrote the overlay_elements row on the direct
    // path, so mirror that into local element state to skip a refetch.
    if (result.optimistic === 'active' && booking.element_id && booking.image_url) {
      setElements(prev => prev.map(el =>
        el.id === booking.element_id ? { ...el, image_url: booking.image_url } : el
      ));
    }
    setPendingBookings(prev => prev.filter(b => b.id !== booking.id));
    setQueuedBookings(prev => prev.filter(b => b.id !== booking.id));
  };

  /**
   * Streamer-side on-chain action for closing a Solana escrow: probes the PDA
   * and, if it's Active, calls `settle_beam` (viewer gets pro-rata refund;
   * vault + state close). Returns a structured outcome so callers can decide
   * how to update the DB + UI.
   *
   *   'settled'       — settle_beam confirmed, PDA closed
   *   'closed'        — PDA was already gone (previously settled / cancelled)
   *   'pending-chain' — PDA alive but in Pending state; only the viewer can
   *                     call cancel_escrow, streamer is powerless here
   *   'no-wallet'     — streamer's wallet isn't connected or doesn't match
   *                     profile.solana_wallet, so we can't sign
   *   'error'         — unexpected on-chain failure
   */
  const settleOrClearSolanaEscrow = useCallback(async (booking: {
    id: string; escrow_pda?: string | null; viewer_wallet?: string | null;
  }): Promise<{ outcome: 'settled' | 'closed' | 'pending-chain' | 'no-wallet' | 'error'; error?: unknown }> => {
    if (!booking.escrow_pda) return { outcome: 'closed' };
    const { PublicKey } = await import('@solana/web3.js');
    const pdaInfo = await walletConnection
      .getAccountInfo(new PublicKey(booking.escrow_pda))
      .catch(() => null);
    if (!pdaInfo) return { outcome: 'closed' };

    // Short-circuit Pending: settle_beam requires status=Active, so on Pending
    // it reverts with NotActive — skip the wasted signing prompt + tx fee.
    // Status byte lives at offset 161; see EscrowState layout in lib.rs.
    if (pdaInfo.data[161] === 0) return { outcome: 'pending-chain' };

    // Try the delegated crank first — if a healthy session key is installed,
    // the server settles without a wallet pop-up. On failure (no delegate,
    // expired, cranker unfunded, chain revert) we surface the reason and
    // fall through to the wallet-signed path below.
    const delegated = await trySolanaSettleDelegated(supabase, booking.id);
    if (delegated.ok) {
      return { outcome: 'settled' };
    }
    showFlashToast(describeDelegateSettleFailure(delegated), 'err');

    const canSign = !!booking.viewer_wallet && !!publicKey && !!profile?.solana_wallet
      && publicKey.toBase58() === profile.solana_wallet;
    if (!canSign) return { outcome: 'no-wallet' };

    try {
      const anchorWallet = buildAnchorWalletForEscrow();
      if (!anchorWallet) return { outcome: 'no-wallet' };
      const { CasiEscrowClient } = await import('@/lib/casi-escrow');
      const client = new CasiEscrowClient(walletConnection, anchorWallet, WALLET_ADAPTER_CLUSTER);
      await client.settleBeam({
        escrowId: booking.id,
        viewer:   new PublicKey(booking.viewer_wallet!),
        streamer: publicKey!,
      });
      return { outcome: 'settled' };
    } catch (err) {
      // NotActive = escrow is still Pending on-chain. Only the viewer can
      // close it via cancel_escrow; surface that to the caller.
      const { parseCasiError, isAlreadyProcessed } = await import('@/lib/casi-errors');
      if (parseCasiError(err) === 'NotActive') return { outcome: 'pending-chain' };
      // "already processed" = our first submission already landed and the
      // settle succeeded. Treat as success so the caller doesn't toast.
      if (isAlreadyProcessed(err)) return { outcome: 'settled' };
      console.error('[settleOrClearSolanaEscrow] settle_beam failed:', err);
      return { outcome: 'error', error: err };
    }
  }, [walletConnection, publicKey, profile?.solana_wallet]);

  const denyBooking = async (id: string | number, paymentMethod?: string) => {
    setPreviewBooking(null);
    const result = await libDenyBooking(buildModCtx(), id, paymentMethod);
    if (!result.ok) {
      showFlashToast(result.message, 'err');
      return;
    }
    if (paymentMethod === 'solana') {
      // Granular toast based on what the on-chain settle decided. Same three
      // outcomes the standalone helper used to surface inline.
      if (result.denyDetail === 'settled') {
        showFlashToast('✕ Denied & escrow settled on-chain', 'ok');
      } else if (result.denyDetail === 'closed') {
        // PDA was already closed by the time we probed — viewer reclaim,
        // cranker cancelled a stale pending, or no escrow to begin with.
        showFlashToast('✕ Denied — escrow already closed', 'ok');
      } else {
        // pending-chain: only the viewer can cancel_escrow. They see the
        // "✕ Denied — USDC locked" chip with a RECOVER button on /overlay.
        showFlashToast('✕ Denied — viewer can reclaim their USDC from the overlay', 'ok');
      }
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
   * Moderate a flash on the Solana rail.
   *
   * Nominal path: broadcast `approve_flash` / `deny_flash` on-chain with
   * the streamer's wallet, then tell `/api/flashes/moderate` to verify
   * the tx and flip DB status. On-chain state is authoritative; DB
   * never transitions ahead of chain.
   *
   * Two drift-recovery paths handle stuck flashes:
   *
   *   1. No escrow metadata yet (viewer paid but attach-escrow failed,
   *      or never paid at all). Approving is impossible — there's no
   *      vault. Deny is a DB-only flip; there's nothing on-chain to
   *      unwind. Streamer gets the row off their queue without a
   *      pointless chain call or wallet popup.
   *
   *   2. PDA already closed on-chain (a prior approve/deny succeeded
   *      but /api/flashes/moderate failed to land the DB update, so
   *      the row looks pending but the escrow is gone). Pre-probe via
   *      getAccountInfo; if the PDA is missing, route to the DB-only
   *      path instead of trying to sign a tx that will revert with
   *      AccountNotInitialized. Also handle the race where the PDA
   *      disappears mid-flight by catching the Anchor error + falling
   *      back to DB-only.
   */
  const moderateSolanaFlash = async (flash: any, action: 'approve' | 'deny') => {
    setSettlingSolana(prev => ({ ...prev, [flash.id]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authHeader = `Bearer ${session?.access_token}`;

      // Helper: tell the server to flip DB status WITHOUT a chain tx.
      // Used when there's nothing to do on-chain (either never paid or
      // already processed). The server still audits via on-chain probe
      // in db_only mode, so a viewer can't trick the route into denying
      // a flash whose escrow is still live.
      const dbOnlyModerate = async () => {
        const res = await fetch('/api/flashes/moderate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: authHeader },
          body: JSON.stringify({ flash_id: flash.id, action, db_only: true }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.error) throw new Error(json?.error || 'Server update failed');
      };

      // Case 1: no escrow metadata. Approve is impossible; deny is DB-only.
      if (!flash.viewer_wallet || !flash.escrow_pda) {
        if (action === 'deny') {
          await dbOnlyModerate();
          return null;
        }
        throw new Error("Flash hasn't been paid yet — nothing to approve");
      }

      // Case 2: pre-probe the PDA. If it's gone, the flash has already
      // been settled on-chain — skip straight to the DB flip.
      const { PublicKey: PK } = await import('@solana/web3.js');
      const escrowPk = new PK(flash.escrow_pda);
      const pdaInfo = await walletConnection.getAccountInfo(escrowPk).catch(() => null);
      if (!pdaInfo) {
        await dbOnlyModerate();
        return null;
      }

      // Case 3: try the delegate crank first. On success, the chain tx
      // closes the PDA, but the DB flip runs on a different path:
      //   - production: Helius webhook's approve_flash_delegated /
      //     deny_flash_delegated case in /api/webhooks/solana
      //   - local dev (no webhook tunnel): nothing — so we fall through
      //     to dbOnlyModerate, which probes the PDA (now closed) and
      //     flips DB directly. Both paths gate on `status = 'pending'`
      //     so double-writes are idempotent.
      const delegated = await trySolanaFlashDelegated(supabase, flash.id, action);
      if (delegated.ok) {
        await dbOnlyModerate();
        return null;
      }
      showFlashToast(describeDelegateSettleFailure(delegated), 'err');

      // Normal path: wallet-signed approve_flash / deny_flash.
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

      const viewerPk   = new PK(flash.viewer_wallet);
      const streamerPk = publicKey!;

      let sig: string;
      try {
        const result = action === 'approve'
          ? await client.approveFlash({ escrowId: flash.id, viewer: viewerPk, streamer: streamerPk })
          : await client.denyFlash   ({ escrowId: flash.id, viewer: viewerPk, streamer: streamerPk });
        sig = result.sig;
      } catch (err) {
        // Mid-flight drift: PDA disappeared between probe and tx (another
        // tx landed in the gap). Anchor raises AccountNotInitialized /
        // account does not exist variants. Fall back to DB-only.
        const { isAlreadyProcessed } = await import('@/lib/casi-errors');
        const msg = err instanceof Error ? err.message : String(err);
        if (isAlreadyProcessed(err) || /AccountNotInitialized|account.*not.*exist|AlreadySettled/i.test(msg)) {
          const stillThere = await walletConnection.getAccountInfo(escrowPk).catch(() => null);
          if (!stillThere) {
            await dbOnlyModerate();
            return null;
          }
        }
        throw err;
      }

      const res = await fetch('/api/flashes/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
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
        // sig is null on the DB-only drift-recovery path (PDA was
        // already closed on-chain before we got here). Toast reflects
        // that it was reconciled rather than newly approved.
        showFlashToast(
          sig
            ? `⚡ Approved on-chain · ${sig.slice(0, 8)}…`
            : '⚡ Approved (flash was already settled on-chain)',
          'ok',
        );
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
        // sig is null on the DB-only path (either the flash never had
        // an escrow PDA — viewer never completed payment — or the PDA
        // was already closed on-chain by a prior settle).
        showFlashToast(
          sig
            ? `✕ Denied & refunded · ${sig.slice(0, 8)}…`
            : '✕ Denied (no on-chain funds to return)',
          'ok',
        );
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

  // Plain function (not useCallback) because it closes over the unmemoized
  // expireBooking + startSolanaBeamOnChain. Memoizing would capture stale refs.
  /**
   * Returns `true` if the beam was successfully expired (escrow settled or
   * closed, DB flipped), `false` if any step bailed and the beam is still
   * live. Callers (e.g. playNow) MUST honour the boolean — otherwise they
   * proceed to start the next booking with the previous one still active
   * on-chain, leaving two active bookings on the same slot.
   */
  const kickBeam = async (
    booking: any,
    opts?: { skipAutoAdvance?: boolean },
  ): Promise<boolean> => {
    setSelectedSlotId(null);
    setShowInfoPanel(false);
    if (booking.payment_method === 'solana') {
      // Settle the on-chain escrow via the shared probe-first helper: it
      // tries the cranker-signed delegate first, falls back to a wallet pop-
      // up, and reports back WHICH state the escrow ended in. Only `settled`
      // or `closed` are safe to expire in the DB — any other outcome means
      // the PDA is still alive with funds and the beam must stay live until
      // someone finishes the settle. This is the bug fix for the case where
      // the streamer cancels the wallet popup and the beam "disappeared"
      // while funds were still locked on-chain.
      if (booking.escrow_pda && booking.viewer_wallet) {
        const result = await settleOrClearSolanaEscrow({
          id:            booking.id,
          escrow_pda:    booking.escrow_pda,
          viewer_wallet: booking.viewer_wallet,
        });
        if (result.outcome !== 'settled' && result.outcome !== 'closed') {
          if (result.outcome === 'pending-chain') {
            showFlashToast('Escrow still Pending on-chain — viewer must reclaim from overlay', 'err');
          } else if (result.outcome === 'no-wallet') {
            showFlashToast('Connect streamer wallet to end this beam', 'err');
          } else {
            const { formatEscrowError } = await import('@/lib/casi-errors');
            showFlashToast(`End early failed — ${formatEscrowError(result.error)}; beam stays live`, 'err');
          }
          return false;
        }
        // settle_beam confirmed the PDA is closed → null the DB pointer so
        // the viewer's overlay stops surfacing a stale "Recover USDC" chip
        // on an expired row whose refund already landed in their wallet.
        await supabase.from('bookings').update({ escrow_pda: null }).eq('id', booking.id);
      }
      await expireBooking(booking, opts);
      return true;
    }

    // Stripe: prorate via API, then clear image + advance queue. If the
    // server fails to capture (flaky Stripe, disabled Connect account,
    // etc.) it returns non-2xx — keep the beam live so the streamer can
    // retry instead of silently losing the capture.
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/stripe/end-early', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ booking_id: booking.id }),
    });
    if (!res.ok) {
      showFlashToast('End early failed — beam stays live, try again', 'err');
      return false;
    }
    await expireBooking(booking, opts);
    return true;
  };

  // Force-advance a queued booking to active: end the current one on the
  // same slot (settles on-chain for Solana / prorates for Stripe), then
  // flip this booking to active ourselves since queue auto-promotion is
  // disabled on the Solana rail. Plain function (not useCallback) because
  // startSolanaBeamOnChain + showFlashToast aren't memoized, so memoizing
  // here would just capture stale refs.
  const playNow = async (booking: any) => {
    const current = activeBookings.find(b => b.element_id === booking.element_id);
    if (current) {
      // kickBeam returns false when settle bailed (wallet popup cancelled,
      // escrow Pending, chain error). We MUST abort here — proceeding to
      // start_beam on the queued booking would leave the current beam live
      // on-chain AND the queued one active in DB, with two bookings vesting
      // out of the same slot and the streamer's overlay showing whichever
      // image_url won the race. The toast inside kickBeam already explains
      // why the kick stopped.
      //
      // skipAutoAdvance: expireBooking would otherwise auto-promote the
      // FIRST approved_queued booking ordered by approved_at — which may
      // not be the one the streamer just clicked Play Now on. Letting both
      // promotions race leaves two `active` rows on the same element_id.
      // playNow handles its own promotion below.
      const kicked = await kickBeam(current, { skipAutoAdvance: true });
      if (!kicked) return;
    }
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
  };

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

  const confirmedFlashes = pendingFlashes.filter(f => !!(f.payment_intent_id || f.tx_signature));
  // Badge count includes EVERY pending flash, not just paid ones. Free
  // flashes are still real moderation work (the streamer sees them,
  // decides if they air) so they belong in the "you have things to do"
  // count. Old behaviour hid the badge for free-only traffic, which
  // made streamers miss pending messages entirely.
  const totalPending = pendingBookings.length + queuedBookings.length + pendingFlashes.length;
  const slotOccupiedForPreview = previewBooking ? activeBookings.some(b => b.element_id === previewBooking.element_id) : false;
  const backdropEl = elements.find(el => el.is_background);
  const hasBackdrop = !!backdropEl;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const selectedEl = elements.find(el => el.id === selectedSlotId) || null;

  if (!isReady || !profile) return (
    <div style={{ minHeight: '100vh', background: 'var(--casi-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <CasiMark width={120} height={60} />
      <span style={{ fontFamily: 'var(--M)', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink)', animation: 'pulse 1.5s infinite' }}>Loading studio…</span>
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
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--casi-bg); }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes blink  { 0%,100%{opacity:1} 50%{opacity:.2} }
        @keyframes springPop { from{opacity:0;transform:scale(0.88) translateY(8px)} to{opacity:1;transform:scale(1) translateY(0)} }
        .flash-toast { position:fixed; bottom:28px; left:50%; transform:translateX(-50%); z-index:9999; padding:12px 20px; border-radius:10px; font-family:var(--font-casi-mono),monospace; font-size:11px; letter-spacing:1px; max-width:420px; animation:springPop 0.45s cubic-bezier(0.34,1.56,0.64,1) both; }
        .flash-toast-ok  { background:rgba(74,222,128,0.1); border:1px solid rgba(74,222,128,0.3); color:#4ade80; }
        .flash-toast-err { background:rgba(248,113,113,0.1); border:1px solid rgba(248,113,113,0.3); color:#f87171; }

        .sw { min-height:100vh; background:var(--casi-bg); color:var(--casi-text); font-family:var(--font-casi-sans),sans-serif; display:flex; flex-direction:column; }

        /* NAV */
        .util-bar { display:flex; align-items:center; justify-content:flex-end; gap:14px; padding:0 32px; height:32px; flex-shrink:0; background:rgba(0,0,0,0.25); border-bottom:1px solid rgba(var(--casi-accent-rgb),0.05); }
        .vlink-strip { display:flex; align-items:center; gap:10px; padding:10px 32px; background:rgba(var(--casi-accent-rgb),0.03); border-bottom:1px solid rgba(var(--casi-accent-rgb),0.08); flex-shrink:0; flex-wrap:wrap; }
        .vlink-lbl { font-family:var(--font-casi-mono),monospace; font-size:10px; color:var(--casi-text-muted); flex-shrink:0; letter-spacing:1px; text-transform:uppercase; }
        .vlink-url { flex:1; min-width:200px; font-family:var(--font-casi-mono),monospace; font-size:11px; color:var(--casi-accent); background:rgba(0,0,0,0.3); border:1px solid rgba(var(--casi-accent-rgb),0.12); border-radius:6px; padding:6px 10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .save-status-txt { font-family:var(--font-casi-mono),monospace; font-size:10px; letter-spacing:1px; color:#333; }
        .top-nav { display:flex; align-items:center; justify-content:space-between; padding:0 32px; height:64px; flex-shrink:0; border-bottom:1px solid rgba(var(--casi-accent-rgb),0.08); background:color-mix(in srgb, var(--casi-bg) 96%, transparent); backdrop-filter:blur(20px); position:sticky; top:0; z-index:100; }
        .tnl { display:flex; align-items:center; gap:32px; }
        .nav-logo { display:flex; align-items:center; gap:10px; text-decoration:none; }
        .nav-wm { font-size:20px; font-weight:800; color:var(--casi-accent); letter-spacing:-0.5px; }
        .nav-tabs { display:flex; gap:4px; }
        .nav-tab { font-family:var(--font-casi-mono),monospace; font-size:11px; letter-spacing:1.5px; text-transform:uppercase; padding:7px 14px; border-radius:8px; border:none; background:none; color:var(--casi-text-muted); cursor:pointer; transition:all .2s; position:relative; }
        .nav-tab:hover { color:var(--casi-text); background:rgba(255,255,255,0.04); }
        .nav-tab.active { color:var(--casi-accent); background:rgba(var(--casi-accent-rgb),0.08); }
        .nav-badge { position:absolute; top:2px; right:2px; background:var(--casi-accent); color:var(--casi-bg); font-size:9px; font-weight:800; width:16px; height:16px; border-radius:50%; display:flex; align-items:center; justify-content:center; }
        .tnr { display:flex; align-items:center; gap:12px; }
        .live-toggle { display:flex; align-items:center; gap:8px; padding:8px 16px; border-radius:8px; border:1px solid; cursor:pointer; font-family:var(--font-casi-sans),sans-serif; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; transition:all .2s; }
        .lt-off { background:rgba(255,255,255,0.04); border-color:var(--casi-border); color:var(--casi-text-muted); }
        .lt-on  { background:rgba(239,68,68,0.12); border-color:rgba(239,68,68,0.35); color:#f87171; }
        .live-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
        .ld-off { background:#444; }
        .ld-on  { background:#f87171; animation:blink 1.5s infinite; }
        .btn-sm { font-family:var(--font-casi-sans),sans-serif; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.3px; padding:8px 16px; border-radius:8px; border:none; cursor:pointer; transition:all .2s; white-space:nowrap; }
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
        .canvas-hint { text-align:center; font-family:var(--font-casi-mono),monospace; font-size:10px; letter-spacing:2px; text-transform:uppercase; color:#1e1e1e; margin-top:10px; }

        /* ── BEAM CONTROL PANEL ── */
        .beam-ctrl { background:var(--casi-surface); border:1px solid rgba(var(--casi-accent-rgb),0.2); border-radius:12px; padding:16px 20px; display:flex; flex-direction:column; gap:14px; animation:fadeIn .2s ease; }
        @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        /* Banner preview marquee — rendered on empty banner slots so the
           slot visually scrolls (instead of looking like a dashed rect)
           and the streamer can see what the shape does before any booking
           lands. Same 20s timing as the real banner render in /overlay
           so the editor preview matches what viewers see. */
        @keyframes bannerPreview { from{transform:translateX(100%)} to{transform:translateX(-100%)} }
        .banner-preview { display:flex; align-items:center; width:100%; height:100%; overflow:hidden; background:rgba(var(--casi-accent-rgb),0.06); border:1.5px dashed rgba(var(--casi-accent-rgb),0.35); border-radius:6px; white-space:nowrap; }
        .banner-preview-track { display:inline-block; padding-left:100%; color:rgba(var(--casi-accent-rgb),0.7); font-family:var(--font-casi-sans),sans-serif; font-weight:800; font-size:16px; letter-spacing:1px; animation: bannerPreview 15s linear infinite; }
        .dpad-btn { width:36px; height:36px; border-radius:8px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.04); color:var(--casi-text); font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .15s; user-select:none; -webkit-user-select:none; }
        .dpad-btn:hover { background:rgba(var(--casi-accent-rgb),0.12); border-color:rgba(var(--casi-accent-rgb),0.3); color:var(--casi-accent); }
        .dpad-btn:active { transform:scale(0.9); }
        .step-btn { width:30px; height:30px; border-radius:7px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.04); color:var(--casi-text); font-size:16px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .15s; }
        .step-btn:hover { background:rgba(var(--casi-accent-rgb),0.12); border-color:rgba(var(--casi-accent-rgb),0.3); color:var(--casi-accent); }
        .step-btn:active { transform:scale(0.9); }

        /* REQUESTS */
        .req-body { flex:1; padding:24px 32px; overflow:auto; max-width:800px; width:100%; margin:0 auto; }
        .sec-head { font-family:var(--font-casi-mono),monospace; font-size:10px; letter-spacing:2px; text-transform:uppercase; margin-bottom:14px; display:flex; align-items:center; gap:8px; }
        .sec-head::before { content:''; display:block; width:16px; height:1px; background:currentColor; opacity:0.5; }
        .slot-type-badge { font-family:var(--font-casi-mono),monospace; font-size:9px; letter-spacing:1.5px; padding:2px 8px; border-radius:20px; border:1px solid; }
        .badge-beam { color:var(--casi-accent2); border-color:rgba(var(--casi-accent2-rgb),0.3); background:rgba(var(--casi-accent2-rgb),0.06); }
        .badge-backdrop { color:#c084fc; border-color:rgba(192,132,252,0.3); background:rgba(168,85,247,0.06); }
        .req-card { background:var(--casi-surface); border:1px solid var(--casi-border); border-radius:14px; padding:20px; margin-bottom:10px; display:flex; gap:16px; align-items:flex-start; transition:border-color .2s; }
        .req-card:hover { border-color:rgba(255,255,255,0.12); }
        .req-thumb { width:72px; height:72px; border-radius:10px; border:1px solid var(--casi-border); overflow:hidden; background:var(--casi-bg); flex-shrink:0; display:flex; align-items:center; justify-content:center; cursor:pointer; }
        .req-thumb:hover { border-color:rgba(var(--casi-accent-rgb),0.3); }
        .req-info { flex:1; min-width:0; }
        .req-name { font-size:17px; font-weight:700; color:var(--casi-text); margin-bottom:6px; }
        .req-meta { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px; }
        .tag { font-family:var(--font-casi-mono),monospace; font-size:10px; letter-spacing:1px; padding:3px 10px; border-radius:20px; border:1px solid; }
        .t-orange { color:var(--casi-accent); background:rgba(var(--casi-accent-rgb),0.08); border-color:rgba(var(--casi-accent-rgb),0.2); }
        .t-green  { color:#4ade80; background:rgba(74,222,128,0.08); border-color:rgba(74,222,128,0.2); }
        .t-cyan   { color:var(--casi-accent2); background:rgba(var(--casi-accent2-rgb),0.08); border-color:rgba(var(--casi-accent2-rgb),0.2); }
        .t-dim    { color:rgba(var(--casi-accent-rgb),0.6); background:rgba(var(--casi-accent-rgb),0.05); border-color:rgba(var(--casi-accent-rgb),0.12); }
        .t-flash  { color:#facc15; background:rgba(250,204,21,0.08); border-color:rgba(250,204,21,0.2); }
        .c-flash  { background:rgba(250,204,21,0.04); border-color:rgba(250,204,21,0.15) !important; }
        .badge-flash { color:#facc15; border-color:rgba(250,204,21,0.3); background:rgba(250,204,21,0.06); }
        .req-msg { font-size:13px; color:var(--casi-text-muted); font-style:italic; border-left:2px solid var(--casi-border); padding-left:10px; margin-top:6px; }
        .req-actions { display:flex; flex-direction:column; gap:8px; flex-shrink:0; }
        .act-btn { font-family:var(--font-casi-sans),sans-serif; font-weight:800; font-size:12px; text-transform:uppercase; padding:10px 18px; border-radius:8px; border:none; cursor:pointer; transition:all .2s; white-space:nowrap; }
        .c-active  { background:rgba(var(--casi-accent2-rgb),0.05); border-color:rgba(var(--casi-accent2-rgb),0.2) !important; }
        .c-queued  { background:rgba(var(--casi-accent-rgb),0.04); border-color:rgba(var(--casi-accent-rgb),0.15) !important; }
        .c-backdrop-active { background:rgba(168,85,247,0.05); border-color:rgba(168,85,247,0.2) !important; }
        .c-backdrop-queue  { background:rgba(168,85,247,0.03); border-color:rgba(168,85,247,0.12) !important; }
        .sep { width:100%; height:1px; background:var(--casi-surface); margin:24px 0; }

        /* SETTINGS */
        .set-body { flex:1; padding:24px 32px; overflow:auto; max-width:680px; width:100%; margin:0 auto; display:flex; flex-direction:column; gap:12px; }
        .set-card { background:var(--casi-surface); border:1px solid var(--casi-border); border-radius:14px; padding:24px; }
        .set-title { font-size:14px; font-weight:700; color:var(--casi-text); margin-bottom:4px; }
        .set-sub   { font-family:var(--font-casi-mono),monospace; font-size:10px; color:var(--casi-text-muted); margin-bottom:16px; }
        .code-row  { display:flex; align-items:center; gap:10px; }
        .code-box  { flex:1; background:rgba(0,0,0,0.4); border:1px solid var(--casi-border); border-radius:8px; padding:10px 14px; font-family:var(--font-casi-mono),monospace; font-size:11px; color:#888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        /* Inline profile edit */
        .pe-inp { width:100%; background:var(--casi-bg); border:1px solid var(--casi-border); border-radius:10px; padding:10px 13px; font-size:13px; color:var(--casi-text); outline:none; font-family:var(--font-casi-sans),sans-serif; transition:border-color .2s; box-sizing:border-box; }
        .pe-inp::placeholder { color:var(--casi-text-muted); opacity:0.5; }
        .pe-inp:focus { border-color:rgba(var(--casi-accent-rgb),0.4); }
        .pe-lbl { font-family:var(--font-casi-mono),monospace; font-size:9px; letter-spacing:1.5px; text-transform:uppercase; color:var(--casi-text-muted); display:block; margin-bottom:6px; }
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

      <SkinProvider
        skin={activeSkin}
        inkColor={editThemeColor || profile?.ink_color || profile?.theme_color}
        paperColor={profile?.paper_color}
      />
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
              <CasiMark width={50} height={25} />
              <Wordmark />
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
            <Link
              href={view === 'settings' ? '/studio/settings' : '/studio'}
              title={view === 'settings' ? 'Try new settings' : 'Try new studio dashboard'}
              style={{
                fontFamily: 'var(--font-casi-mono, ui-monospace, monospace)',
                fontSize: '10px',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                textDecoration: 'none',
                padding: '5px 10px',
                borderRadius: '999px',
                background: 'rgba(var(--casi-accent-rgb), 0.08)',
                border: '1px solid rgba(var(--casi-accent-rgb), 0.3)',
                color: 'var(--casi-accent)',
              }}
            >
              {view === 'settings' ? 'New settings' : 'New studio'} →
            </Link>
            <button onClick={toggleLive} disabled={togglingLive} className={`live-toggle ${profile.is_live ? 'lt-on' : 'lt-off'}`}>
              <span className={`live-dot ${profile.is_live ? 'ld-on' : 'ld-off'}`} />
              {profile.is_live ? 'Live' : 'Go Live'}
            </button>
            {view === 'studio' && (
              <>
                <button onClick={addBeam} className="btn-sm b-orange banner-add-beam-trigger">+ Beam</button>
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
          </div>
        )}

        {/* MODALS */}
        {selectedEl && showInfoPanel && view === 'studio' && (
          <SlotInfoPanel
            el={selectedEl}
            activeBooking={activeBookings.find(b => b.element_id === selectedEl.id) || null}
            queueBookings={approvedQueued.filter(b => b.element_id === selectedEl.id).sort((a, b) => new Date(a.approved_at).getTime() - new Date(b.approved_at).getTime())}
            onClose={() => setShowInfoPanel(false)}
            onKick={kickBeam} onLockToggle={toggleLock} onDelete={deleteLayer}
            onUpdatePrice={(id, price, unit) => { updateLayer(id, { price_value: price, price_unit: unit }); setShowInfoPanel(false); }}
            onUpdateShape={handleUpdateShape}
            onUpdateGlow={handleUpdateGlow}
          />
        )}

        {/* PREVIEW MODAL */}
        {previewBooking && (
          <PreviewBookingModal
            booking={previewBooking}
            isBackdrop={isBackdropBooking(previewBooking)}
            slotOccupied={slotOccupiedForPreview}
            paymentConfirmed={isPaymentConfirmed(previewBooking)}
            totalDisplay={`$${calcTotal(previewBooking)}`}
            durationDisplay={fmtDuration(previewBooking.duration_minutes)}
            onClose={() => setPreviewBooking(null)}
            onDeny={() => denyBooking(previewBooking.id, previewBooking.payment_method)}
            onApprove={() => approveBooking(previewBooking)}
          />
        )}

        {/* ── ONBOARDING BANNER ── */}
        {showBanner && view === 'studio' && (
          <OnboardingBanner
            elementsCount={elements.length}
            isLive={!!profile?.is_live}
            onAddBeam={addBeam}
            onGoToSettings={() => setView('settings')}
            onDismiss={() => {
              try { localStorage.setItem('casi_onboarding_dismissed', '1'); } catch {}
              setShowBanner(false);
            }}
          />
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
                    <div style={{ fontFamily: "var(--font-casi-sans), sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--casi-text)' }}>{booking.viewer_name}</div>
                    <div style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 9, color: isBackdrop ? 'rgba(192,132,252,0.6)' : 'rgba(var(--casi-accent2-rgb),0.6)', letterSpacing: 1 }}>
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
                        // Tap-to-select for any slot including backdrops.
                        // Backdrops need to be selectable so streamers can
                        // reach the shape picker and convert back to a
                        // beam — otherwise the "convert a beam → backdrop"
                        // flow is a one-way trap.
                        setSelectedSlotId(el.id);
                        setShowInfoPanel(false);
                      } else {
                        updateLayer(el.id, { pos_x: (d.x / dimensions.width) * 100, pos_y: (d.y / dimensions.height) * 100 });
                      }
                      isDragging.current = false;
                    }}
                    onResizeStop={(_e, _dir, ref, _delta, pos) => { updateLayer(el.id, { width: (ref.offsetWidth / dimensions.width) * 100, height: (ref.offsetHeight / dimensions.height) * 100, pos_x: (pos.x / dimensions.width) * 100, pos_y: (pos.y / dimensions.height) * 100 }); }}
                    disableDragging={el.is_background} enableResizing={!el.is_background} bounds="parent"
                    style={{ zIndex: el.is_background ? 0 : (isSelected ? 40 : 30) }}>
                    <div
                      style={{ position: 'relative', width: '100%', height: '100%' }}
                      // Backdrops have `disableDragging` which also kills
                      // Rnd's `onDragStop`, so tap-to-select never fires
                      // for them. Route their selection through a plain
                      // React onClick on the content div instead. Beams
                      // keep using onDragStop so drag-vs-tap distinction
                      // is preserved (a drag shouldn't select).
                      onClick={el.is_background
                        ? (e) => { e.stopPropagation(); setSelectedSlotId(el.id); setShowInfoPanel(false); }
                        : undefined
                      }
                    >
                      {/* Shape-masked content box. Isolated from the delete
                          button and selection indicator below so clip-path
                          doesn't chop the corner × or the outer glow. For
                          `banner` the shape is a wide thin rect — no mask
                          needed; the overlay render is what swaps image → marquee. */}
                      <div
                        style={{
                          position: 'relative',
                          width: '100%',
                          height: '100%',
                          border: el.is_background ? 'none' : isSelected ? '2px solid var(--casi-accent)' : '1.5px solid rgba(var(--casi-accent-rgb),0.3)',
                          borderRadius:
                            el.is_background ? 0 :
                            el.shape === 'rounded' ? 14 :
                            6,
                          opacity: el.locked ? 0.7 : 1,
                          clipPath:
                            el.shape === 'circle' ? 'circle(50%)' :
                            el.shape === 'hex'    ? 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)' :
                            undefined,
                        }}
                      >
                        {!el.image_url ? (
                          el.shape === 'banner' && !el.locked ? (
                            // Empty banner → scrolling placeholder so the
                            // slot is visually recognisable as a banner
                            // instead of a static dashed rectangle.
                            <div className="banner-preview">
                              <span className="banner-preview-track">
                                ▰ Banner · viewer messages scroll here · tip to try
                              </span>
                            </div>
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: `1.5px dashed ${el.locked ? 'rgba(248,113,113,0.3)' : el.is_background ? 'rgba(168,85,247,0.35)' : 'rgba(var(--casi-accent-rgb),0.35)'}`, borderRadius: el.is_background ? 12 : 6, background: el.locked ? 'rgba(248,113,113,0.04)' : el.is_background ? 'rgba(168,85,247,0.04)' : 'rgba(var(--casi-accent-rgb),0.04)' }}>
                              {el.locked && <span style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 10, color: 'rgba(248,113,113,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>🔒 Locked</span>}
                              <span style={{ fontSize: el.is_background ? 24 : 16, marginBottom: 4 }}>{el.is_background ? '🖼️' : el.shape === 'banner' ? '▰' : '✦'}</span>
                              <span style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: el.locked ? 'rgba(248,113,113,0.5)' : el.is_background ? 'rgba(168,85,247,0.6)' : 'rgba(var(--casi-accent-rgb),0.6)' }}>
                                {el.locked ? 'No requests' : el.is_background ? 'Backdrop' : el.shape === 'banner' ? 'Banner' : 'Beam'}
                              </span>
                              {el.price_value > 0 && !el.locked && <span style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 11, fontWeight: 500, marginTop: 3, color: el.is_background ? 'rgba(168,85,247,0.9)' : 'var(--casi-accent)' }}>${el.price_value}/{el.price_unit}</span>}
                            </div>
                          )
                        ) : (
                          <SlotMedia src={el.image_url} fileType={null} style={{ width: '100%', height: '100%', objectFit: el.is_background ? 'cover' : 'contain', pointerEvents: 'none' }} />
                        )}
                      </div>
                      {/* Selection glow */}
                      {isSelected && !el.is_background && (
                        <div style={{ position: 'absolute', top: -2, left: -2, right: -2, bottom: -2, border: '2px solid var(--casi-accent)', borderRadius: 8, pointerEvents: 'none', boxShadow: '0 0 0 3px rgba(var(--casi-accent-rgb),0.15)' }} />
                      )}
                      {/* Delete button — only surface when the slot is
                          idle. Deleting a slot with a live or queued
                          booking drops the row without settling the
                          escrow, which leaves USDC stuck in the on-chain
                          vault AND orphans queue rows that still point
                          at a now-missing element_id. If the streamer
                          wants to end the beam, the End Early flow is
                          the right path; deletion is for cleanup only. */}
                      {!el.is_background && !activeBookings.some(b => b.element_id === el.id) && !approvedQueued.some(b => b.element_id === el.id) && (
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

            {/* Inline panel — movement + price + shape + live info. Shown
                for ANY selected slot, including backdrops, so the shape
                picker (the way to convert a backdrop back into a beam)
                stays reachable. Without this, flipping a beam to backdrop
                hid the menu and the only escape was Clear. */}
            {selectedEl && (
              <BeamCtrlPanel
                el={selectedEl}
                activeBooking={activeBookings.find(b => b.element_id === selectedEl.id) || null}
                updateSlider={updateSlider}
                updateLayer={updateLayer}
                toggleLock={toggleLock}
                deleteLayer={deleteLayer}
                kickBeam={kickBeam}
                onDone={() => setSelectedSlotId(null)}
                onUpdateShape={handleUpdateShape}
                onUpdateGlow={handleUpdateGlow}
              />
            )}

            <div className="canvas-hint">
              {elements.length === 0
                ? 'No slots yet — hit + Beam above to let viewers tip to display an image or video here'
                : selectedEl && selectedEl.is_background
                ? 'Backdrop selected · change shape to convert back to a beam'
                : selectedEl
                ? 'Drag to move · Resize from corners · Edit inline'
                : 'Tap a beam to select · Drag to move · Resize from corners'}
            </div>

            {/* Flash feed — sits right under the studio canvas so streamers
                see incoming paid / free messages live while editing slots.
                Admin mode: composer hidden, feed gets delete affordances.
                Replaces the standalone CHAT tab that used to live in the
                top-nav; flashes are the only message surface in CASI. */}
            {profile?.id && (
              <div style={{ marginTop: 20, maxWidth: 800, marginLeft: 'auto', marginRight: 'auto', width: '100%' }}>
                <FlashPanel
                  profileId={profile.id}
                  viewerName={null}
                  isAdmin
                  variant="compact"
                />
              </div>
            )}
        </div>

        {/* ── REQUESTS — separated by beam vs backdrop ── */}
        {view === 'requests' && (
          <div className="req-body">

            {/* ── FLASH MESSAGES ── */}
            {pendingFlashes.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                  <div style={{ fontFamily: "var(--font-casi-sans), sans-serif", fontSize: 16, fontWeight: 800, color: 'var(--casi-text)', letterSpacing: -0.5 }}>Flash Messages</div>
                  <span className="slot-type-badge badge-flash">⚡ Flashes</span>
                  {confirmedFlashes.length > 0 && <span style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 10, color: '#4ade80' }}>{confirmedFlashes.length} paid</span>}
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
                  <div style={{ fontFamily: "var(--font-casi-sans), sans-serif", fontSize: 16, fontWeight: 800, color: 'var(--casi-text)', letterSpacing: -0.5 }}>Beam Slots</div>
                  <span className="slot-type-badge badge-beam">✦ Beams</span>
                </div>

                {activeBeams.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div className="sec-head" style={{ color: 'var(--casi-accent2)' }}>● Live — {activeBeams.length}</div>
                    {activeBeams.map(booking => {
                      const queueForSlot = approvedBeams.filter(b => b.element_id === booking.element_id).sort((a, b) => new Date(a.approved_at).getTime() - new Date(b.approved_at).getTime());
                      return (
                        <ActiveCard
                          key={booking.id}
                          booking={booking}
                          kind="beam"
                          nextUpList={queueForSlot}
                          onExpire={expireBooking}
                          onKick={kickBeam}
                        />
                      );
                    })}
                  </div>
                )}

                {approvedBeams.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div className="sec-head" style={{ color: 'var(--casi-accent)' }}>⏳ Approved queue — {approvedBeams.length}</div>
                    {approvedBeams.map(booking => (
                      <ApprovedQueueCard
                        key={booking.id}
                        booking={booking}
                        kind="beam"
                        queuePosition={getQueuePosition(booking)}
                        onPlayNow={playNow}
                        onRemove={denyBooking}
                      />
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
                  <div style={{ fontFamily: "var(--font-casi-sans), sans-serif", fontSize: 16, fontWeight: 800, color: 'var(--casi-text)', letterSpacing: -0.5 }}>Full Backdrop</div>
                  <span className="slot-type-badge badge-backdrop">🖼 Backdrop</span>
                </div>

                {activeBackdrop.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div className="sec-head" style={{ color: '#c084fc' }}>● Live</div>
                    {activeBackdrop.map(booking => (
                      <ActiveCard
                        key={booking.id}
                        booking={booking}
                        kind="backdrop"
                        nextUpList={[]}
                        onExpire={expireBooking}
                        onKick={kickBeam}
                      />
                    ))}
                  </div>
                )}

                {approvedBackdrop.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div className="sec-head" style={{ color: '#c084fc', opacity: 0.7 }}>⏳ Approved queue — {approvedBackdrop.length}</div>
                    {approvedBackdrop.map(booking => (
                      <ApprovedQueueCard
                        key={booking.id}
                        booking={booking}
                        kind="backdrop"
                        queuePosition={getQueuePosition(booking)}
                        onPlayNow={playNow}
                        onRemove={denyBooking}
                      />
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
                <div style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 12, color: '#333' }}>No requests yet</div>
                <div style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 11, color: '#222', marginTop: 8 }}>Share your overlay link to get started</div>
              </div>
            )}
          </div>
        )}

        {/* Standalone CHAT tab removed — flashes are the only message
            surface now, and FlashPanel lives under the studio canvas
            (below) so streamers see incoming flashes while editing. */}

        {/* ── SETTINGS ── */}
        {view === 'settings' && (
          <div className="set-body">

            {/* ── SKIN PICKER ── */}
            <SkinPickerCard
              activeSkin={activeSkin}
              savedSkin={profile?.skin ?? null}
              saving={savingSkin}
              onSelect={setActiveSkin}
              onSave={async () => {
                if (!profile || savingSkin) return;
                setSavingSkin(true);
                await supabase.from('profiles').update({ skin: activeSkin }).eq('id', profile.id);
                setProfile((p: any) => ({ ...p, skin: activeSkin }));
                setSavingSkin(false);
              }}
            />

            <ProfileEditCard
              profile={profile}
              open={editOpen}
              onOpenChange={setEditOpen}
              name={editName}
              onNameChange={setEditName}
              bio={editBio}
              onBioChange={setEditBio}
              avatar={editAvatar}
              avatarValid={editAvatarValid}
              onAvatarChange={setEditAvatar}
              onAvatarValidChange={setEditAvatarValid}
              themeColor={editThemeColor}
              onThemeColorChange={setEditThemeColor}
              customColor={editCustomColor}
              onCustomColorChange={setEditCustomColor}
              allowFreeFlashes={editAllowFreeFlashes}
              onAllowFreeFlashesChange={setEditAllowFreeFlashes}
              saving={editSaving}
              saved={editSaved}
              onCancel={() => {
                setEditName(profile.display_name || profile.username || '');
                setEditBio(profile.bio || '');
                setEditAvatar(profile.avatar_url || '');
                setEditAvatarValid(!!profile.avatar_url);
                setEditThemeColor(profile.ink_color || profile.theme_color || '#F58220');
                setEditCustomColor('');
                setEditAllowFreeFlashes(!!profile.allow_free_flashes);
                setEditOpen(false);
              }}
              onSave={async () => {
                if (!profile) return;
                setEditSaving(true);
                await supabase.from('profiles').update({
                  display_name: editName || profile.username,
                  bio: editBio || null,
                  avatar_url: editAvatarValid ? editAvatar : null,
                  ink_color: editThemeColor,
                  allow_free_flashes: editAllowFreeFlashes,
                }).eq('id', profile.id);
                setProfile((p: any) => ({ ...p,
                  display_name: editName || profile.username,
                  bio: editBio || null,
                  avatar_url: editAvatarValid ? editAvatar : null,
                  ink_color: editThemeColor,
                  allow_free_flashes: editAllowFreeFlashes,
                }));
                setEditSaving(false);
                setEditSaved(true);
                setEditOpen(false);
                setTimeout(() => setEditSaved(false), 2000);
              }}
              previewBgUrl={previewBgUrl}
              uploadingPreviewBg={uploadingPreviewBg}
              onPreviewBgUpload={handlePreviewBgUpload}
              stripeConnected={stripeConnected}
              stripeLoading={stripeLoading}
              onStripeConnect={handleStripeConnect}
              solanaWallet={solanaWallet}
              walletConnected={walletConnected}
              walletConnecting={walletConnecting}
              publicKey={publicKey}
              savingWallet={savingWallet}
              walletSaved={walletSaved}
              onSaveWallet={handleSaveWallet}
              onOpenWalletModal={openWalletModal}
              delegateSupabase={supabase}
              delegateWalletReady={!!publicKey && !!profile?.solana_wallet && publicKey.toBase58() === profile.solana_wallet}
              onInstallDelegate={installDelegateOnChain}
            />
            <ViewerOverlayCard
              origin={origin}
              username={profile.username}
              copiedUrl={copiedUrl}
              onCopy={copyUrl}
            />
            <OBSSetupCard
              origin={origin}
              username={profile.username}
              copiedUrl={copiedUrl}
              onCopy={copyUrl}
            />
          </div>
        )}

        {/* MOBILE BOTTOM NAV */}
        <div className="bot-nav">
          {(['studio', 'requests', 'settings'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} className={`bot-tab ${view === v ? 'active' : ''}`}>
              {v === 'requests' && totalPending > 0 && <span className="bot-badge">{totalPending}</span>}
              <span style={{ fontSize: 18 }}>{v === 'studio' ? '🎬' : v === 'requests' ? '📥' : '⚙️'}</span>
              <span style={{ fontFamily: "var(--font-casi-mono), monospace", fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' }}>{v}</span>
            </button>
          ))}
          {/* Mobile bottom nav no longer surfaces a Backdrop shortcut —
              backdrops now live in the shape picker on any beam slot.
              Streamer taps a beam, picks "Backdrop" in the shape row,
              the slot flips to full-canvas with is_background=true. */}
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
