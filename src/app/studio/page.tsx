'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/client';
import CasiLogo from '@/components/CasiLogo';
import AiringNow, { type AiringItem } from './_components/AiringNow';
import ApprovalQueue, { type QueueItem } from './_components/ApprovalQueue';
import FlashesLog, { type FlashLogItem } from './_components/FlashesLog';

// Explicit column lists — mirrors the admin page convention (no select('*')).
const BOOKING_COLS =
  'id, created_at, profile_id, viewer_name, status, file_type, message, duration_minutes, price_value, price_unit, payment_method, started_at, image_url';
const FLASH_COLS =
  'id, created_at, profile_id, viewer_name, status, message, amount_cents, payment_method';

const LOG_LIMIT = 50;

function timeAgo(createdAt: string): string {
  const delta = Date.now() - new Date(createdAt).getTime();
  const secs = Math.floor(delta / 1000);
  if (secs < 30) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const d = new Date(createdAt);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function logTime(createdAt: string): string {
  if (Date.now() - new Date(createdAt).getTime() < 30_000) return 'just now';
  const d = new Date(createdAt);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatRemaining(secs: number): string {
  if (secs <= 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

type BookingRow = {
  id: number | string;
  created_at: string;
  viewer_name: string | null;
  status: string;
  file_type: string | null;
  message: string | null;
  duration_minutes: number | string;
  price_value: number | string;
  price_unit: string | null;
  payment_method: string | null;
  started_at: string | null;
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

function bookingToAiringItem(b: BookingRow): AiringItem {
  const who = b.viewer_name || 'anon';
  const snippet = b.message ? `"${b.message.slice(0, 40)}"` : b.file_type === 'video' ? 'video clip' : 'image';
  const isUsdc = b.payment_method === 'usdc' || b.payment_method === 'solana';
  const priceLabel = isUsdc ? `${Number(b.price_value)} USDC` : `€${Number(b.price_value)}`;
  // Remaining = duration_minutes * 60 - elapsed since started_at.
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
    // No remaining: flashes don't auto-expire server-side (status is
    // pending/approved/denied). Once approved they stay on stream until the
    // streamer clears them.
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
  // Flash status enum is just pending | approved | denied (see 20260416000000_create_flashes.sql).
  // Denied = streamer rejected and viewer got refunded.
  return {
    id: f.id,
    time: logTime(f.created_at),
    who: f.viewer_name || 'anon',
    message: f.message || '',
    chip: { kind: chipKind, label: chipLabel },
    refunded: f.status === 'denied',
  };
}

type Profile = { id: string; username: string | null };

type LoadState =
  | { kind: 'loading' }
  | { kind: 'anonymous' }
  | { kind: 'missing-profile' }
  | { kind: 'ready'; profile: Profile };

export default function StudioPage() {
  const router = useRouter();
  const [supabase] = useState<SupabaseClient>(() => createClient());
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const [queue, setQueue] = useState<QueueItem[]>([]);
  // Stored as raw rows so the 1-sec tick can recompute remaining timers without refetching.
  const [activeBookings, setActiveBookings] = useState<BookingRow[]>([]);
  const [recentFlashes, setRecentFlashes] = useState<FlashRow[]>([]);
  const [flashLog, setFlashLog] = useState<FlashLogItem[]>([]);
  const [flashTotals, setFlashTotals] = useState({ count: 0, eur: '€0', usdc: '0 USDC' });

  // Bump once per second so airing remaining-time counters re-render; the stored
  // timestamps are authoritative, so we just recompute display on each tick.
  const [, setTick] = useState(0);

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
        // Flashes currently on stream — approved with no terminal status transition.
        // No time window: flashes don't auto-expire, they stay visible until the
        // streamer clears or refunds them.
        supabase.from('flashes').select(FLASH_COLS)
          .eq('profile_id', profileId).eq('status', 'approved')
          .order('created_at', { ascending: false }).limit(20),
        supabase.from('flashes').select(FLASH_COLS)
          .eq('profile_id', profileId)
          .in('status', ['approved', 'denied'])
          .gte('created_at', startOfDayIso.toISOString())
          .order('created_at', { ascending: false }).limit(LOG_LIMIT),
      ]);

    const pendingBookings = (pendingBookingsRes.data ?? []) as BookingRow[];
    const pendingFlashes = (pendingFlashesRes.data ?? []) as FlashRow[];
    const actives = (activeBookingsRes.data ?? []) as BookingRow[];
    const airFlashes = (airingFlashesRes.data ?? []) as FlashRow[];
    const logRows = (logFlashesRes.data ?? []) as FlashRow[];

    const mergedQueue = [
      ...pendingBookings.map((b) => ({ item: bookingToQueueItem(b), ts: new Date(b.created_at).getTime() })),
      ...pendingFlashes.map((f) => ({ item: flashToQueueItem(f), ts: new Date(f.created_at).getTime() })),
    ].sort((a, b) => b.ts - a.ts).map(({ item }) => item);

    setQueue(mergedQueue);
    setActiveBookings(actives);
    setRecentFlashes(airFlashes);
    setFlashLog(logRows.map(flashToLogItem));

    // Totals: count approved flashes today, sum EUR and USDC separately.
    // Denied rows are in logRows (the UI shows them struck through) but excluded
    // from totals.
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

  // Auth + initial profile fetch.
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
        .select('id, username')
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

  // Realtime subscriptions + 30s watchdog refetch — mirrors admin/page.tsx.
  useEffect(() => {
    if (!profileId) return;
    lastEventRef.current = Date.now();
    reload(profileId);

    const bump = () => { lastEventRef.current = Date.now(); };

    const bookingsChannel = supabase
      .channel(`studio_bookings_${profileId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `profile_id=eq.${profileId}` },
        () => { bump(); reload(profileId); },
      )
      .subscribe();

    const flashesChannel = supabase
      .channel(`studio_flashes_${profileId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'flashes', filter: `profile_id=eq.${profileId}` },
        () => { bump(); reload(profileId); },
      )
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

  // Tick every second — updates airing remaining-time displays and prunes
  // flashes that aged past their 15s window without waiting for the next event.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (state.kind === 'loading' || state.kind === 'anonymous') {
    return <StatusScreen>Loading studio…</StatusScreen>;
  }
  if (state.kind === 'missing-profile') {
    return <StatusScreen>Finish signup first — no profile row for this account.</StatusScreen>;
  }

  const { profile } = state;
  const slug = profile.username ?? 'streamer';

  // Airing: active beams (countdown) + approved flashes (persistent on stream).
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
        </div>
      </nav>

      <div
        className="mx-auto flex flex-col gap-5 casi-page-pad"
        style={{ maxWidth: '1080px' }}
      >
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className="font-extrabold"
              style={{ fontSize: '22px', letterSpacing: '-0.8px', color: 'var(--casi-text)' }}
            >
              @{slug}
            </span>
            <StatChip label="Airing" value={String(airing.length)} tone="accent" />
            <StatChip label="Pending" value={String(queue.length)} tone="accent2" />
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/studio/setup"
              className="font-mono uppercase"
              style={{
                fontSize: '10px',
                letterSpacing: '0.15em',
                textDecoration: 'none',
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid var(--casi-border-2)',
                color: 'var(--casi-text-dim)',
              }}
            >
              Configure slots →
            </Link>
            <Link
              href="/admin/settings"
              className="font-mono uppercase"
              style={{
                fontSize: '10px',
                letterSpacing: '0.15em',
                textDecoration: 'none',
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid var(--casi-border-2)',
                color: 'var(--casi-text-dim)',
              }}
            >
              Settings →
            </Link>
          </div>
        </header>

        {airing.length > 0 ? <AiringNow items={airing} /> : null}
        <ApprovalQueue
          items={queue}
          readOnly
          emptyLabel="No pending bookings · nothing to approve"
        />
        <FlashesLog items={flashLog} totals={flashTotals} />
      </div>
    </main>
  );
}

function StatChip({ label, value, tone }: { label: string; value: string; tone?: 'accent' | 'accent2' }) {
  const colour =
    tone === 'accent2' ? 'var(--casi-accent2)' : tone === 'accent' ? 'var(--casi-accent)' : 'var(--casi-text)';
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono uppercase"
      style={{
        padding: '6px 10px',
        borderRadius: '8px',
        background: 'var(--casi-surface)',
        border: '1px solid var(--casi-border)',
        fontSize: '10px',
        letterSpacing: '0.14em',
        color: 'var(--casi-text-faint)',
      }}
    >
      {label}
      <span style={{ color: colour, fontWeight: 500, letterSpacing: '-0.2px' }}>{value}</span>
    </span>
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
