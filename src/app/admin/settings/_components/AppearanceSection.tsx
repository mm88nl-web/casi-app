'use client';

import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import SettingsSection from './SettingsSection';
import SkinPicker from '@/components/SkinPicker';
import { useUserSkin } from '@/components/UserSkinProvider';

const ACCENT_PRESETS = [
  { name: 'Casi Orange',   color: '#F58220' },
  { name: 'Twitch Purple', color: '#9146FF' },
  { name: 'Cyber Cyan',    color: '#06B6D4' },
  { name: 'YouTube Red',   color: '#FF0000' },
  { name: 'Matrix Green',  color: '#4ADE80' },
  { name: 'Kick Green',    color: '#53FC18' },
  { name: 'Rose Pink',     color: '#F472B6' },
  { name: 'Gold',          color: '#FACC15' },
  { name: 'Pure White',    color: '#E8E8E8' },
];

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const SAVE_DEBOUNCE_MS = 600;

type Props = {
  supabase: SupabaseClient;
  profileId: string;
  /** Persisted skin from profiles.skin — used to seed the provider on mount
   *  so the streamer sees their server-of-record choice, not whatever this
   *  device had in localStorage. */
  initialSkinId?: string | null;
  /** Persisted accent from profiles.theme_color. Same seed-on-mount story
   *  as skin — null means "use the skin's default accent". */
  initialThemeColor?: string | null;
};

export default function AppearanceSection({
  supabase,
  profileId,
  initialSkinId,
  initialThemeColor,
}: Props) {
  const { skinId, setSkinId, themeColor, setThemeColor } = useUserSkin();

  // Seed the provider from profiles on mount if the server has values.
  // Only runs once — subsequent changes flow the other way (user picks → DB).
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (initialSkinId && initialSkinId !== skinId) setSkinId(initialSkinId);
    if (initialThemeColor !== undefined && initialThemeColor !== themeColor) {
      setThemeColor(initialThemeColor ?? null);
    }
    seededRef.current = true;
  }, [initialSkinId, initialThemeColor, skinId, themeColor, setSkinId, setThemeColor]);

  // Mirror every local skin change into profiles.skin so the OBS overlay —
  // which runs in a separate browser context on the streamer's OBS machine
  // and can't read this device's localStorage — sees the same palette.
  // The initial seed above guards against the first render writing the
  // DB value back over itself.
  const lastSkinSyncedRef = useRef<string | null>(initialSkinId ?? null);
  useEffect(() => {
    if (!seededRef.current) return;
    if (lastSkinSyncedRef.current === skinId) return;
    lastSkinSyncedRef.current = skinId;
    void supabase
      .from('profiles')
      .update({ skin: skinId })
      .eq('id', profileId)
      .then(({ error }) => {
        if (error) console.warn('[AppearanceSection] profiles.skin write failed', error);
      });
  }, [skinId, supabase, profileId]);

  // Accent debounced save — color picker drag emits many changes; coalesce
  // them so we don't pummel the DB while the streamer is choosing.
  const lastColorSyncedRef = useRef<string | null>(initialThemeColor ?? null);
  const colorSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!seededRef.current) return;
    if (lastColorSyncedRef.current === themeColor) return;
    if (colorSaveTimer.current) clearTimeout(colorSaveTimer.current);
    colorSaveTimer.current = setTimeout(() => {
      lastColorSyncedRef.current = themeColor;
      void supabase
        .from('profiles')
        .update({ theme_color: themeColor })
        .eq('id', profileId)
        .then(({ error }) => {
          if (error) console.warn('[AppearanceSection] profiles.theme_color write failed', error);
        });
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (colorSaveTimer.current) clearTimeout(colorSaveTimer.current);
    };
  }, [themeColor, supabase, profileId]);

  const [customColor, setCustomColor] = useState('');
  const previewColor = themeColor ?? '#F58220';

  const onPresetClick = (color: string) => {
    setCustomColor('');
    setThemeColor(color);
  };

  const onCustomChange = (raw: string) => {
    // Normalize: ensure leading hash, max 7 chars. Apply only on full hex match.
    const v = raw.startsWith('#') ? raw : `#${raw}`;
    setCustomColor(v.slice(0, 7));
    if (HEX_RE.test(v)) setThemeColor(v);
  };

  return (
    <SettingsSection
      id="appearance"
      title="Appearance"
      desc="Skin recolors your dashboard, settings, and public overlay (www.casi.gg/obs?s=…). Accent overrides the skin's main color — useful if you want your brand orange on a dark base. Saved to your account so every device + your OBS browser source stays in sync."
    >
      <SkinPicker />

      <div style={{ marginTop: 24 }}>
        <div
          className="font-semibold"
          style={{ fontSize: '13px', color: 'var(--casi-text)', marginBottom: 8 }}
        >
          Accent color
          <span
            className="ml-2 font-mono uppercase"
            style={{ fontSize: '9px', letterSpacing: '0.15em', color: 'var(--casi-text-dim)' }}
          >
            overrides skin accent
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5" style={{ marginBottom: 12 }}>
          {ACCENT_PRESETS.map((p) => {
            const active = themeColor === p.color;
            return (
              <button
                key={p.color}
                type="button"
                title={p.name}
                onClick={() => onPresetClick(p.color)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: p.color,
                  border: active
                    ? `2px solid var(--casi-text)`
                    : '1px solid rgba(255,255,255,0.1)',
                  boxShadow: active ? `0 0 0 3px rgba(255,255,255,0.05)` : 'none',
                  cursor: 'pointer',
                }}
              />
            );
          })}
          <button
            type="button"
            title="Reset to skin default"
            onClick={() => { setCustomColor(''); setThemeColor(null); }}
            disabled={!themeColor}
            className="font-mono uppercase"
            style={{
              padding: '0 12px',
              height: 28,
              borderRadius: 6,
              background: 'transparent',
              border: '1px solid var(--casi-border-2)',
              color: themeColor ? 'var(--casi-text)' : 'var(--casi-text-dim)',
              fontSize: 9,
              letterSpacing: '0.15em',
              cursor: themeColor ? 'pointer' : 'not-allowed',
              opacity: themeColor ? 1 : 0.5,
            }}
          >
            ↺ Reset
          </button>
        </div>

        <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: previewColor,
              border: '1px solid rgba(255,255,255,0.1)',
              flexShrink: 0,
              boxShadow: `0 0 10px ${previewColor}50`,
            }}
          />
          <input
            type="text"
            value={customColor || (themeColor ?? '')}
            placeholder="#F58220"
            maxLength={7}
            className="font-mono"
            style={{
              flex: 1,
              fontSize: 12,
              padding: '8px 12px',
              borderRadius: 8,
              background: 'var(--casi-bg)',
              border: '1px solid var(--casi-border-2)',
              color: 'var(--casi-text)',
              outline: 'none',
            }}
            onChange={(e) => onCustomChange(e.target.value)}
          />
        </div>
        <div
          style={{
            height: 3,
            borderRadius: 2,
            background: `linear-gradient(90deg, ${previewColor}, ${previewColor}40)`,
          }}
        />
      </div>
    </SettingsSection>
  );
}
