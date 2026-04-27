'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { createClient } from '@/utils/supabase/client';
import { WALLET_ADAPTER_CLUSTER } from '@/lib/solana-network';
import { approveBooking, denyBooking, endBeamEarly, moderateFlash, type ModerationContext } from '@/lib/streamer-moderation';
import EarningsBar from '@/components/EarningsBar';
import AiringNow, { type AiringItem } from './_components/AiringNow';
import ApprovalQueue, { type QueueItem } from './_components/ApprovalQueue';
import FlashesLog, { type FlashLogItem } from './_components/FlashesLog';
import StudioFrame from './_components/StudioFrame';

// Explicit column lists. BOOKING_COLS adds the moderation-critical fields the
// old /studio page didn't need: element_id / is_queued (slot + queue logic),
// escrow_pda / viewer_wallet (Solana settle on deny), image_url (overlay copy
// on approve).
const BOOKING_COLS =
  'id, created_at, profile_id, element_id, viewer_name, status, file_type, message, image_url, storage_path, duration_minutes, price_value, price_unit, payment_method, started_at, escrow_pda, viewer_wallet, is_queued';
const FLASH_COLS =
  'id, created_at, profile_id, viewer_name, status, message, amount_cents, payment_method, escrow_pda, viewer_wallet';
const PROFILE_COLS = 'id, username, solana_wallet, is_live';

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
  if (secs <= 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
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
  started_at: string | null;
  escrow_pda: string | null;
  viewer_wallet: string | null;
  is_queued: boolean | null;
};

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
    priceLabel,
    readOnly: false,
    mediaUrl: b.image_url,
    fileType: b.file_type,
    shape,
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
    priceLabel,
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

