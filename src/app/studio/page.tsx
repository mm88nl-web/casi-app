'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { createClient } from '@/utils/supabase/client';
import { WALLET_ADAPTER_CLUSTER } from '@/lib/solana-network';
import { approveBooking, denyBooking, type ModerationContext } from '@/lib/streamer-moderation';
import CasiLogo from '@/components/CasiLogo';
import WalletNav from '@/components/WalletNav';
import AiringNow, { type AiringItem } from './_components/AiringNow';
import ApprovalQueue, { type QueueItem } from './_components/ApprovalQueue';
import FlashesLog, { type FlashLogItem } from './_components/FlashesLog';
import StudioLiveEditor from './_components/StudioLiveEditor';

// Explicit column lists. BOOKING_COLS adds the moderation-critical fields the
// old /studio page didn't need: element_id / is_queued (slot + queue logic),
// escrow_pda / viewer_wallet (Solana settle on deny), image_url (overlay copy
// on approve).
const BOOKING_COLS =
  'id, created_at, profile_id, element_id, viewer_name, status, file_type, message, image_url, duration_minutes, price_value, price_unit, payment_method, started_at, escrow_pda, viewer_wallet, is_queued';
const FLASH_COLS =
  'id, created_at, profile_id, viewer_name, status, message, amount_cents, payment_method';
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
};

