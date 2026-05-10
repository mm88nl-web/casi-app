'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import Nav from '@/components/Nav';
import WalletPill from '@/components/WalletPill';
import SettingsLayout, { type RailGroup } from '@/components/settings/SettingsLayout';
import ProfileSection, { type ProfileRow } from '@/components/settings/ProfileSection';
import PayoutsSection from '@/components/settings/PayoutsSection';
import AppearanceSection from '@/components/settings/AppearanceSection';
import ObsSourcesSection from '@/components/settings/ObsSourcesSection';
import SessionKeySection from '@/components/settings/SessionKeySection';

const RAIL: RailGroup[] = [
  {
    title: 'Account',
    items: [{ id: 'profile', label: 'Profile' }],
  },
  {
    title: 'Payouts',
    items: [{ id: 'payouts', label: 'Payouts' }],
  },
  {
    title: 'Studio',
    items: [
      { id: 'appearance', label: 'Appearance' },
      { id: 'obs-sources', label: 'OBS sources' },
      { id: 'session-key', label: 'Session key' },
    ],
  },
];

const PROFILE_COLS =
  'id, username, display_name, bio, avatar_url, skin, solana_wallet, stripe_account_id, theme_color, ink_color, paper_color';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'anonymous' }
  | { kind: 'missing-profile' }
  | { kind: 'ready'; profile: ProfileRow };

/**
 * /studio/settings — v7 settings surface. Shares the section components
 * with /admin/settings (under src/components/settings/) but ships a
 * leaner v7 nav: Casi logo · "↩ Dashboard" · "Settings" · WalletPill.
 * Rail mirrors v7's Account / Payouts / Studio grouping.
 */
export default function StudioSettingsPage() {
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
    return () => { cancelled = true; };
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
    <main className="min-h-screen" style={{ background: 'var(--paper, var(--casi-bg))', color: 'var(--text, var(--casi-text))' }}>
      <Nav
        right={
          <>
            <Link href="/studio" className="font-mono uppercase" style={navChipStyle()}>
              ↩ Dashboard
            </Link>
            <span className="font-mono uppercase" style={navChipStyle({ active: true })}>
              Settings
            </span>
            <WalletPill />
          </>
        }
      />

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
          initialInkColor={state.profile.ink_color ?? state.profile.theme_color ?? null}
          initialPaperColor={state.profile.paper_color ?? null}
        />
        <ObsSourcesSection username={state.profile.username ?? 'your-handle'} />
        <SessionKeySection
          supabase={supabase}
          savedSolanaWallet={state.profile.solana_wallet ?? null}
        />
      </SettingsLayout>
    </main>
  );
}

function navChipStyle({ active = false }: { active?: boolean } = {}): React.CSSProperties {
  return {
    fontSize: '11px',
    fontWeight: 500,
    color: active ? 'var(--ink, var(--casi-accent))' : 'var(--text-3, var(--casi-text-dim))',
    background: active ? 'var(--ink-08)' : 'transparent',
    border: `1px solid ${active ? 'var(--ink-22)' : 'var(--line, var(--casi-border))'}`,
    padding: '5px 11px',
    borderRadius: '6px',
    textDecoration: 'none',
    transition: 'color .14s',
    fontFamily: 'inherit',
  };
}

function StatusScreen({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--paper, var(--casi-bg))', color: 'var(--text-3, var(--casi-text-dim))' }}
    >
      <div className="font-mono uppercase" style={{ fontSize: '11px', letterSpacing: '0.2em' }}>
        {children}
      </div>
    </main>
  );
}
