'use client';

import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import SettingsSection from './SettingsSection';
import SkinPicker from '@/components/SkinPicker';
import { useUserSkin } from '@/components/UserSkinProvider';
import { getSkinById } from '@/lib/skins';

const SAVE_DEBOUNCE_MS = 600;

type Props = {
  supabase: SupabaseClient;
  profileId: string;
  username: string | null;
  initialSkinId?: string | null;
  initialInkColor?: string | null;
  initialPaperColor?: string | null;
  initialAccent2Color?: string | null;
};

export default function AppearanceSection({
  supabase,
  profileId,
  username,
  initialSkinId,
  initialInkColor,
  initialPaperColor,
  initialAccent2Color,
}: Props) {
  const {
    skinId, setSkinId,
    inkColor, setInkColor,
    paperColor, setPaperColor,
    accent2Color, setAccent2Color,
  } = useUserSkin();

  // Seed the provider from profiles on mount if the server has values.
  const seededRef = useRef(false);
  const skipNextSyncRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (initialSkinId && initialSkinId !== skinId) {
      setSkinId(initialSkinId);
      skipNextSyncRef.current = true;
    }
    if (initialInkColor !== undefined && initialInkColor !== inkColor) {
      setInkColor(initialInkColor ?? null);
    }
    if (initialPaperColor !== undefined && initialPaperColor !== paperColor) {
      setPaperColor(initialPaperColor ?? null);
    }
    if (initialAccent2Color !== undefined && initialAccent2Color !== accent2Color) {
      setAccent2Color(initialAccent2Color ?? null);
    }
    seededRef.current = true;
  }, [
    initialSkinId, initialInkColor, initialPaperColor, initialAccent2Color,
    skinId, inkColor, paperColor, accent2Color,
    setSkinId, setInkColor, setPaperColor, setAccent2Color,
  ]);

  // Mirror skin changes into profiles.skin.
  const lastSkinSyncedRef = useRef<string | null>(initialSkinId ?? null);
  useEffect(() => {
    if (!seededRef.current) return;
    if (skipNextSyncRef.current) { skipNextSyncRef.current = false; return; }
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

  // Debounced saves for custom colour overrides — only fire when Custom skin is active.
  const isCustom = skinId === 'custom';
  useDebouncedSave(supabase, profileId, 'ink_color',     inkColor,     initialInkColor     ?? null, isCustom);
  useDebouncedSave(supabase, profileId, 'paper_color',   paperColor,   initialPaperColor   ?? null, isCustom);
  useDebouncedSave(supabase, profileId, 'accent2_color', accent2Color, initialAccent2Color ?? null, isCustom);

  const skin = getSkinById(skinId);
  const effectiveInk    = inkColor    ?? skin.ink;
  const effectivePaper  = paperColor  ?? skin.paper;
  const effectiveAccent2 = accent2Color ?? skin.accent2;

  const overlayHref = username ? `/overlay?s=${encodeURIComponent(username)}&mode=obs` : null;

  return (
    <SettingsSection
      id="appearance"
      title="Appearance"
      desc="Pick a preset skin or choose Custom to dial in your own brand colour, background, and secondary accent. Changes sync across your devices and OBS browser source."
    >
      {/* ── Skin presets ─────────────────────────────────────────────────── */}
      <SubHeading title="Skin" />
      <SkinPicker />

      {/* ── Custom colour pickers — only shown when Custom skin is active ── */}
      {isCustom && (
        <>
          <Divider />
          <SubHeading title="Custom colors" hint="ink · paper · accent 2" />
          <ColorPickerRow
            label="Ink"
            desc="Brand / accent"
            value={effectiveInk}
            onChange={setInkColor}
          />
          <ColorPickerRow
            label="Paper"
            desc="Background"
            value={effectivePaper}
            onChange={setPaperColor}
          />
          <ColorPickerRow
            label="Accent 2"
            desc="Secondary highlight"
            value={effectiveAccent2}
            onChange={setAccent2Color}
          />
          <div
            className="font-mono uppercase"
            style={{ fontSize: 9, letterSpacing: '0.16em', color: 'var(--casi-text-faint)', marginTop: 4 }}
          >
            Tip: a bright Paper switches the dashboard to light mode automatically.
          </div>
        </>
      )}

      {/* ── Live preview ─────────────────────────────────────────────────── */}
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

function useDebouncedSave(
  supabase: SupabaseClient,
  profileId: string,
  column: 'ink_color' | 'paper_color' | 'accent2_color',
  value: string | null,
  initial: string | null,
  enabled: boolean,
) {
  const lastSyncedRef = useRef<string | null>(initial);
  const seededRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!seededRef.current) {
      seededRef.current = true;
      lastSyncedRef.current = value;
      return;
    }
    if (!enabled) {
      // Not in custom mode — track the current value so re-enabling doesn't
      // trigger a spurious write for an unchanged value.
      lastSyncedRef.current = value;
      return;
    }
    if (lastSyncedRef.current === value) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      lastSyncedRef.current = value;
      void supabase
        .from('profiles')
        .update({ [column]: value })
        .eq('id', profileId)
        .then(({ error }) => {
          if (error) console.warn(`[AppearanceSection] profiles.${column} write failed`, error);
        });
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, column, supabase, profileId, enabled]);
}