function bookingToQueueItem(b: BookingRow): QueueItem {
  const who = b.viewer_name || 'anon';
  const snippet = b.message
    ? `"${b.message.slice(0, 28)}${b.message.length > 28 ? '…' : ''}"`
    : b.file_type === 'video'
      ? 'video clip'
      : 'image';
  const duration = Number(b.duration_minutes) || 0;
  const isUsdc = b.payment_method === 'usdc' || b.payment_method === 'solana';
  const priceLabel = isUsdc ? `${Number(b.price_value)} USDC` : `€${Number(b.price_value)}`;
  return {
    id: `booking-${b.id}`,
    kind: 'beam',
    name: `${who} · ${snippet}`,
    subtitle: `${timeAgo(b.created_at)} · ${isUsdc ? 'USDC' : 'paid'} · ${duration}m${b.file_type === 'video' ? ' · video' : ''}`,
    priceLabel,
    readOnly: false,
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
    // Flash moderation has its own on-chain flow (approve_flash / deny_flash)
    // that isn't wired here yet — route the streamer to /admin for now.
    readOnly: true,
  };
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

function flashToAiringItem(f: FlashRow): AiringItem {
  const who = f.viewer_name || 'anon';
  const snippet = (f.message || '').slice(0, 40);
  const isUsdc = f.payment_method === 'usdc' || f.payment_method === 'solana';
  const priceLabel = f.payment_method === 'free'
    ? 'Free'
    : isUsdc
      ? `${((f.amount_cents ?? 0) / 100).toFixed(2)} USDC`
      : `€${((f.amount_cents ?? 0) / 100).toFixed(2)}`;
  return {
    id: `flash-${f.id}`,
    icon: '⚡',
    name: `${who} · "${snippet}"`,
    subtitle: `Flash · ${priceLabel}`,
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
  const [recentFlashes, setRecentFlashes] = useState<FlashRow[]>([]);
  const [flashLog, setFlashLog] = useState<FlashLogItem[]>([]);
  const [flashTotals, setFlashTotals] = useState({ count: 0, eur: '€0', usdc: '0 USDC' });
  const [moderating, setModerating] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [togglingLive, setTogglingLive] = useState(false);
  const [mode, setMode] = useState<'monitor' | 'live'>('monitor');

  const [, setTick] = useState(0);

  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();

  const reload = useCallback(async (profileId: string) => {
    const startOfDayIso = new Date();
    startOfDayIso.setHours(0, 0, 0, 0);

    const [pendingBookingsRes, pendingFlashesRes, activeBookingsRes, airingFlashesRes, logFlashesRes] =
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
        supabase.from('flashes').select(FLASH_COLS)
          .eq('profile_id', profileId).eq('status', 'approved')
          .order('created_at', { ascending: false }).limit(20),
        supabase.from('flashes').select(FLASH_COLS)
          .eq('profile_id', profileId)
          .in('status', ['approved', 'denied'])
          .gte('created_at', startOfDayIso.toISOString())
          .order('created_at', { ascending: false }).limit(LOG_LIMIT),
      ]);

    setPendingBookings((pendingBookingsRes.data ?? []) as BookingRow[]);
    setPendingFlashes((pendingFlashesRes.data ?? []) as FlashRow[]);
    setActiveBookings((activeBookingsRes.data ?? []) as BookingRow[]);
    setRecentFlashes((airingFlashesRes.data ?? []) as FlashRow[]);

    const logRows = (logFlashesRes.data ?? []) as FlashRow[];
    setFlashLog(logRows.map(flashToLogItem));

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
    const raw = queueId.startsWith('booking-') ? queueId.slice('booking-'.length) : null;
    if (!raw) return;
    const booking = pendingBookings.find((b) => String(b.id) === raw);
    if (!booking) return;

    markModerating(queueId, true);
    setErrorMsg(null);
    const result = await approveBooking(moderationCtx, booking);
    markModerating(queueId, false);

    if (!result.ok) {
      setErrorMsg(result.message);
      return;
    }
    // Optimistic — realtime will converge.
    setPendingBookings((prev) => prev.filter((b) => String(b.id) !== raw));
  }, [moderationCtx, pendingBookings, markModerating]);

  const toggleLive = useCallback(async () => {
    if (state.kind !== 'ready' || togglingLive) return;
    const next = !state.profile.is_live;
    setTogglingLive(true);
    // Optimistic — revert on failure so the streamer sees the right state
    // if the RLS policy or the network swats the write.
    setState({ kind: 'ready', profile: { ...state.profile, is_live: next } });
    const { error } = await supabase.from('profiles').update({ is_live: next }).eq('id', state.profile.id);
    if (error) {
      setState({ kind: 'ready', profile: { ...state.profile, is_live: !next } });
      setErrorMsg(error.message);
    }
    setTogglingLive(false);
  }, [state, supabase, togglingLive]);

  const handleReject = useCallback(async (queueId: string) => {
    if (!moderationCtx) return;
    const raw = queueId.startsWith('booking-') ? queueId.slice('booking-'.length) : null;
    if (!raw) return;
    const booking = pendingBookings.find((b) => String(b.id) === raw);
    if (!booking) return;

    markModerating(queueId, true);
    setErrorMsg(null);
    const result = await denyBooking(moderationCtx, String(booking.id), booking.payment_method);
    markModerating(queueId, false);

    if (!result.ok) {
      setErrorMsg(result.message);
      return;
    }
    setPendingBookings((prev) => prev.filter((b) => String(b.id) !== raw));
  }, [moderationCtx, pendingBookings, markModerating]);

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
      item: bookingToQueueItem(b),
      ts: new Date(b.created_at).getTime(),
    })),
    ...pendingFlashes.map((f) => ({
      item: flashToQueueItem(f),
      ts: new Date(f.created_at).getTime(),
    })),
  ].sort((a, b) => b.ts - a.ts).map(({ item }) => item);

  const airing: AiringItem[] = [
    ...activeBookings.map(bookingToAiringItem),
    ...recentFlashes.map(flashToAiringItem),
  ];

  return (
    <main className="min-h-screen" style={{ background: 'var(--casi-bg)', color: 'var(--casi-text)' }}>
      <nav
        className="flex items-center justify-between"
        style={{ padding: '18px 32px', borderBottom: '1px solid var(--casi-border)' }}
      >
        <Link
          href="/"
          className="flex items-center gap-2"
          style={{ color: 'var(--casi-text)', textDecoration: 'none' }}
        >
          <CasiLogo size={72} />
          <span
            className="font-extrabold"
            style={{ fontFamily: 'var(--font-casi-sans)', fontSize: '22px', letterSpacing: '-1px' }}
          >
            casi
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            title="Classic studio (current production)"
            className="font-mono uppercase"
            style={{
              fontSize: '10px',
              letterSpacing: '0.15em',
              textDecoration: 'none',
              color: 'var(--casi-text-dim)',
              padding: '5px 10px',
              borderRadius: '999px',
              border: '1px solid var(--casi-border-2)',
            }}
          >
            ↩ Classic studio
          </Link>
          <span
            className="font-mono uppercase"
            style={{
              padding: '6px 12px',
              borderRadius: '999px',
              background: 'rgba(var(--casi-accent-rgb), 0.08)',
              border: '1px solid rgba(var(--casi-accent-rgb), 0.3)',
              color: 'var(--casi-accent)',
              fontSize: '11px',
              letterSpacing: '0.14em',
            }}
          >
            Studio · beta
          </span>
          <WalletNav />
        </div>
      </nav>

      <div
        className="mx-auto flex flex-col gap-5 casi-page-pad"
        style={{ maxWidth: '1240px' }}
      >
        {/* Welcome banner — design-faithful hero row */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1
              className="font-extrabold"
              style={{
                fontSize: '30px',
                letterSpacing: '-1.2px',
                lineHeight: 1.05,
                color: 'var(--casi-text)',
              }}
            >
              Welcome back,{' '}
              <span style={{ color: 'var(--casi-accent)' }}>@{slug}</span>
            </h1>
            <p className="mt-1" style={{ fontSize: '14px', color: 'var(--casi-text-dim)' }}>
              Your stream. Your slots. Your rates. One page.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {profile.is_live ? (
              <span
                className="inline-flex items-center gap-2 font-mono uppercase"
                style={{
                  padding: '10px 16px',
                  borderRadius: '999px',
                  background: 'rgba(var(--casi-accent2-rgb), 0.1)',
                  border: '1px solid rgba(var(--casi-accent2-rgb), 0.3)',
                  fontSize: '11px',
                  letterSpacing: '0.15em',
                  color: 'var(--casi-accent2)',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: 'var(--casi-accent2)',
                    boxShadow: '0 0 8px rgba(var(--casi-accent2-rgb), 0.7)',
                  }}
                />
                Live
              </span>
            ) : (
              <span
                className="font-mono uppercase"
                style={{
                  padding: '10px 16px',
                  borderRadius: '999px',
                  background: 'var(--casi-surface)',
                  border: '1px solid var(--casi-border)',
                  fontSize: '11px',
                  letterSpacing: '0.15em',
                  color: 'var(--casi-text-dim)',
                }}
              >
                Offline
              </span>
            )}
            <button
              type="button"
              onClick={toggleLive}
              disabled={togglingLive}
              className="font-mono uppercase transition-colors"
              title={profile.is_live ? 'Go offline' : 'Go live'}
              style={{
                padding: '10px 16px',
                borderRadius: '10px',
                border: `1px solid ${profile.is_live ? 'var(--casi-border-2)' : 'rgba(var(--casi-accent2-rgb), 0.3)'}`,
                background: profile.is_live ? 'transparent' : 'rgba(var(--casi-accent2-rgb), 0.08)',
                color: profile.is_live ? 'var(--casi-text-dim)' : 'var(--casi-accent2)',
                fontSize: '11px',
                letterSpacing: '0.15em',
                cursor: togglingLive ? 'wait' : 'pointer',
                opacity: togglingLive ? 0.5 : 1,
              }}
            >
              {profile.is_live ? 'End stream ⏹' : 'Go live ●'}
            </button>
          </div>
        </header>

        {/* Mode toggle — flips in-page between the live monitor and the
            slot editor. No route change, state preserved across taps. */}
        <div className="flex items-center justify-between gap-5 flex-wrap">
          <div
            className="inline-flex gap-0.5"
            style={{
              background: 'var(--casi-surface)',
              border: '1px solid var(--casi-border)',
              borderRadius: '12px',
              padding: '4px',
            }}
          >
            {(['monitor', 'live'] as const).map((m) => {
              const active = mode === m;
              const label = m === 'monitor' ? 'Dashboard' : 'Live';
              const icon = m === 'monitor' ? '◉' : '⚙';
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-current={active ? 'page' : undefined}
                  className="inline-flex items-center gap-2 font-bold"
                  style={{
                    padding: '10px 18px',
                    borderRadius: '8px',
                    background: active ? 'var(--casi-accent)' : 'transparent',
                    color: active ? '#0a0a0a' : 'var(--casi-text-dim)',
                    fontSize: '13px',
                    letterSpacing: '-0.1px',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-casi-sans)',
                  }}
                >
                  <span aria-hidden className="font-mono" style={{ fontSize: '11px' }}>{icon}</span>
                  {label}
                  {m === 'monitor' && queue.length > 0 ? (
                    <span
                      className="font-mono"
                      style={{
                        padding: '2px 6px',
                        borderRadius: '999px',
                        background: active ? 'rgba(0, 0, 0, 0.25)' : 'rgba(var(--casi-accent-rgb), 0.15)',
                        color: active ? '#0a0a0a' : 'var(--casi-accent)',
                        fontSize: '10px',
                        letterSpacing: '0.1em',
                      }}
                    >
                      {queue.length}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <span
            className="font-mono uppercase"
            style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--casi-text-faint)' }}
          >
            {mode === 'monitor' ? "Live · what's happening now" : 'Slots · prices · approvals'}
          </span>
        </div>

        {/* Earnings strip — viewer link + today's totals + pending count */}
        <EarningsStrip
          slug={slug}
          earnedTodayEur={flashTotals.eur}
          earnedTodayUsdc={flashTotals.usdc}
          pendingCount={queue.length}
          onCopyLink={() => {
            navigator.clipboard?.writeText(`https://www.casi.gg/overlay?s=${slug}`).catch(() => {});
          }}
        />

        {errorMsg ? (
          <div
            className="flex items-center justify-between gap-3"
            style={{
              padding: '12px 16px',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              borderRadius: '12px',
              fontSize: '13px',
            }}
            role="alert"
          >
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              aria-label="Dismiss"
              className="font-mono uppercase"
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                background: 'transparent',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#f87171',
                fontSize: '10px',
                letterSpacing: '0.14em',
                cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {mode === 'monitor' ? (
          <>
            {airing.length > 0 ? <AiringNow items={airing} /> : null}
            <ApprovalQueue
              items={queue}
              onApprove={handleApprove}
              onReject={handleReject}
              pendingIds={moderating}
              emptyLabel="No pending bookings · nothing to approve"
            />
            <FlashesLog items={flashLog} totals={flashTotals} />
          </>
        ) : (
          <StudioLiveEditor supabase={supabase} profileId={profile.id} />
        )}
      </div>
    </main>
  );
}

function EarningsStrip({
  slug,
  earnedTodayEur,
  earnedTodayUsdc,
  pendingCount,
  onCopyLink,
}: {
  slug: string;
  earnedTodayEur: string;
  earnedTodayUsdc: string;
  pendingCount: number;
  onCopyLink: () => void;
}) {
  return (
    <div className="casi-grid-earnings">
      {/* Viewer link tile — primary affordance for sharing. */}
      <div
        className="flex items-center gap-3 min-w-0"
        style={{
          background: 'var(--casi-surface)',
          border: '1px solid var(--casi-border)',
          borderRadius: '14px',
          padding: '16px 18px',
          minHeight: '78px',
        }}
      >
        <div className="flex-1 min-w-0">
          <div
            className="font-mono uppercase"
            style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--casi-text-faint)' }}
          >
            Your viewer link
          </div>
          <div
            className="font-mono truncate"
            style={{ fontSize: '14px', color: 'var(--casi-text)', marginTop: '2px' }}
          >
            <span style={{ color: 'var(--casi-text-dim)' }}>www.casi.gg/overlay?s=</span>
            <span style={{ color: 'var(--casi-accent)', fontWeight: 500 }}>{slug}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onCopyLink}
          className="whitespace-nowrap font-bold"
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            background: 'var(--casi-accent)',
            color: '#050505',
            fontFamily: 'var(--font-casi-sans)',
            fontWeight: 800,
            fontSize: '12px',
            border: 'none',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          Copy
        </button>
      </div>

      <StatTile label="Today · EUR" value={earnedTodayEur} tone="accent" />
      <StatTile label="Today · USDC" value={earnedTodayUsdc} />
      <StatTile label="Pending" value={String(pendingCount)} tone="accent2" />
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: 'accent' | 'accent2' }) {
  const color =
    tone === 'accent' ? 'var(--casi-accent)' : tone === 'accent2' ? 'var(--casi-accent2)' : 'var(--casi-text)';
  return (
    <div
      className="flex flex-col justify-center gap-1.5"
      style={{
        background: 'var(--casi-surface)',
        border: '1px solid var(--casi-border)',
        borderRadius: '14px',
        padding: '16px 18px',
        minHeight: '78px',
      }}
    >
      <div
        className="font-mono uppercase"
        style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--casi-text-faint)' }}
      >
        {label}
      </div>
      <div
        className="font-mono"
        style={{
          fontSize: '22px',
          fontWeight: 500,
          letterSpacing: '-0.5px',
          lineHeight: 1,
          color,
        }}
      >
        {value}
      </div>
    </div>
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
