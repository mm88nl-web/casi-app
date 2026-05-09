'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { createClient } from '@/utils/supabase/client';
import { WALLET_ADAPTER_CLUSTER } from '@/lib/solana-network';
import { approveBooking, denyBooking, endBeamEarly, endStreamCleanly, moderateFlash, playNowBooking, type EndStreamProgress, type ModerationContext } from '@/lib/streamer-moderation';
import EarningsBar from '@/components/EarningsBar';
import AiringNow, { type AiringItem, type QueuedRowItem } from './_components/AiringNow';
import ApprovalQueue, { type QueueItem } from './_components/ApprovalQueue';
import EndStreamDialog, { type DelegateHealth } from './_components/EndStreamDialog';
import FlashesLog, { type FlashLogItem } from './_components/FlashesLog';
import PreviewBookingModal, { type PreviewBooking } from './_components/PreviewBookingModal';
import StudioFrame from './_components/StudioFrame';

// Explicit column lists. BOOKING_COLS adds the moderation-critical fields the
// old /studio page didn't need: element_id / is_queued (slot + queue logic),
// escrow_pda / viewer_wallet (Solana settle on deny), image_url (overlay copy
// on approve).
const BOOKING_COLS =
  'id, created_at, profile_id, element_id, viewer_name, status, file_type, message, image_url, storage_path, duration_minutes, price_value, price_unit, payment_method, payment_intent_id, tx_signature, started_at, escrow_pda, viewer_wallet, is_queued';
const FLASH_COLS =
  'id, created_at, profile_id, viewer_name, status, message, amount_cents, payment_method, escrow_pda, viewer_wallet';
const PROFILE_COLS = 'id, username, solana_wallet, is_live, display_currency';

type DisplayCurrency = 'eur' | 'usd' | 'usdc';

const CURRENCY_SYMBOL: Record<DisplayCurrency, string> = {
  eur: '€',
  usd: '$',
  usdc: '',
};

function formatTotal(currency: DisplayCurrency, amount: number): string {
  if (amount === 0) return '—';
  if (currency === 'usdc') {
    return `${amount.toFixed(amount % 1 === 0 ? 0 : 2)} USDC`;
  }
  return `${CURRENCY_SYMBOL[currency]}${amount.toFixed(0)}`;
}

const LOG_LIMIT = 50;

