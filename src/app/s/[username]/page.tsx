'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/client';
import CasiLogo from '@/components/CasiLogo';
import SkinProvider from '@/components/SkinProvider';
import WalletNav from '@/components/WalletNav';
import StreamerBar from './_components/StreamerBar';
import StreamPreview from './_components/StreamPreview';
import FlashesFeed, { type Flash } from './_components/FlashesFeed';

const PROFILE_COLS = 'id, username, display_name, bio, avatar_url, is_live, skin, theme_color';
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
    const { data } = await supabase
      .from('flashes')
      .select(FLASH_COLS)
      .eq('profile_id', id)
      .eq('status', 'approved')
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
      <SkinProvider skin={profile.skin} themeColor={profile.theme_color} />

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
          <span
            className="inline-flex items-center gap-2 font-mono uppercase"
            style={{
              padding: '6px 12px',
              borderRadius: '999px',
              background: profile.is_live
                ? 'rgba(var(--casi-accent2-rgb), 0.08)'
                : 'var(--casi-surface)',
              border: `1px solid ${profile.is_live ? 'rgba(var(--casi-accent2-rgb), 0.3)' : 'var(--casi-border)'}`,
              color: profile.is_live ? 'var(--casi-accent2)' : 'var(--casi-text-dim)',
              fontSize: '11px',
              letterSpacing: '0.14em',
            }}
          >
            <span
              aria-hidden
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: profile.is_live ? 'var(--casi-accent2)' : 'var(--casi-text-faint)',
                boxShadow: profile.is_live ? '0 0 8px rgba(var(--casi-accent2-rgb), 0.7)' : 'none',
              }}
            />
            {profile.is_live ? 'Live' : 'Offline'}
          </span>
          <WalletNav />
        </div>
      </nav>

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
 * Hero CTA replacing the old shell BookingPanel + "still on classic overlay"
 * note. /s/[username] is positioned as the streamer's shareable landing page;
 * the actual Stripe/Solana booking flow lives at /overlay where it's been
 * battle-tested. Funnelling here keeps one canonical surface for payment +
 * escrow without duplicating the careful state machine.
 */
function BookingHero({ username, isLive }: { username: string; isLive: boolean }) {
  return (
    <div
      style={{
        padding: '28px 24px',
        background:
          'linear-gradient(160deg, rgba(var(--casi-accent-rgb), 0.10), rgba(var(--casi-accent2-rgb), 0.04))',
        border: '1px solid rgba(var(--casi-accent-rgb), 0.25)',
        borderRadius: '16px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        className="font-mono uppercase"
        style={{
          fontSize: '10px',
          letterSpacing: '0.18em',
          color: 'var(--casi-accent)',
          marginBottom: '10px',
        }}
      >
        ◇ Book a beam
      </div>
      <h2
        className="font-extrabold"
        style={{
          fontFamily: 'var(--font-casi-sans)',
          fontSize: '24px',
          lineHeight: 1.15,
          letterSpacing: '-0.8px',
          color: 'var(--casi-text)',
          marginBottom: '8px',
        }}
      >
        Put your image, video, or message on @{username}&apos;s stream.
      </h2>
      <p style={{ fontSize: '13.5px', lineHeight: 1.55, color: 'var(--casi-text-mid)', marginBottom: '18px' }}>
        Pick a slot, pick a duration, pay with card or USDC. Your beam goes
        live the moment {isLive ? '@' + username : 'the streamer'} approves it.
      </p>
      <Link
        href={`/overlay?s=${username}`}
        className="inline-flex items-center gap-2 font-bold"
        style={{
          padding: '12px 18px',
          borderRadius: '10px',
          background: 'var(--casi-accent)',
          color: '#0a0a0a',
          fontFamily: 'var(--font-casi-sans)',
          fontSize: '13px',
          textDecoration: 'none',
          letterSpacing: '-0.2px',
        }}
      >
        Open booking →
      </Link>
      <div
        className="mt-4 font-mono uppercase"
        style={{
          fontSize: '9px',
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