function ColorPickerRow({
  label,
  desc,
  value,
  onChange,
}: {
  label: string;
  desc: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const [textVal, setTextVal] = useState(value);
  useEffect(() => { setTextVal(value); }, [value]);

  return (
    <div className="flex items-center gap-3" style={{ marginBottom: 10 }}>
      {/* Color swatch — native picker hidden under it */}
      <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0, cursor: 'pointer' }}>
        <div
          style={{
            position: 'absolute', inset: 0,
            background: value,
            border: '1px solid rgba(255,255,255,0.15)',
            boxShadow: `0 0 8px ${value}60`,
          }}
        />
        <input
          type="color"
          value={value}
          onChange={(e) => {
            const hex = e.target.value;
            onChange(hex);
            setTextVal(hex);
          }}
          style={{
            position: 'absolute', inset: 0, opacity: 0,
            width: '100%', height: '100%',
            cursor: 'pointer', border: 'none', padding: 0,
          }}
        />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--casi-text)', lineHeight: 1.2 }}>
          {label}
        </div>
        <div
          className="font-mono uppercase"
          style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--casi-text-dim)', marginTop: 2 }}
        >
          {desc}
        </div>
      </div>

      <input
        type="text"
        value={textVal}
        maxLength={7}
        className="font-mono"
        style={{
          width: 82,
          fontSize: 11,
          padding: '7px 8px',
          borderRadius: 0,
          background: 'var(--casi-bg)',
          border: '1px solid var(--casi-border-2)',
          color: 'var(--casi-text)',
          outline: 'none',
        }}
        onChange={(e) => {
          const raw = e.target.value;
          setTextVal(raw);
          const v = raw.startsWith('#') ? raw : `#${raw}`;
          if (/^#[0-9A-Fa-f]{6}$/.test(v)) onChange(v);
        }}
        onBlur={() => setTextVal(value)}
      />
    </div>
  );
}

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

function PreviewTile() {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        borderRadius: 0,
        overflow: 'hidden',
        background: 'var(--paper, var(--casi-bg))',
        border: '1px solid var(--casi-border-2)',
      }}
    >
      {/* faux nav strip */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px',
          background: 'color-mix(in srgb, var(--ink, var(--casi-accent)) 4%, transparent)',
          borderBottom: '1px solid var(--casi-border-2)',
        }}
      >
        <span
          style={{
            display: 'inline-block', width: 8, height: 8, borderRadius: 0,
            background: 'var(--ink, var(--casi-accent))',
          }}
        />
        <span
          className="font-mono uppercase"
          style={{ fontSize: 9, letterSpacing: '0.18em', color: 'var(--casi-text)' }}
        >
          casi.
        </span>
        <span
          className="font-mono uppercase ml-auto"
          style={{ fontSize: 9, letterSpacing: '0.18em', color: 'var(--casi-text-muted)' }}
        >
          @your-handle
        </span>
      </div>

      <div style={{ position: 'relative', height: 110 }}>
        <div
          style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(135deg, var(--casi-surface), transparent)',
            opacity: 0.5,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 16, top: 16,
            width: 100, height: 78,
            borderRadius: 0,
            background: 'rgba(0,0,0,0.30)',
            border: '2px solid var(--ink, var(--casi-accent))',
            boxShadow: '0 0 18px rgba(var(--casi-accent-rgb), 0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--ink, var(--casi-accent))',
            fontFamily: 'var(--font-casi-sans)',
            fontWeight: 800,
            fontSize: 11,
            letterSpacing: '-0.2px',
          }}
        >
          beam ◉
        </div>
        <div
          style={{
            position: 'absolute',
            right: 14, top: 18,
            padding: '5px 10px',
            borderRadius: 999,
            background: 'rgba(var(--casi-accent-rgb), 0.12)',
            border: '1px solid rgba(var(--casi-accent-rgb), 0.35)',
            color: 'var(--ink, var(--casi-accent))',
            fontFamily: 'var(--font-casi-mono), monospace',
            fontSize: 9,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
          }}
        >
          ● Live · 2:14
        </div>
        <div
          style={{
            position: 'absolute',
            right: 14, bottom: 14,
            padding: '7px 12px',
            borderRadius: 0,
            background: 'var(--ink, var(--casi-accent))',
            color: 'var(--on-ink, #0a0a0a)',
            fontFamily: 'var(--font-casi-sans)',
            fontWeight: 800,
            fontSize: 10,
            letterSpacing: '0.05em',
          }}
        >
          Book a slot →
        </div>
      </div>
    </div>
  );
}
