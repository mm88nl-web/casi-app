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
  /** Used by the "↗ Open OBS overlay" preview link. Null hides the link. */
  username: string | null;
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
  username,
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

  // Mirror skin changes into profiles.skin so the OBS overlay (separate
  // browser context, no localStorage access) stays in sync.
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

  // Accent debounced save — color picker drag emits many changes; coalesce.
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
    const v = raw.startsWith('#') ? raw : `#${raw}`;
    setCustomColor(v.slice(0, 7));
    if (HEX_RE.test(v)) setThemeColor(v);
  };

  const overlayHref = username ? `/overlay?s=${encodeURIComponent(username)}&mode=obs` : null;

  return (
    <SettingsSection
      id="appearance"
      title="Appearance"
      desc="Skin recolors your dashboard, settings, and the public OBS overlay. Accent overrides the skin's main color — useful if you want your brand color on a darker base. Saved to your account so every device + your OBS browser source stays in sync."
    >
      {/* ── Skin ─────────────────────────────────────────────────────────── */}
      <SubHeading title="Skin" hint="full palette · 7 presets" />
      <SkinPicker />

      {/* ── Accent ───────────────────────────────────────────────────────── */}
      <Divider />
      <SubHeading
        title="Accent"
        hint={themeColor ? 'overriding skin accent' : 'using skin default'}
      />

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
                borderRadius: 0,
                background: p.color,
                border: active ? `2px solid var(--casi-text)` : '1px solid rgba(255,255,255,0.1)',
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
            borderRadius: 0,
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
            borderRadius: 0,
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
            borderRadius: 0,
            background: 'var(--casi-bg)',
            border: '1px solid var(--casi-border-2)',
            color: 'var(--casi-text)',
            outline: 'none',
          }}
          onChange={(e) => onCustomChange(e.target.value)}
        />
      </div>

      {/* ── Live preview tile ────────────────────────────────────────────── */}
      <Divider />
      <SubHeading title="Preview" hint="how viewers see it" />
      <PreviewTile />

      {overlayHref && (
        <a
          href={overlayHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 font-mono uppercase"
          style={{
            marginTop: 10,
            padding: '8px 12px',
            borderRadius: 0,
            background: 'var(--casi-bg)',
            border: '1px solid var(--casi-border-2)',
            color: 'var(--casi-text)',
            fontSize: 10,
            letterSpacing: '0.15em',
            textDecoration: 'none',
          }}
        >
          ↗ Open the real OBS overlay in a new tab
        </a>
      )}
    </SettingsSection>
  );
}

/* ───────────────────────────────────────────────────────────────────────── */

function SubHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div
      className="font-semibold"
      style={{ fontSize: 13, color: 'var(--casi-text)', marginBottom: 8 }}
    >
      {title}
      {hint && (
        <span
          className="ml-2 font-mono uppercase"
          style={{ fontSize: 9, letterSpacing: '0.15em', color: 'var(--casi-text-dim)' }}
        >
          {hint}
        </span>
      )}
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{
        height: 1,
        background: 'var(--casi-border-2)',
        opacity: 0.5,
        margin: '20px 0 16px',
      }}
    />
  );
}

/**
 * Cosmetic mock of an "active beam" tile. Renders with the live --casi-*
 * vars so changes to skin/accent reflect here instantly. Helps the streamer
 * see "this is what an active overlay element will look like" without
 * leaving the settings page.
 */
function PreviewTile() {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: 110,
        borderRadius: 0,
        overflow: 'hidden',
        background: 'var(--casi-bg)',
        border: '1px solid var(--casi-border-2)',
      }}
    >
      {/* faux scene background */}
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, var(--casi-surface), var(--casi-bg))',
          opacity: 0.5,
        }}
      />
      {/* sample slot with accent border + glow */}
      <div
        style={{
          position: 'absolute',
          left: 16, top: 16,
          width: 100, height: 78,
          borderRadius: 0,
          background: 'rgba(0,0,0,0.55)',
          border: '2px solid var(--casi-accent)',
          boxShadow: '0 0 18px rgba(var(--casi-accent-rgb), 0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--casi-accent)',
          fontFamily: 'var(--font-casi-sans)',
          fontWeight: 800,
          fontSize: 11,
          letterSpacing: '-0.2px',
        }}
      >
        beam ◉
      </div>
      {/* sample chip */}
      <div
        style={{
          position: 'absolute',
          right: 14, top: 18,
          padding: '5px 10px',
          borderRadius: 999,
          background: 'rgba(var(--casi-accent-rgb), 0.12)',
          border: '1px solid rgba(var(--casi-accent-rgb), 0.35)',
          color: 'var(--casi-accent)',
          fontFamily: 'var(--font-casi-mono), monospace',
          fontSize: 9,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
        }}
      >
        ● Live · 2:14
      </div>
      {/* sample button */}
      <div
        style={{
          position: 'absolute',
          right: 14, bottom: 14,
          padding: '7px 12px',
          borderRadius: 0,
          background: 'var(--casi-accent)',
          color: '#0a0a0a',
          fontFamily: 'var(--font-casi-sans)',
          fontWeight: 800,
          fontSize: 10,
          letterSpacing: '0.05em',
        }}
      >
        Book a slot →
      </div>
    </div>
  );
}