function logTime(createdAt: string): string {
  if (Date.now() - new Date(createdAt).getTime() < 30_000) return 'just now';
  const d = new Date(createdAt);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function timeAgo(createdAt: string): string {
  const delta = Date.now() - new Date(createdAt).getTime();
  const secs = Math.floor(delta / 1000);
  if (secs < 30) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return logTime(createdAt);
}

function formatRemaining(secs: number): string {
  // Floor first — duration_minutes can be fractional (e.g. 0.5min for tests)
  // so durationSecs - elapsed is a float, and `s = float % 60` produced
  // "3:34.9999..." in the timer.
  const total = Math.max(0, Math.floor(secs));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

type BookingRow = {
  id: string | number;
  created_at: string;
  element_id: string | null;
  viewer_name: string | null;
  status: string;
  file_type: string | null;
  message: string | null;
  image_url: string | null;
  storage_path: string | null;
  duration_minutes: number | string;
  price_value: number | string;
  price_unit: string | null;
  payment_method: string | null;
  payment_intent_id: string | null;
  tx_signature: string | null;
  started_at: string | null;
  escrow_pda: string | null;
  viewer_wallet: string | null;
  is_queued: boolean | null;
};

// Mirrors admin/page.tsx's isPaymentConfirmed. Approve must stay gated until
// the viewer's funds are real — Stripe PI created OR Solana tx_signature
// stored OR the booking is genuinely free. Approving without payment lets
// the streamer flip status='active' for nothing in escrow, which on Solana
// reverts at start_beam time and on Stripe leaves a stale row that can't
// be captured.
function isPaymentConfirmed(b: BookingRow): boolean {
  return !!(
    b.payment_intent_id ||
    b.tx_signature ||
    b.payment_method === 'free' ||
    Number(b.price_value) === 0
  );
}

// Same idea for flashes: a USDC flash row exists in the DB before the viewer
// finishes the on-chain funding step, so Approve has to stay disabled until
// escrow_pda + viewer_wallet are stamped (otherwise moderateFlash trips the
// "Flash hasn't been paid yet" guard server-side and the streamer sees a
// useless red banner). Free flashes and zero-amount flashes are always
// confirmed; non-Solana rails defer to the server gate.
function isFlashPaymentConfirmed(f: FlashRow): boolean {
  if (f.payment_method === 'free') return true;
  if ((f.amount_cents ?? 0) === 0) return true;
  const isUsdc = f.payment_method === 'usdc' || f.payment_method === 'solana';
  if (isUsdc) return !!(f.viewer_wallet && f.escrow_pda);
  return true;
}

type FlashRow = {
  id: string;
  created_at: string;
  viewer_name: string | null;
  status: string;
  message: string | null;
  amount_cents: number | null;
  payment_method: string | null;
  escrow_pda: string | null;
  viewer_wallet: string | null;
};

function bookingToQueueItem(
  b: BookingRow,
  shape: string | null = null,
): QueueItem {
  const who = b.viewer_name || 'anon';
  const snippet = b.message
    ? `"${b.message.slice(0, 28)}${b.message.length > 28 ? '…' : ''}"`
    : b.file_type === 'video'
      ? 'video clip'
      : 'image';
  const duration = Number(b.duration_minutes) || 0;
  const rate = Number(b.price_value) || 0;
  const unitMinutes = b.price_unit === 'hr' ? 60 : 1;
  const total = rate * (duration / unitMinutes);
  const isUsdc = b.payment_method === 'usdc' || b.payment_method === 'solana';
  const priceLabel = isUsdc
    ? `${total.toFixed(total % 1 === 0 ? 0 : 2)} USDC`
    : `€${total.toFixed(total % 1 === 0 ? 0 : 2)}`;
  return {
    id: `booking-${b.id}`,
    kind: 'beam',
    name: `${who} · ${snippet}`,
    subtitle: `${timeAgo(b.created_at)} · ${isUsdc ? 'USDC' : 'paid'} · ${duration}m${b.file_type === 'video' ? ' · video' : ''}${rate > 0 ? ` · ${rate}/${b.price_unit}` : ''}`,
    rail: b.payment_method === 'free' ? null : (isUsdc ? 'usdc' : 'stripe'),
    priceLabel,
    readOnly: false,
    mediaUrl: b.image_url,
    fileType: b.file_type,
    shape,
    paymentConfirmed: isPaymentConfirmed(b),
  };
}

function flashToQueueItem(f: FlashRow): QueueItem {
  const who = f.viewer_name || 'anon';
  const snippet = (f.message || '').slice(0, 28);
  const overflow = (f.message?.length ?? 0) > 28;
  const isUsdc = f.payment_method === 'usdc' || f.payment_method === 'solana';
  const priceLabel = isUsdc
    ? `${((f.amount_cents ?? 0) / 100).toFixed(2)} USDC`
    : `€${((f.amount_cents ?? 0) / 100).toFixed(2)}`;
  return {
    id: `flash-${f.id}`,
    kind: 'flash',
    name: `${who} · "${snippet}${overflow ? '…' : ''}"`,
    subtitle: `${logTime(f.created_at)} · ${isUsdc ? 'USDC' : 'paid'} · text`,
    rail: f.payment_method === 'free' ? null : (isUsdc ? 'usdc' : 'stripe'),
    priceLabel,
    paymentConfirmed: isFlashPaymentConfirmed(f),
  };
}

/** Short label for which slot on the canvas a booking lives in, so two
 *  active beams don't look identical on the Airing list. */
function slotLabel(
  element: { shape: string | null; pos_x: number | null; pos_y: number | null; is_background: boolean | null } | undefined,
): string | null {
  if (!element) return null;
  const shape = element.shape || 'rect';
  if (element.is_background || shape === 'backdrop') return 'backdrop';
  if (shape === 'banner') return 'banner';
  const x = Number(element.pos_x ?? 50);
  const y = Number(element.pos_y ?? 50);
  const horiz = x < 33 ? 'left' : x > 55 ? 'right' : 'centre';
  const vert = y < 33 ? 'top' : y > 55 ? 'bottom' : 'mid';
  const pos = horiz === 'centre' && vert === 'mid' ? 'centre' : `${vert}-${horiz}`;
  return `${shape} · ${pos}`;
}

function bookingTotal(b: BookingRow): { total: number; isUsdc: boolean; label: string } {
  const duration = Number(b.duration_minutes) || 0;
  const rate = Number(b.price_value) || 0;
  const unitMinutes = b.price_unit === 'hr' ? 60 : 1;
  const total = rate * (duration / unitMinutes);
  const isUsdc = b.payment_method === 'usdc' || b.payment_method === 'solana';
  const fmt = total.toFixed(total % 1 === 0 ? 0 : 2);
  return {
    total,
    isUsdc,
    label: isUsdc ? `${fmt} USDC` : `€${fmt}`,
  };
}

function bookingToAiringItem(b: BookingRow): AiringItem {
  const who = b.viewer_name || 'anon';
  const snippet = b.message ? `"${b.message.slice(0, 40)}"` : b.file_type === 'video' ? 'video clip' : 'image';
  const { total, isUsdc, label } = bookingTotal(b);
  const startMs = b.started_at ? new Date(b.started_at).getTime() : Date.now();
  const durationSecs = (Number(b.duration_minutes) || 0) * 60;
  const elapsed = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  const remaining = Math.max(0, durationSecs - elapsed);

  // Live vested-amount display — same math the on-chain program uses
  // (vested = total × min(elapsed, duration) / duration), so the streamer
  // sees the number that actually settles when the beam ends. Stripe rail
  // prorates the same way at /api/stripe/end-early. The per-second tick on
  // /studio re-renders this so it counts up live.
  let earnedLabel: string | undefined;
  if (total > 0 && durationSecs > 0) {
    const vested = total * Math.min(elapsed, durationSecs) / durationSecs;
    // Match decimals on both sides — "1 / 8.17 USDC" reads as a typo;
    // "1.42 / 8.17 USDC" reads as the running tally it actually is.
    const decimals = total % 1 === 0 && vested % 1 === 0 ? 0 : 2;
    const vestedFmt = vested.toFixed(decimals);
    const totalFmt = total.toFixed(decimals);
    earnedLabel = isUsdc
      ? `${vestedFmt} / ${totalFmt} USDC`
      : `€${vestedFmt} / €${totalFmt}`;
  }

  return {
    id: `booking-${b.id}`,
    icon: b.file_type === 'video' ? '▶' : '◆',
    name: `${who} · ${snippet}`,
    subtitle: total > 0 ? `Beam · ${label}` : 'Beam',
    remaining: formatRemaining(remaining),
    rail: b.payment_method === 'free' || total <= 0 ? null : (isUsdc ? 'usdc' : 'stripe'),
    earnedLabel,
  };
}

function bookingToQueuedRow(b: BookingRow): QueuedRowItem {
  const { label, isUsdc, total } = bookingTotal(b);
  return {
    id: String(b.id),
    viewerName: b.viewer_name || 'anon',
    message: b.message,
    total: label,
    rail: b.payment_method === 'free' || total <= 0 ? null : (isUsdc ? 'usdc' : 'stripe'),
    durationMin: Number(b.duration_minutes) || 0,
    fileType: b.file_type,
    mediaUrl: b.image_url,
  };
}

function flashToLogItem(f: FlashRow): FlashLogItem {
  const isUsdc = f.payment_method === 'usdc' || f.payment_method === 'solana';
  const isFree = f.payment_method === 'free';
  const chipKind: FlashLogItem['chip']['kind'] = isFree ? 'free' : isUsdc ? 'usdc' : 'eur';
  const chipLabel = isFree
    ? 'Free'
    : isUsdc
      ? `${((f.amount_cents ?? 0) / 100).toFixed(0)} USDC`
      : `€${((f.amount_cents ?? 0) / 100).toFixed(2)}`;
  return {
    id: f.id,
    time: logTime(f.created_at),
    who: f.viewer_name || 'anon',
    message: f.message || '',
    chip: { kind: chipKind, label: chipLabel },
    refunded: f.status === 'denied',
  };
}

type Profile = {
  id: string;
  username: string | null;
  solana_wallet: string | null;
  is_live: boolean | null;
  display_currency: DisplayCurrency | null;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'anonymous' }
  | { kind: 'missing-profile' }
  | { kind: 'ready'; profile: Profile };

/**
 * useSearchParams() puts the page on the dynamic-render path, which Next's
 * static-export pass refuses to traverse without a Suspense boundary above
 * it. Wrap the inner component so the build can prerender the shell while
 * the params resolve client-side.
 */
export default function StudioPage() {
  return (
    <Suspense fallback={<StatusScreen>Loading studio…</StatusScreen>}>
      <StudioPageInner />
    </Suspense>
  );
}

function StudioPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [supabase] = useState<SupabaseClient>(() => createClient());
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const [todayBookings, setTodayBookings] = useState<BookingRow[]>([]);
  const [pendingBookings, setPendingBookings] = useState<BookingRow[]>([]);
  const [pendingFlashes, setPendingFlashes] = useState<FlashRow[]>([]);
  const [activeBookings, setActiveBookings] = useState<BookingRow[]>([]);
  const [queuedBookings, setQueuedBookings] = useState<BookingRow[]>([]);
  const [elementsById, setElementsById] = useState<Record<string, { shape: string | null; pos_x: number | null; pos_y: number | null; is_background: boolean | null; }>>({});
  const [flashLogRaw, setFlashLogRaw] = useState<FlashRow[]>([]);
  const [moderating, setModerating] = useState<Set<string>>(new Set());
  const [endingEarly, setEndingEarly] = useState<Set<string>>(new Set());
  const [refundingFlash, setRefundingFlash] = useState<Set<string>>(new Set());
  const [playingNowId, setPlayingNowId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [endStreamOpen, setEndStreamOpen] = useState(false);
  const [endStreamProgress, setEndStreamProgress] = useState<EndStreamProgress | null>(null);
  const [delegateHealth, setDelegateHealth] = useState<DelegateHealth>('unknown');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [togglingLive, setTogglingLive] = useState(false);

  const [, setTick] = useState(0);

  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();

  const reload = useCallback(async (profileId: string) => {
    const startOfDayIso = new Date();
    startOfDayIso.setHours(0, 0, 0, 0);

    const [pendingBookingsRes, pendingFlashesRes, activeBookingsRes, queuedBookingsRes, elementsRes, logFlashesRes, todayBookingsRes] =
      await Promise.all([
        supabase.from('bookings').select(BOOKING_COLS)
          .eq('profile_id', profileId).eq('status', 'pending')
          .order('created_at', { ascending: false }).limit(50),
        supabase.from('flashes').select(FLASH_COLS)
          .eq('profile_id', profileId).eq('status', 'pending')
          .order('created_at', { ascending: false }).limit(50),
        supabase.from('bookings').select(BOOKING_COLS)
          .eq('profile_id', profileId).eq('status', 'active')
          .order('started_at', { ascending: false }).limit(10),
        supabase.from('bookings').select(BOOKING_COLS)
          .eq('profile_id', profileId).eq('status', 'approved_queued')
          .order('approved_at', { ascending: true }).limit(50),
        supabase.from('overlay_elements')
          .select('id, shape, pos_x, pos_y, is_background')
          .eq('profile_id', profileId),
        supabase.from('flashes').select(FLASH_COLS)
          .eq('profile_id', profileId)
          .in('status', ['approved', 'denied'])
          .gte('created_at', startOfDayIso.toISOString())
          .order('created_at', { ascending: false }).limit(LOG_LIMIT),
        // Settled beams that were on stream today — used for the Today tile.
        // Filter on started_at (when revenue actually started accruing) so a
        // beam booked yesterday and aired today shows up under today.
        supabase.from('bookings').select(BOOKING_COLS)
          .eq('profile_id', profileId).eq('status', 'expired')
          .gte('started_at', startOfDayIso.toISOString())
          .order('started_at', { ascending: false }).limit(LOG_LIMIT),
      ]);

    setPendingBookings((pendingBookingsRes.data ?? []) as BookingRow[]);
    setPendingFlashes((pendingFlashesRes.data ?? []) as FlashRow[]);
    setActiveBookings((activeBookingsRes.data ?? []) as BookingRow[]);
    setQueuedBookings((queuedBookingsRes.data ?? []) as BookingRow[]);
    setTodayBookings((todayBookingsRes.data ?? []) as BookingRow[]);

    const elementsMap: Record<string, { shape: string | null; pos_x: number | null; pos_y: number | null; is_background: boolean | null; }> = {};
    for (const el of (elementsRes.data ?? []) as Array<{ id: string; shape: string | null; pos_x: number | null; pos_y: number | null; is_background: boolean | null; }>) {
      elementsMap[el.id] = { shape: el.shape, pos_x: el.pos_x, pos_y: el.pos_y, is_background: el.is_background };
    }
    setElementsById(elementsMap);

    setFlashLogRaw((logFlashesRes.data ?? []) as FlashRow[]);
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setState({ kind: 'anonymous' });
        router.replace('/login');
        return;
      }
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLS)
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setState({ kind: 'missing-profile' });
        return;
      }
      setState({ kind: 'ready', profile: data as Profile });
    };
    load();
    return () => { cancelled = true; };
  }, [supabase, router]);

  const profileId = state.kind === 'ready' ? state.profile.id : null;
  const lastEventRef = useRef(Date.now());

  useEffect(() => {
    if (!profileId) return;
    lastEventRef.current = Date.now();
    reload(profileId);

    const bump = () => { lastEventRef.current = Date.now(); };

    const bookingsChannel = supabase
      .channel(`studio_bookings_${profileId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `profile_id=eq.${profileId}` },
        () => { bump(); reload(profileId); })
      .subscribe();

    const flashesChannel = supabase
      .channel(`studio_flashes_${profileId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'flashes', filter: `profile_id=eq.${profileId}` },
        () => { bump(); reload(profileId); })
      .subscribe();

    // Profile changes (e.g. display_currency picked in /studio/settings) need
    // to flow back into the dashboard or the Today tile keeps filtering on
    // a stale currency until the page is hard-reloaded.
    const profileChannel = supabase
      .channel(`studio_profile_${profileId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${profileId}` },
        async () => {
          const { data } = await supabase
            .from('profiles')
            .select(PROFILE_COLS)
            .eq('id', profileId)
            .maybeSingle();
          if (data) setState({ kind: 'ready', profile: data as Profile });
        })
      .subscribe();

    const watchdog = setInterval(() => {
      if (Date.now() - lastEventRef.current > 30_000) {
        bump();
        reload(profileId);
      }
    }, 30_000);

    return () => {
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(flashesChannel);
      supabase.removeChannel(profileChannel);
      clearInterval(watchdog);
    };
  }, [profileId, supabase, reload]);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // /studio/live's End Stream button bounces here with ?end=true so the
  // dashboard (which has actives/pendings/queued/flashes loaded) handles
  // the confirm + shutdown sequence in one place. Clear the param after
  // opening so a refresh doesn't re-trigger it.
  useEffect(() => {
    if (searchParams.get('end') !== 'true') return;
    if (state.kind !== 'ready' || !state.profile.is_live) return;
    setEndStreamOpen(true);
    setDelegateHealth('unknown');
    router.replace('/studio');
    // probeDelegate runs from toggleLive's offline branch normally; for
    // the URL-driven path we trigger it here.
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      try {
        const res = await fetch('/api/solana/delegates/status', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const body = await res.json();
        const s = String(body?.state ?? body?.status ?? '').toLowerCase();
        setDelegateHealth(
          s === 'installed' || s === 'healthy' ? 'healthy'
          : s === 'expired' ? 'expired'
          : s === 'revoked' ? 'revoked'
          : 'absent'
        );
      } catch { /* best-effort */ }
    })();
  }, [searchParams, state, router, supabase]);

  const moderationCtx = useMemo<ModerationContext | null>(() => {
    if (state.kind !== 'ready') return null;
    const signer = publicKey && signTransaction
      ? { publicKey, signTransaction, signAllTransactions: signAllTransactions ?? undefined }
      : null;
    return {
      supabase,
      connection,
      profile: { id: state.profile.id, solana_wallet: state.profile.solana_wallet },
      activeBookings: activeBookings.map((b) => ({ element_id: b.element_id })),
      wallet: signer,
      cluster: WALLET_ADAPTER_CLUSTER,
    };
  }, [state, supabase, connection, publicKey, signTransaction, signAllTransactions, activeBookings]);

  const markModerating = useCallback((id: string, on: boolean) => {
    setModerating((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleApprove = useCallback(async (queueId: string) => {
    if (!moderationCtx) return;
    setErrorMsg(null);

    if (queueId.startsWith('booking-')) {
      const raw = queueId.slice('booking-'.length);
      const booking = pendingBookings.find((b) => String(b.id) === raw);
      if (!booking) return;
      // Defensive payment-gate. UI already disables the button when the
      // booking isn't paid, but realtime sub races + admin overlap mean a
      // streamer could in theory click between "no payment" and "paid"
      // states. Refuse server-side (here) to keep the on-chain Pending
      // start_beam from reverting.
      if (!isPaymentConfirmed(booking)) {
        setErrorMsg('Viewer hasn’t paid yet — give it a moment, then try again.');
        return;
      }
      markModerating(queueId, true);
      const result = await approveBooking(moderationCtx, booking);
      markModerating(queueId, false);
      if (!result.ok) {
        setErrorMsg(result.message);
        return;
      }
      setPendingBookings((prev) => prev.filter((b) => String(b.id) !== raw));
      return;
    }

    if (queueId.startsWith('flash-')) {
      const raw = queueId.slice('flash-'.length);
      const flash = pendingFlashes.find((f) => f.id === raw);
      if (!flash) return;
      // Mirror the booking branch's defensive gate. UI already greys Approve
      // for unfunded USDC flashes; this catches realtime-race clicks.
      if (!isFlashPaymentConfirmed(flash)) {
        setErrorMsg('Viewer hasn’t paid yet — give it a moment, then try again.');
        return;
      }
      markModerating(queueId, true);
      const result = await moderateFlash(moderationCtx, flash, 'approve');
      markModerating(queueId, false);
      if (!result.ok) {
        setErrorMsg(result.message);
        return;
      }
      setPendingFlashes((prev) => prev.filter((f) => f.id !== raw));
    }
  }, [moderationCtx, pendingBookings, pendingFlashes, markModerating]);

  const probeDelegate = useCallback(async (): Promise<DelegateHealth> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return 'unknown';
      const res = await fetch('/api/solana/delegates/status', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return 'unknown';
      const body = await res.json();
      // /api/solana/delegates/status returns a state field per
      // DelegateKeyCard's contract. Map to our local enum.
      const s = String(body?.state ?? body?.status ?? '').toLowerCase();
      if (s === 'installed' || s === 'healthy') return 'healthy';
      if (s === 'expired') return 'expired';
      if (s === 'revoked') return 'revoked';
      return 'absent';
    } catch {
      return 'unknown';
    }
  }, [supabase]);

  const toggleLive = useCallback(async () => {
    if (state.kind !== 'ready' || togglingLive) return;
    const goingLive = !state.profile.is_live;

    // Going LIVE → just flip the flag, no confirm needed.
    if (goingLive) {
      setTogglingLive(true);
      setState({ kind: 'ready', profile: { ...state.profile, is_live: true } });
      const { error } = await supabase.from('profiles').update({ is_live: true }).eq('id', state.profile.id);
      if (error) {
        setState({ kind: 'ready', profile: { ...state.profile, is_live: false } });
        setErrorMsg(error.message);
      }
      setTogglingLive(false);
      return;
    }

    // Going OFFLINE → open confirm + probe delegate so the dialog can
    // warn about wallet popups. The actual shutdown runs from the
    // dialog's onConfirm via confirmEndStream below.
    setDelegateHealth('unknown');
    setEndStreamOpen(true);
    probeDelegate().then(setDelegateHealth);
  }, [state, supabase, togglingLive, probeDelegate]);

  const confirmEndStream = useCallback(async () => {
    if (state.kind !== 'ready' || !moderationCtx || endStreamProgress) return;
    setErrorMsg(null);
    setEndStreamProgress({ total: 0, done: 0, step: 'kick-active', currentId: null });

    const result = await endStreamCleanly(
      moderationCtx,
      {
        actives: activeBookings,
        pendingBookings,
        pendingFlashes,
        queuedBookings,
        profileId: state.profile.id,
      },
      { onProgress: setEndStreamProgress },
    );

    setEndStreamProgress(null);
    setEndStreamOpen(false);

    // Optimistic local clear — realtime sub will reconcile too.
    setActiveBookings([]);
    setPendingBookings([]);
    setPendingFlashes([]);
    setQueuedBookings([]);
    setState({ kind: 'ready', profile: { ...state.profile, is_live: false } });

    if (!result.ok) {
      const head = result.failures[0];
      const more = result.failures.length > 1 ? ` (+${result.failures.length - 1} more)` : '';
      setErrorMsg(`${head.message}${more}`);
    }
  }, [state, moderationCtx, activeBookings, pendingBookings, pendingFlashes, queuedBookings, endStreamProgress]);

  const handleEndEarly = useCallback(async (bookingId: string) => {
    if (!moderationCtx) return;
    const booking = activeBookings.find((b) => String(b.id) === bookingId);
    if (!booking) return;

    setEndingEarly((prev) => new Set(prev).add(bookingId));
    setErrorMsg(null);
    const result = await endBeamEarly(moderationCtx, booking);
    setEndingEarly((prev) => {
      const next = new Set(prev);
      next.delete(bookingId);
      return next;
    });

    if (!result.ok) {
      setErrorMsg(result.message);
      return;
    }
    setActiveBookings((prev) => prev.filter((b) => String(b.id) !== bookingId));
  }, [moderationCtx, activeBookings]);

  const handlePlayNow = useCallback(async (queuedBookingId: string) => {
    if (!moderationCtx || playingNowId) return;
    const queued = queuedBookings.find((b) => String(b.id) === queuedBookingId);
    if (!queued || !queued.element_id) return;
    const current = activeBookings.find((b) => b.element_id === queued.element_id) ?? null;

    setPlayingNowId(queuedBookingId);
    setErrorMsg(null);
    const result = await playNowBooking(moderationCtx, queued, current);
    setPlayingNowId(null);

    if (!result.ok) {
      setErrorMsg(result.message);
      return;
    }
    // Optimistic local update — realtime sub will reconcile within ~ms.
    if (current) {
      setActiveBookings((prev) => prev.filter((b) => String(b.id) !== String(current.id)));
    }
    setQueuedBookings((prev) => prev.filter((b) => String(b.id) !== queuedBookingId));
    setActiveBookings((prev) => [
      ...prev,
      { ...queued, status: 'active', started_at: new Date().toISOString() } as BookingRow,
    ]);
  }, [moderationCtx, queuedBookings, activeBookings, playingNowId]);

  const handleReject = useCallback(async (queueId: string) => {
    if (!moderationCtx) return;
    setErrorMsg(null);

    if (queueId.startsWith('booking-')) {
      const raw = queueId.slice('booking-'.length);
      const booking = pendingBookings.find((b) => String(b.id) === raw);
      if (!booking) return;
      markModerating(queueId, true);
      const result = await denyBooking(moderationCtx, String(booking.id), booking.payment_method);
      markModerating(queueId, false);
      if (!result.ok) {
        setErrorMsg(result.message);
        return;
      }
      setPendingBookings((prev) => prev.filter((b) => String(b.id) !== raw));
      return;
    }

    if (queueId.startsWith('flash-')) {
      const raw = queueId.slice('flash-'.length);
      const flash = pendingFlashes.find((f) => f.id === raw);
      if (!flash) return;
      markModerating(queueId, true);
      const result = await moderateFlash(moderationCtx, flash, 'deny');
      markModerating(queueId, false);
      if (!result.ok) {
        setErrorMsg(result.message);
        return;
      }
      setPendingFlashes((prev) => prev.filter((f) => f.id !== raw));
    }
  }, [moderationCtx, pendingBookings, pendingFlashes, markModerating]);

  const handleFlashRefund = useCallback(async (flashId: string) => {
    if (!moderationCtx) return;
    setErrorMsg(null);
    const flash = flashLogRaw.find((f) => f.id === flashId);
    if (!flash) return;
    setRefundingFlash((prev) => new Set(prev).add(flashId));
    const result = await moderateFlash(moderationCtx, flash, 'deny');
    setRefundingFlash((prev) => {
      const next = new Set(prev);
      next.delete(flashId);
      return next;
    });
    if (!result.ok) {
      setErrorMsg(result.message);
    }
  }, [moderationCtx, flashLogRaw]);

  if (state.kind === 'loading' || state.kind === 'anonymous') {
    return <StatusScreen>Loading studio…</StatusScreen>;
  }
  if (state.kind === 'missing-profile') {
    return <StatusScreen>Finish signup first — no profile row for this account.</StatusScreen>;
  }

  const { profile } = state;
  const slug = profile.username ?? 'streamer';
  const displayCurrency: DisplayCurrency = profile.display_currency ?? 'eur';

  // Sum today's approved flashes + settled beams in the streamer's chosen
  // currency only — ignore the other rail to keep the tile honest. Free
  // flashes never count (no money moved). v1 is no FX: a streamer set to
  // EUR who took a USDC tip sees their EUR total tick up by 0 and the
  // USDC row in the log makes it obvious where it went. Beam totals use
  // the booking's full price_value × duration; prorated kicks are not
  // discounted yet (no settled_amount column on bookings).
  const isUsdcRow = (m: string | null) => m === 'usdc' || m === 'solana';
  const matchesCurrency = (m: string | null) =>
    displayCurrency === 'usdc' ? isUsdcRow(m) : !isUsdcRow(m);
  let todayCents = 0;
  for (const row of flashLogRaw) {
    if (row.status === 'denied' || row.payment_method === 'free') continue;
    if (!matchesCurrency(row.payment_method)) continue;
    todayCents += row.amount_cents ?? 0;
  }
  for (const row of todayBookings) {
    if (row.payment_method === 'free') continue;
    if (!matchesCurrency(row.payment_method)) continue;
    const { total } = bookingTotal(row);
    todayCents += Math.round(total * 100);
  }
  // Live-vested portion of any beam that's airing right now, scoped to
  // beams that started today so the tile doesn't double-count vesting
  // that already accrued yesterday. Re-renders every second via setTick
  // so the streamer sees the count tick up while a beam is on stream.
  const startOfDayMs = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();
  for (const row of activeBookings) {
    if (row.payment_method === 'free') continue;
    if (!matchesCurrency(row.payment_method)) continue;
    const startMs = row.started_at ? new Date(row.started_at).getTime() : Date.now();
    if (startMs < startOfDayMs) continue;
    const durationSecs = (Number(row.duration_minutes) || 0) * 60;
    if (durationSecs <= 0) continue;
    const { total } = bookingTotal(row);
    if (total <= 0) continue;
    const elapsed = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
    const vested = total * Math.min(elapsed, durationSecs) / durationSecs;
    todayCents += Math.round(vested * 100);
  }
  const todayTotal = formatTotal(displayCurrency, todayCents / 100);

  const queue: QueueItem[] = [
    ...pendingBookings.map((b) => ({
      // Pass slot shape so the row thumb gets the same on-stream mask
      // (circle / hex / banner / rounded / rect) — gives the streamer a
      // "this is what'll appear on stream" preview before tapping Approve.
      item: bookingToQueueItem(b, b.element_id ? elementsById[b.element_id]?.shape ?? null : null),
      ts: new Date(b.created_at).getTime(),
    })),
    ...pendingFlashes.map((f) => ({
      item: flashToQueueItem(f),
      ts: new Date(f.created_at).getTime(),
    })),
  ].sort((a, b) => b.ts - a.ts).map(({ item }) => item);

  // Per-slot queue grouping: each element_id → its sorted list of queued
  // bookings. Already sorted by approved_at ascending in the reload query,
  // so position = array index + 1 here.
  const queueByElement = queuedBookings.reduce<Record<string, QueuedRowItem[]>>((acc, b) => {
    if (!b.element_id) return acc;
    (acc[b.element_id] ??= []).push(bookingToQueuedRow(b));
    return acc;
  }, {});

  const flashLog: FlashLogItem[] = flashLogRaw.map(flashToLogItem);

  const airing: AiringItem[] = activeBookings.map((b) => {
    const bookingId = String(b.id);
    const base = bookingToAiringItem(b);
    const element = b.element_id ? elementsById[b.element_id] : undefined;
    const label = slotLabel(element);
    const subtitle = label ? `${label} · ${base.subtitle}` : base.subtitle;
    // Decorate queued rows with this slot's shape so the queue thumbs
    // reuse the same circle/hex/rounded mask the active row above shows.
    const rawQueue = b.element_id ? (queueByElement[b.element_id] ?? []) : [];
    const queue = rawQueue.map((q) => ({ ...q, shape: element?.shape ?? null }));
    return {
      ...base,
      subtitle,
      queue,
      onPlayNow: handlePlayNow,
      playingNowId,
      onEndEarly: () => handleEndEarly(bookingId),
      endingEarly: endingEarly.has(bookingId),
      mediaUrl: b.image_url,
      fileType: b.file_type,
      shape: element?.shape ?? null,
    };
  });

  return (
    <StudioFrame
      username={slug}
      isLive={profile.is_live}
      togglingLive={togglingLive}
      onToggleLive={toggleLive}
      activeMode="dashboard"
      pendingCount={queue.length}
      error={errorMsg}
      onDismissError={() => setErrorMsg(null)}
    >
      <EarningsBar
        viewerLink={`casi.gg/overlay?s=${slug}`}
        today={todayTotal}
        todayRail={displayCurrency === 'usdc' ? 'usdc' : 'stripe'}
        pending={queue.length}
      />

      {airing.length > 0 ? <AiringNow items={airing} /> : null}

      <ApprovalQueue
        items={queue}
        onApprove={handleApprove}
        onReject={handleReject}
        onPreview={setPreviewId}
        pendingIds={moderating}
        emptyLabel="No pending bookings · nothing to approve"
      />

      <FlashesLog
        items={flashLog}
        total={todayTotal}
        onRefund={handleFlashRefund}
        refunding={refundingFlash}
      />

      <EndStreamDialog
        open={endStreamOpen}
        onClose={() => { if (!endStreamProgress) setEndStreamOpen(false); }}
        counts={{
          actives: activeBookings.length,
          pendingBookings: pendingBookings.length,
          pendingFlashes: pendingFlashes.length,
          queuedBookings: queuedBookings.length,
        }}
        delegate={delegateHealth}
        progress={endStreamProgress}
        onConfirm={confirmEndStream}
      />

      <PreviewBookingModal
        booking={buildPreview(previewId, pendingBookings, pendingFlashes, elementsById)}
        onClose={() => setPreviewId(null)}
        onApprove={handleApprove}
        onDeny={handleReject}
      />
    </StudioFrame>
  );
}

/**
 * Resolve a preview-modal id ("booking-123" or "flash-uuid") back to the
 * raw row plus formatted display strings. Returns null when the id isn't
 * set or its row dropped out of the pending lists (approved / denied
 * elsewhere) — modal closes itself on null.
 */
function buildPreview(
  id: string | null,
  pendingBookings: BookingRow[],
  pendingFlashes: FlashRow[],
  elementsById: Record<string, { shape: string | null; pos_x: number | null; pos_y: number | null; is_background: boolean | null }>,
): PreviewBooking | null {
  if (!id) return null;
  if (id.startsWith('booking-')) {
    const raw = id.slice('booking-'.length);
    const b = pendingBookings.find((x) => String(x.id) === raw);
    if (!b) return null;
    const duration = Number(b.duration_minutes) || 0;
    const rate = Number(b.price_value) || 0;
    const unitMinutes = b.price_unit === 'hr' ? 60 : 1;
    const total = rate * (duration / unitMinutes);
    const isUsdc = b.payment_method === 'usdc' || b.payment_method === 'solana';
    const fmt = (n: number) => n.toFixed(n % 1 === 0 ? 0 : 2);
    const totalLabel = isUsdc ? `${fmt(total)} USDC` : `€${fmt(total)}`;
    const rateLabel = isUsdc ? `${fmt(rate)} USDC/${b.price_unit}` : `€${fmt(rate)}/${b.price_unit}`;
    const durationLabel = duration >= 60
      ? `${Math.floor(duration / 60)}h${duration % 60 ? ` ${duration % 60}m` : ''}`
      : `${duration}m`;
    const element = b.element_id ? elementsById[b.element_id] : undefined;
    return {
      id,
      kind: 'beam',
      viewerName: b.viewer_name || 'anon',
      message: b.message,
      imageUrl: b.image_url,
      fileType: b.file_type,
      shape: element?.shape ?? null,
      rateLabel,
      totalLabel,
      durationLabel,
      paymentConfirmed: isPaymentConfirmed(b),
      slotLabel: slotLabel(element),
    };
  }
  if (id.startsWith('flash-')) {
    const raw = id.slice('flash-'.length);
    const f = pendingFlashes.find((x) => x.id === raw);
    if (!f) return null;
    const isUsdc = f.payment_method === 'usdc' || f.payment_method === 'solana';
    const isFree = f.payment_method === 'free';
    const cents = f.amount_cents ?? 0;
    const totalLabel = isFree
      ? 'Free'
      : isUsdc
        ? `${(cents / 100).toFixed(0)} USDC`
        : `€${(cents / 100).toFixed(2)}`;
    return {
      id,
      kind: 'flash',
      viewerName: f.viewer_name || 'anon',
      message: f.message,
      imageUrl: null,
      fileType: null,
      shape: null,
      rateLabel: '',
      totalLabel,
      durationLabel: '',
      // Flashes get gated server-side already; no payment_intent_id /
      // tx_signature fields on the FlashRow projection used here. Treat
      // visible-in-pending as "paid enough to surface the modal".
      paymentConfirmed: true,
    };
  }
  return null;
}

function StatusScreen({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--casi-bg)', color: 'var(--casi-text-dim)' }}
    >
      <div className="font-mono uppercase" style={{ fontSize: '11px', letterSpacing: '0.2em' }}>
        {children}
      </div>
    </main>
  );
}
