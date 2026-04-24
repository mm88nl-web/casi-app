'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import CasiLogo from '@/components/CasiLogo';
import WalletNav from '@/components/WalletNav';
import SettingsLayout, { type RailGroup } from './_components/SettingsLayout';
import ProfileSection, { type ProfileRow } from './_components/ProfileSection';
import PayoutsSection from './_components/PayoutsSection';
import SessionKeySection from './_components/SessionKeySection';
import AppearanceSection from './_components/AppearanceSection';
import ObsSourcesSection from './_components/ObsSourcesSection';

// Rail groups after the cleanup pass. Dropped: Slot defaults (per-slot
// prices live on overlay_elements, not a profile default — redundant
// surface), Notifications (no schema, pure stub), Moderation (no
// blocked-users/keywords table, pure stub), Danger zone (no delete-
// account endpoint wired). Session key merged into the Wallet group
// next to Payouts since they're both money-rail concerns.
const RAIL: RailGroup[] = [
  {
    title: 'You',
    items: [
      { id: 'profile', label: 'Profile', icon: '◉' },
      { id: 'appearance', label: 'Appearance', icon: '◐' },
    ],
  },
  {
    title: 'Wallet',
    items: [
      { id: 'payouts', label: 'Payouts', icon: '€' },
      { id: 'session-key', label: 'Session key', icon: '⚿' },
    ],
  },
  {
    title: 'Stream',
    items: [
      { id: 'obs-sources', label: 'OBS sources', icon: '▹' },
    ],
  },
];

type LoadState =
  | { kind: 'loading' }
  | { kind: 'anonymous' }
  | { kind: 'missing-profile' }
  | { kind: 'ready'; profile: ProfileRow };

const PROFILE_COLS = 'id, username, display_name, bio, avatar_url, skin';

export default function SettingsPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

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
      setState({ kind: 'ready', profile: data as ProfileRow });
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, router]);

  if (state.kind === 'loading' || state.kind === 'anonymous') {
    return <StatusScreen>Loading settings…</StatusScreen>;
  }

  if (state.kind === 'missing-profile') {
    return (
      <StatusScreen>
        We can&apos;t find a profile for your account yet. Finish signup first.
      </StatusScreen>
    );
  }

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
            href="/studio"
            title="Live monitor + slot editor"
            className="font-mono uppercase"
            style={{
              fontSize: '10px',
              letterSpacing: '0.15em',
              textDecoration: 'none',
              color: 'var(--casi-accent)',
              padding: '5px 10px',
              borderRadius: '999px',
              background: 'rgba(var(--casi-accent-rgb), 0.08)',
              border: '1px solid rgba(var(--casi-accent-rgb), 0.3)',
            }}
          >
            ↩ Studio
          </Link>
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
            Classic studio
          </Link>
          <WalletNav />
        </div>
      </nav>

      <div
        className="mx-auto"
        style={{ maxWidth: '1200px', padding: '28px 32px 0' }}
      >
        <h1
          className="font-extrabold"
          style={{ fontSize: '30px', letterSpacing: '-1.2px', color: 'var(--casi-text)' }}
        >
          Settings
        </h1>
        <p className="mt-1" style={{ color: 'var(--casi-text-dim)', fontSize: '14px' }}>
          Everything about your account, stream, payouts, and rules — in one place.
        </p>
      </div>

      <SettingsLayout rail={RAIL}>
        <ProfileSection supabase={supabase} profile={state.profile} />
        <AppearanceSection
          supabase={supabase}
          profileId={state.profile.id}
          initialSkinId={state.profile.skin}
        />
        <PayoutsSection />
        <SessionKeySection />
        <ObsSourcesSection username={state.profile.username ?? 'your-handle'} />
      </SettingsLayout>
    </main>
  );
}

function StatusScreen({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--casi-bg)', color: 'var(--casi-text-dim)' }}
    >
      <div
        className="font-mono uppercase"
        style={{ fontSize: '11px', letterSpacing: '0.2em' }}
      >
        {children}
      </div>
    </main>
  );
}