function bookingToAiringItem(b: BookingRow): AiringItem {
  const who = b.viewer_name || 'anon';
  const snippet = b.message ? `"${b.message.slice(0, 40)}"` : b.file_type === 'video' ? 'video clip' : 'image';
  const isUsdc = b.payment_method === 'usdc' || b.payment_method === 'solana';
  const priceLabel = isUsdc ? `${Number(b.price_value)} USDC` : `€${Number(b.price_value)}`;
  const startMs = b.started_at ? new Date(b.started_at).getTime() : Date.now();
  const durationSecs = (Number(b.duration_minutes) || 0) * 60;
  const elapsed = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  const remaining = Math.max(0, durationSecs - elapsed);
  return {
    id: `booking-${b.id}`,
    icon: b.file_type === 'video' ? '▶' : '◆',
    name: `${who} · ${snippet}`,
    subtitle: `Beam · ${priceLabel}`,
    remaining: formatRemaining(remaining),
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
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'anonymous' }
  | { kind: 'missing-profile' }
  | { kind: 'ready'; profile: Profile };

export default function StudioPage() {
  const router = useRouter();
  const [supabase] = useState<SupabaseClient>(() => createClient());
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const [pendingBookings, setPendingBookings] = useState<BookingRow[]>([]);
  const [pendingFlashes, setPendingFlashes] = useState<FlashRow[]>([]);
  const [activeBookings, setActiveBookings] = useState<BookingRow[]>([]);
  const [queuedBookings, setQueuedBookings] = useState<BookingRow[]>([]);
  const [elementsById, setElementsById] = useState<Record<string, { shape: string | null; pos_x: number | null; pos_y: number | null; is_background: boolean | null; }>>({});
  const [flashLogRaw, setFlashLogRaw] = useState<FlashRow[]>([]);
  const [flashTotals, setFlashTotals] = useState({ count: 0, eur: '€0', usdc: '0 USDC' });
  const [moderating, setModerating] = useState<Set<string>>(new Set());
  const [endingEarly, setEndingEarly] = useState<Set<string>>(new Set());
  const [refundingFlash, setRefundingFlash] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [togglingLive, setTogglingLive] = useState(false);

  const [, setTick] = useState(0);

  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();

  const reload = useCallback(async (profileId: string) => {
    const startOfDayIso = new Date();
    startOfDayIso.setHours(0, 0, 0, 0);

    const [pendingBookingsRes, pendingFlashesRes, activeBookingsRes, queuedBookingsRes, elementsRes, logFlashesRes] =
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
      ]);

    setPendingBookings((pendingBookingsRes.data ?? []) as BookingRow[]);
    setPendingFlashes((pendingFlashesRes.data ?? []) as FlashRow[]);
    setActiveBookings((activeBookingsRes.data ?? []) as BookingRow[]);
    setQueuedBookings((queuedBookingsRes.data ?? []) as BookingRow[]);

    const elementsMap: Record<string, { shape: string | null; pos_x: number | null; pos_y: number | null; is_background: boolean | null; }> = {};
    for (const el of (elementsRes.data ?? []) as Array<{ id: string; shape: string | null; pos_x: number | null; pos_y: number | null; is_background: boolean | null; }>) {
      elementsMap[el.id] = { shape: el.shape, pos_x: el.pos_x, pos_y: el.pos_y, is_background: el.is_background };
    }
    setElementsById(elementsMap);

    const logRows = (logFlashesRes.data ?? []) as FlashRow[];
    setFlashLogRaw(logRows);

    let eurCents = 0;
    let usdcUnits = 0;
    let count = 0;
    for (const row of logRows) {
      if (row.status === 'denied') continue;
      count += 1;
      const cents = row.amount_cents ?? 0;
      if (row.payment_method === 'usdc' || row.payment_method === 'solana') {
        usdcUnits += cents / 100;
      } else if (row.payment_method !== 'free') {
        eurCents += cents;
      }
    }
    setFlashTotals({
      count,
      eur: `€${(eurCents / 100).toFixed(0)}`,
      usdc: `${usdcUnits.toFixed(0)} USDC`,
    });
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

    const watchdog = setInterval(() => {
      if (Date.now() - lastEventRef.current > 30_000) {
        bump();
        reload(profileId);
      }
    }, 30_000);

    return () => {
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(flashesChannel);
      clearInterval(watchdog);
    };
  }, [profileId, supabase, reload]);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

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

  const toggleLive = useCallback(async () => {
    if (state.kind !== 'ready' || togglingLive) return;
    const next = !state.profile.is_live;
    setTogglingLive(true);
    setState({ kind: 'ready', profile: { ...state.profile, is_live: next } });
    const { error } = await supabase.from('profiles').update({ is_live: next }).eq('id', state.profile.id);
    if (error) {
      setState({ kind: 'ready', profile: { ...state.profile, is_live: !next } });
      setErrorMsg(error.message);
    }
    setTogglingLive(false);
  }, [state, supabase, togglingLive]);

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

  const queueCountByElement = queuedBookings.reduce<Record<string, number>>((acc, b) => {
    if (!b.element_id) return acc;
    acc[b.element_id] = (acc[b.element_id] ?? 0) + 1;
    return acc;
  }, {});

  const flashLog: FlashLogItem[] = flashLogRaw.map(flashToLogItem);

  const airing: AiringItem[] = activeBookings.map((b) => {
    const bookingId = String(b.id);
    const base = bookingToAiringItem(b);
    const element = b.element_id ? elementsById[b.element_id] : undefined;
    const label = slotLabel(element);
    const subtitle = label ? `${label} · ${base.subtitle}` : base.subtitle;
    return {
      ...base,
      subtitle,
      queueCount: b.element_id ? queueCountByElement[b.element_id] : undefined,
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
        viewerLink={`www.casi.gg/overlay?s=${slug}`}
        todayEur={flashTotals.eur === '€0' ? '—' : flashTotals.eur}
        todayUsdc={flashTotals.usdc === '0 USDC' ? '—' : flashTotals.usdc}
        pending={queue.length}
      />

      {airing.length > 0 ? <AiringNow items={airing} /> : null}

      <ApprovalQueue
        items={queue}
        onApprove={handleApprove}
        onReject={handleReject}
        pendingIds={moderating}
        emptyLabel="No pending bookings · nothing to approve"
      />

      <FlashesLog
        items={flashLog}
        totals={flashTotals}
        onRefund={handleFlashRefund}
        refunding={refundingFlash}
      />
    </StudioFrame>
  );
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
