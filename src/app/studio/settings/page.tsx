'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import Nav from '@/components/Nav';
import WalletPill from '@/components/WalletPill';
import SignOutButton from '@/components/SignOutButton';
import SettingsLayout, { type RailGroup } from '@/components/settings/SettingsLayout';
import SettingsSection from '@/components/settings/SettingsSection';
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
  'id, username, display_name, bio, avatar_url, skin, solana_wallet, stripe_account_id, theme_color, ink_color, paper_color, accent2_color';

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
    <main className="casi-studio-chrome min-h-screen">
      {/* Same fixed-chrome + anti-FOUC rationale as StudioFrame.tsx — see
          the comment there. /studio/settings has its own top-level <main>
          (it doesn't render inside StudioFrame), so it needs its own copy
          of both the wrapper class and this style tag. */}
      <style jsx global>{`
        html, body { background: var(--chrome-paper); }
      `}</style>
      {/* Prototype's header is logo, a plain link, the wallet pill — nothing
          more. This nav previously also rendered a bordered "↩ Dashboard"
          chip, a redundant "Settings" label announcing the page you're
          already on, and a sign-out chip, none of which exist there.
          Sign-out isn't gone — see the Account section at the bottom of
          this page, using SignOutButton's `variant="block"` style, which
          the component already had a doc comment describing as built
          "for settings sections" but was never actually used there until
          now. */}
      <Nav
        right={
          <>
            <Link href="/studio" style={dashboardLinkStyle}>
              ← Dashboard
            </Link>
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
          initialAccent2Color={state.profile.accent2_color ?? null}
        />
        <ObsSourcesSection username={state.profile.username ?? 'your-handle'} />
        <SessionKeySection
          supabase={supabase}
          savedSolanaWallet={state.profile.solana_wallet ?? null}
        />
        <SettingsSection title="Account" desc="Signed in as this streamer account.">
          <SignOutButton variant="block" />
        </SettingsSection>
      </SettingsLayout>
    </main>
  );
}

// Same plain-italic quiet-link treatment as StudioFrame's "Settings" link
// and /search's "Log in" link — the prototype's header has no bordered
// chips at all.
const dashboardLinkStyle: React.CSSProperties = {
  fontFamily: 'var(--S)',
  fontStyle: 'italic',
  fontSize: '16px',
  color: 'var(--chrome-text-2)',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
};

function StatusScreen({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="casi-studio-chrome min-h-screen flex items-center justify-center"
      style={{ background: 'var(--paper)', color: 'var(--text-3)' }}
    >
      <div className="font-mono uppercase" style={{ fontSize: '11px', letterSpacing: '0.2em' }}>
        {children}
      </div>
    </main>
  );
}
