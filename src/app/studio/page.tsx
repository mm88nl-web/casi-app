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
  'id, created_at, profile_id, viewer_name, status, file_type, message, duration_minutes, price_value, price_unit, payment_method';
const FLASH_COLS =
  'id, created_at, profile_id, viewer_name, status, message, amount_cents, payment_method';

// Airing + flashes-log still mocked — wiring those comes in a follow-up.
const AIRING: AiringItem[] = [
  { id: 'a1', icon: '⚡', name: 'rina_42 · "happy bday pixel"', subtitle: 'Flash · €1', remaining: '0:12' },
  { id: 'a2', icon: '🌊', name: 'bluefin · animated logo', subtitle: 'Beam · €18', remaining: '2:47' },
];
const FLASHES_MOCK: FlashLogItem[] = [
  { id: 'l1', time: 'just now', who: 'MegaFox38', message: 'waaaaaa', chip: { kind: 'usdc', label: '2 USDC' } },
  { id: 'l2', time: '19:22', who: 'MegaFox38', message: 'eeeee', chip: { kind: 'free', label: 'Free' } },
  { id: 'l3', time: '19:12', who: 'MegaFox38', message: 'lllll', chip: { kind: 'usdc', label: '5 USDC' }, pinned: true },
  { id: 'l4', time: '18:45', who: 'nova', message: 'gg from berlin 🍻', chip: { kind: 'usdc', label: '2 USDC' } },
];

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

type BookingRow = {
  id: number | string;
  created_at: string;
  viewer_name: string | null;
  file_type: string | null;
  message: string | null;
  duration_minutes: number | string;
  price_value: number | string;
  price_unit: string | null;
  payment_method: string | null;
};

type FlashRow = {
  id: string;
  created_at: string;
  viewer_name: string | null;
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
  const priceLabel = isUsdc
    ? `${Number(b.price_value)} USDC`
    : `€${Number(b.price_value)}`;
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
    ? 'USDC'
    : `€${((f.amount_cents ?? 0) / 100).toFixed(2)}`;
  return {
    id: `flash-${f.id}`,
    kind: 'flash',
    name: `${who} · "${snippet}${overflow ? '…' : ''}"`,
    subtitle: `${timeAgo(f.created_at)} · ${isUsdc ? 'USDC' : 'paid'} · text`,
    priceLabel,
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

  const loadQueue = useCallback(async (profileId: string) => {
    const [bookingsRes, flashesRes] = await Promise.all([
      supabase
        .from('bookings')
        .select(BOOKING_COLS)
        .eq('profile_id', profileId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('flashes')
        .select(FLASH_COLS)
        .eq('profile_id', profileId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    const bookings = (bookingsRes.data ?? []) as BookingRow[];
    const flashes = (flashesRes.data ?? []) as FlashRow[];

    // Merge + sort newest-first across both tables.
    const merged = [
      ...bookings.map((b) => ({ item: bookingToQueueItem(b), ts: new Date(b.created_at).getTime() })),
      ...flashes.map((f) => ({ item: flashToQueueItem(f), ts: new Date(f.created_at).getTime() })),
    ].sort((a, b) => b.ts - a.ts);

    setQueue(merged.map(({ item }) => item));
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

  // Realtime subscriptions + 30s watchdog refetch, mirroring admin/page.tsx.
  const profileId = state.kind === 'ready' ? state.profile.id : null;
  const lastEventRef = useRef(Date.now());

  useEffect(() => {
    if (!profileId) return;
    lastEventRef.current = Date.now();
    loadQueue(profileId);

    const bump = () => { lastEventRef.current = Date.now(); };

    const bookingsChannel = supabase
      .channel(`studio_bookings_${profileId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `profile_id=eq.${profileId}` },
        () => { bump(); loadQueue(profileId); },
      )
      .subscribe();

    const flashesChannel = supabase
      .channel(`studio_flashes_${profileId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'flashes', filter: `profile_id=eq.${profileId}` },
        () => { bump(); loadQueue(profileId); },
      )
      .subscribe();

    // If the websocket goes silent for 30s, refetch — guards against missed INSERTs.
    const watchdog = setInterval(() => {
      if (Date.now() - lastEventRef.current > 30_000) {
        bump();
        loadQueue(profileId);
      }
    }, 30_000);

    return () => {
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(flashesChannel);
      clearInterval(watchdog);
    };
  }, [profileId, supabase, loadQueue]);

  if (state.kind === 'loading' || state.kind === 'anonymous') {
    return <StatusScreen>Loading studio…</StatusScreen>;
  }
  if (state.kind === 'missing-profile') {
    return <StatusScreen>Finish signup first — no profile row for this account.</StatusScreen>;
  }

  const { profile } = state;
  const slug = profile.username ?? 'streamer';

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

        <AiringNow items={AIRING} />
        <ApprovalQueue
          items={queue}
          readOnly
          emptyLabel="No pending bookings · nothing to approve"
        />
        <FlashesLog items={FLASHES_MOCK} totals={{ count: 38, eur: '€52', usdc: '18 USDC' }} />
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
