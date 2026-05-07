'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { CasiMark, Wordmark } from '@/components/v9';
import WalletNav from '@/components/WalletNav';
import SettingsLayout, { type RailGroup } from '@/components/settings/SettingsLayout';
import ProfileSection, { type ProfileRow } from '@/components/settings/ProfileSection';
import PayoutsSection from '@/components/settings/PayoutsSection';
import AppearanceSection from '@/components/settings/AppearanceSection';
import ObsSourcesSection from '@/components/settings/ObsSourcesSection';
import SessionKeySection from '@/components/settings/SessionKeySection';

const RAIL: RailGroup[] = [
  {
    title: 'You',
    items: [
      { id: 'profile', label: 'Profile', icon: '◉' },
      { id: 'payouts', label: 'Payouts', icon: '€' },
      { id: 'appearance', label: 'Appearance', icon: '◐' },
    ],
  },
  {
    title: 'Wallet',
    items: [
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

const PROFILE_COLS = 'id, username, display_name, bio, avatar_url, skin, solana_wallet, stripe_account_id, theme_color, display_currency';

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
          <CasiMark width={56} height={28} />
          <Wordmark />
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
          <Link
            href="/studio/settings"
            title="Try the new settings"
            className="font-mono uppercase"
            style={{
              fontSize: '10px',
              letterSpacing: '0.15em',
              textDecoration: 'none',
              padding: '5px 10px',
              borderRadius: '999px',
              background: 'rgba(var(--casi-accent-rgb), 0.08)',
              border: '1px solid rgba(var(--casi-accent-rgb), 0.3)',
              color: 'var(--casi-accent)',
            }}
          >
            New settings →
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
        <PayoutsSection
          supabase={supabase}
          profileId={state.profile.id}
          initialStripeAccountId={state.profile.stripe_account_id ?? null}
          initialSolanaWallet={state.profile.solana_wallet ?? null}
        />
        <AppearanceSection
          supabase={supabase}
          profileId={state.profile.id}
          username={state.profile.username ?? null}
          initialSkinId={state.profile.skin}
          initialThemeColor={state.profile.theme_color ?? null}
        />
        <SessionKeySection
          supabase={supabase}
          savedSolanaWallet={state.profile.solana_wallet ?? null}
        />
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
