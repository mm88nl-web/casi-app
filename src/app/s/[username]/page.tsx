'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/client';
import SkinProvider from '@/components/SkinProvider';
import Nav from '@/components/Nav';
import StreamerBar from './_components/StreamerBar';
import StreamPreview from './_components/StreamPreview';
import FlashesFeed, { type Flash } from './_components/FlashesFeed';

const PROFILE_COLS = 'id, username, display_name, bio, avatar_url, is_live, skin, theme_color, ink_color, paper_color';
const FLASH_COLS = 'id, created_at, viewer_name, status, message, amount_cents, payment_method';

type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_live: boolean | null;
  skin: string | null;
  theme_color: string | null;
  ink_color: string | null;
  paper_color: string | null;
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

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'ready'; profile: Profile };

function logTime(createdAt: string): string {
  if (Date.now() - new Date(createdAt).getTime() < 30_000) return 'just now';
  const d = new Date(createdAt);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function flashRowToFlash(f: FlashRow): Flash {
  const isUsdc = f.payment_method === 'usdc' || f.payment_method === 'solana';
  const isFree = f.payment_method === 'free';
  const chipKind: Flash['chip']['kind'] = isFree ? 'free' : isUsdc ? 'usdc' : 'eur';
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
  };
}

export default function ViewerBookingPage() {
  const params = useParams();
  const username = (params?.username as string) || '';
  const [supabase] = useState<SupabaseClient>(() => createClient());
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [flashes, setFlashes] = useState<Flash[]>([]);

  // Look up the streamer by slug.
  useEffect(() => {
    if (!username) {
      setState({ kind: 'not-found' });
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLS)
        .eq('username', username)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setState({ kind: 'not-found' });
        return;
      }
      setState({ kind: 'ready', profile: data as Profile });
    };
    load();
    return () => { cancelled = true; };
  }, [supabase, username]);

  const profileId = state.kind === 'ready' ? state.profile.id : null;

  const loadFlashes = useCallback(async (id: string) => {
    // Today-only window — yesterday's flashes shouldn't make a quiet stream
    // look "active" on the public landing page. Browser-local midnight, same
    // boundary studio's Today tile uses.
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('flashes')
      .select(FLASH_COLS)
      .eq('profile_id', id)
      .eq('status', 'approved')
      .gte('created_at', startOfDay.toISOString())
      .order('created_at', { ascending: false })
      .limit(30);
    setFlashes(((data ?? []) as FlashRow[]).map(flashRowToFlash));
  }, [supabase]);

  // Realtime subscription on flashes for this streamer.
  const lastEventRef = useRef(Date.now());
  useEffect(() => {
    if (!profileId) return;
    lastEventRef.current = Date.now();
    loadFlashes(profileId);

    const bump = () => { lastEventRef.current = Date.now(); };
    const channel = supabase
      .channel(`viewer_flashes_${profileId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'flashes', filter: `profile_id=eq.${profileId}` },
        () => { bump(); loadFlashes(profileId); },
      )
      .subscribe();

    const watchdog = setInterval(() => {
      if (Date.now() - lastEventRef.current > 30_000) {
        bump();
        loadFlashes(profileId);
      }
    }, 30_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(watchdog);
    };
  }, [profileId, supabase, loadFlashes]);

  if (state.kind === 'loading') {
    return <StatusScreen>Loading @{username}…</StatusScreen>;
  }
  if (state.kind === 'not-found') {
    return (
      <StatusScreen>
        No streamer named @{username || '?'}.{' '}
        <Link href="/" style={{ color: 'var(--casi-accent)', textDecoration: 'none' }}>
          Browse ↩
        </Link>
      </StatusScreen>
    );
  }

  const { profile } = state;

  return (
    <main className="min-h-screen" style={{ background: 'var(--casi-bg)', color: 'var(--casi-text)' }}>
      {/* Inherit the streamer's skin + theme colour — this overrides the user-picked skin for this page. */}
      <SkinProvider
        skin={profile.skin}
        inkColor={profile.ink_color ?? profile.theme_color}
        paperColor={profile.paper_color}
      />

      {/* v7 nav. The live badge moved into StreamerBar (vb-head) since v7
          surfaces it there next to the streamer's avatar; keeping it in the
          nav too would be redundant. */}
      <Nav />

      <div
        className="mx-auto casi-grid-viewer casi-page-pad"
        style={{ maxWidth: '1360px' }}
      >
        <div className="flex flex-col gap-4">
          <StreamerBar
            username={profile.username}
            displayName={profile.display_name}
            avatarUrl={profile.avatar_url}
            bio={profile.bio}
            isLive={!!profile.is_live}
          />
          <StreamPreview />
          {flashes.length > 0 ? <FlashesFeed flashes={flashes} /> : null}
        </div>

        <div className="flex flex-col gap-3">
          <BookingHero username={profile.username} isLive={!!profile.is_live} />
        </div>
      </div>
    </main>
  );
}

/**
 * Right-column CTA on the streamer's public landing page. /s/[username]
 * itself is a sharable bio/landing surface; the actual Stripe + Solana
 * booking flow lives at /overlay where the careful state machine is
 * battle-tested. This card funnels visitors there without duplicating
 * the booking surface in two places.
 *
 * v9-aligned: sharp edges, single-color confident type, the three
 * protocol guarantees (0% cut, you approve, refund on deny) inlined as
 * mono caps so a first-time visitor sees the trust contract without
 * scrolling.
 */
function BookingHero({ username, isLive }: { username: string; isLive: boolean }) {
  return (
    <div
      style={{
        padding: '32px 28px',
        background: 'var(--casi-surface)',
        border: '1px solid var(--casi-border-2)',
        borderRadius: '12px',
        position: 'relative',
      }}
    >
      <div
        className="font-mono uppercase"
        style={{
          fontSize: '10px',
          letterSpacing: '0.2em',
          color: 'var(--casi-accent)',
          marginBottom: '14px',
        }}
      >
        ◇ Book a slot
      </div>
      <h2
        className="font-extrabold"
        style={{
          fontFamily: 'var(--font-casi-display), var(--font-casi-sans), sans-serif',
          fontSize: '28px',
          lineHeight: 1.1,
          letterSpacing: '-1px',
          color: 'var(--casi-text)',
          marginBottom: '10px',
        }}
      >
        Put your image, video, or message on{' '}
        <span style={{ color: 'var(--casi-accent)' }}>@{username}</span>&apos;s stream.
      </h2>
      <p
        style={{
          fontSize: '14px',
          lineHeight: 1.55,
          color: 'var(--casi-text-mid)',
          marginBottom: '22px',
        }}
      >
        Pick a slot, pick a duration, pay with card or USDC. Your beam goes live the moment{' '}
        {isLive ? `@${username}` : 'the streamer'} approves it — or you get a full refund.
      </p>

      {/* Three protocol guarantees in mono caps — the trust contract */}
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: '0 0 24px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {[
          ['0%', 'casi takes nothing'],
          ['→', 'you approve every one'],
          ['↺', 'denied = instant refund'],
        ].map(([icon, label]) => (
          <li
            key={label}
            className="font-mono uppercase"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '10.5px',
              letterSpacing: '0.18em',
              color: 'var(--casi-text-mid)',
            }}
          >
            <span style={{ color: 'var(--casi-accent)', minWidth: '20px', fontWeight: 700 }}>
              {icon}
            </span>
            {label}
          </li>
        ))}
      </ul>

      <Link
        href={`/overlay?s=${username}`}
        className="inline-flex items-center"
        style={{
          gap: '12px',
          padding: '14px 22px',
          background: 'var(--casi-accent)',
          color: '#0a0a0a',
          fontFamily: 'var(--font-casi-display), var(--font-casi-sans), sans-serif',
          fontSize: '12.5px',
          fontWeight: 700,
          textDecoration: 'none',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
        }}
      >
        Open booking
        <span style={{ fontFamily: 'var(--font-casi-mono), monospace' }}>→</span>
      </Link>
      <div
        className="font-mono uppercase"
        style={{
          marginTop: '18px',
          fontSize: '9.5px',
          letterSpacing: '0.18em',
          color: 'var(--casi-text-faint)',
        }}
      >
        Card: settles weekly · USDC: instant on approval
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
