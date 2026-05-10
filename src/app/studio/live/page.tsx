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
  const [pendingCount, setPendingCount] = useState(0);
  // Stripe Connect's default currency drives the slot pricing UI's Stripe
  // row — we render the rate input in whatever currency Stripe will
  // actually charge in, not in a free-form picker. null means Stripe isn't
  // connected (or the fetch hasn't returned yet); the slot UI hides its
  // Stripe row in that case so the streamer can't set a rate that nothing
  // will charge against.
  const [stripeCurrency, setStripeCurrency] = useState<'usd' | 'eur' | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/stripe/connect/status', { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const cur = (json?.defaultCurrency ?? null) as string | null;
        if (cur === 'eur' || cur === 'usd') setStripeCurrency(cur);
      } catch {
        /* leave null — slot UI degrades to USDC-only */
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  // Pending-count badge on the Dashboard tab. Mirrors /studio's combined
  // queue (bookings + flashes) so a request landing while the streamer is
  // mid-edit on /studio/live still flags the badge. Realtime watcher uses
  // the same pattern as /studio (postgres_changes + 30s watchdog).
  const profileId = state.kind === 'ready' ? state.profile.id : null;
  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    const reload = async () => {
      const [bookingsRes, flashesRes] = await Promise.all([
        supabase.from('bookings').select('id')
          .eq('profile_id', profileId).eq('status', 'pending'),
        supabase.from('flashes').select('id')
          .eq('profile_id', profileId).eq('status', 'pending'),
      ]);
      if (cancelled) return;
      const total = (bookingsRes.data?.length ?? 0) + (flashesRes.data?.length ?? 0);
      setPendingCount(total);
    };
    reload();

    const bookingsChannel = supabase
      .channel(`studio_live_pending_bookings_${profileId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `profile_id=eq.${profileId}` },
        () => { reload(); })
      .subscribe();

    const flashesChannel = supabase
      .channel(`studio_live_pending_flashes_${profileId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'flashes', filter: `profile_id=eq.${profileId}` },
        () => { reload(); })
      .subscribe();

    const watchdog = setInterval(reload, 30_000);

    return () => {
      cancelled = true;
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(flashesChannel);
      clearInterval(watchdog);
    };
  }, [profileId, supabase]);

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
      pendingCount={pendingCount}
      error={errorMsg}
      onDismissError={() => setErrorMsg(null)}
    >
      <StudioLiveEditor supabase={supabase} profileId={profile.id} username={profile.username} stripeCurrency={stripeCurrency} />
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
