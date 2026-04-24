'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import SettingsLayout, { type RailGroup } from './_components/SettingsLayout';
import ProfileSection, { type ProfileRow } from './_components/ProfileSection';
import PayoutsSection from './_components/PayoutsSection';
import AppearanceSection from './_components/AppearanceSection';
import SlotDefaultsSection from './_components/SlotDefaultsSection';
import ObsSourcesSection from './_components/ObsSourcesSection';
import SessionKeySection from './_components/SessionKeySection';
import NotificationsSection from './_components/NotificationsSection';
import ModerationSection from './_components/ModerationSection';
import DangerZoneSection from './_components/DangerZoneSection';

const RAIL: RailGroup[] = [
  {
    title: 'You',
    items: [
      { id: 'profile', label: 'Profile', icon: '◉' },
      { id: 'payouts', label: 'Payouts', icon: '€' },
      { id: 'appearance', label: 'Appearance', icon: '◐' },
      // Account rail item scrolls to danger-zone — no dedicated Account section in v3 handoff yet.
      { id: 'danger-zone', label: 'Account', icon: '☉' },
    ],
  },
  {
    title: 'Stream',
    items: [
      { id: 'slot-defaults', label: 'Slot defaults', icon: '▣' },
      { id: 'obs-sources', label: 'OBS sources', icon: '▹' },
      { id: 'session-key', label: 'Session key', icon: '⚿' },
    ],
  },
  {
    title: 'Alerts',
    items: [
      { id: 'notifications', label: 'Notifications', icon: '◇' },
    ],
  },
  {
    title: 'Safety',
    items: [
      { id: 'moderation', label: 'Moderation', icon: '✘' },
    ],
  },
];

type LoadState =
  | { kind: 'loading' }
  | { kind: 'anonymous' }
  | { kind: 'missing-profile' }
  | { kind: 'ready'; profile: ProfileRow };

const PROFILE_COLS = 'id, username, display_name, bio, avatar_url';

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
      <div
        className="mx-auto flex flex-wrap items-end justify-between gap-4"
        style={{ maxWidth: '1200px', padding: '28px 32px 0' }}
      >
        <div>
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
      </div>

      <SettingsLayout rail={RAIL}>
        <ProfileSection supabase={supabase} profile={state.profile} />
        <PayoutsSection />
        <AppearanceSection />
        <SlotDefaultsSection />
        <ObsSourcesSection />
        <SessionKeySection />
        <NotificationsSection />
        <ModerationSection />
        <DangerZoneSection />
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
