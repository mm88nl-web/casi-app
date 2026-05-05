'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/client';
import StudioFrame from '../_components/StudioFrame';
import StudioLiveEditor from '../_components/StudioLiveEditor';

const PROFILE_COLS = 'id, username, is_live';

type Profile = {
  id: string;
  username: string | null;
  is_live: boolean | null;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'anonymous' }
  | { kind: 'missing-profile' }
  | { kind: 'ready'; profile: Profile };

/**
 * /studio/live — Live editor mode. Canvas + slot control panel. Sister
 * route to /studio (Dashboard). Both render inside StudioFrame so the
 * top nav, welcome header, and mode tabs are identical; only the body
 * content changes.
 */
export default function StudioLivePage() {
  const router = useRouter();
  const [supabase] = useState<SupabaseClient>(() => createClient());
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [togglingLive, setTogglingLive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  const toggleLive = useCallback(async () => {
    if (state.kind !== 'ready' || togglingLive) return;

    // Going OFFLINE → bounce to the dashboard with ?end=true so the
    // confirm dialog there (which already has actives/pendings/queued
    // loaded) handles the full shutdown sequence in one place.
    if (state.profile.is_live) {
      router.push('/studio?end=true');
      return;
    }

    // Going LIVE → just flip the flag here.
    setTogglingLive(true);
    setState({ kind: 'ready', profile: { ...state.profile, is_live: true } });
    const { error } = await supabase.from('profiles').update({ is_live: true }).eq('id', state.profile.id);
    if (error) {
      setState({ kind: 'ready', profile: { ...state.profile, is_live: false } });
      setErrorMsg(error.message);
    }
    setTogglingLive(false);
  }, [state, supabase, togglingLive, router]);

  if (state.kind === 'loading' || state.kind === 'anonymous') {
    return <StatusScreen>Loading editor…</StatusScreen>;
  }
  if (state.kind === 'missing-profile') {
    return <StatusScreen>Finish signup first — no profile row for this account.</StatusScreen>;
  }

  const { profile } = state;

  return (
    <StudioFrame
      username={profile.username ?? 'streamer'}
      isLive={profile.is_live}
      togglingLive={togglingLive}
      onToggleLive={toggleLive}
      activeMode="live"
      error={errorMsg}
      onDismissError={() => setErrorMsg(null)}
    >
      <StudioLiveEditor supabase={supabase} profileId={profile.id} />
    </StudioFrame>
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
