'use client';

import { useEffect, useRef } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import SettingsSection from './SettingsSection';
import SkinPicker from '@/components/SkinPicker';
import { useUserSkin } from '@/components/UserSkinProvider';

type Props = {
  supabase: SupabaseClient;
  profileId: string;
  /** Persisted skin from profiles.skin — used to seed the provider on mount
   *  so the streamer sees their server-of-record choice, not whatever this
   *  device had in localStorage. */
  initialSkinId?: string | null;
};

export default function AppearanceSection({ supabase, profileId, initialSkinId }: Props) {
  const { skinId, setSkinId } = useUserSkin();

  // Seed the provider from profiles.skin on mount if the server has a value.
  // Only runs once — subsequent changes flow the other way (user picks → DB).
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (initialSkinId && initialSkinId !== skinId) {
      setSkinId(initialSkinId);
    }
    seededRef.current = true;
  }, [initialSkinId, skinId, setSkinId]);

  // Mirror every local skin change into profiles.skin so the OBS overlay —
  // which runs in a separate browser context on the streamer's OBS machine
  // and can't read this device's localStorage — sees the same palette.
  // The initial seed above guards against the first render writing the
  // DB value back over itself.
  const lastSyncedRef = useRef<string | null>(initialSkinId ?? null);
  useEffect(() => {
    if (!seededRef.current) return;
    if (lastSyncedRef.current === skinId) return;
    lastSyncedRef.current = skinId;
    void supabase
      .from('profiles')
      .update({ skin: skinId })
      .eq('id', profileId)
      .then(({ error }) => {
        if (error) {
          // Non-fatal: local state and the overlay just disagree until next refresh.
          console.warn('[AppearanceSection] profiles.skin write failed', error);
        }
      });
  }, [skinId, supabase, profileId]);

  return (
    <SettingsSection
      id="appearance"
      title="Appearance"
      desc="Picking a skin recolors your dashboard, settings, and public overlay at www.casi.gg/obs?s=. Saved to your account so every device + your OBS browser source stays in sync."
    >
      <SkinPicker />
    </SettingsSection>
  );
}
