'use client';

import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import SettingsSection from './SettingsSection';
import SkinPicker from '@/components/SkinPicker';
import { useUserSkin } from '@/components/UserSkinProvider';
import { getSkinById, contrastRatio } from '@/lib/skins';

const SAVE_DEBOUNCE_MS = 600;

// Curated swatches for the Custom-skin hex fields — six per field, plus the
// free-text input each row already had. Matches the redesign handoff spec
// exactly (same source of truth src/lib/skins.ts draws its presets from).
const CURATED = {
  ink:     ['#294B3C', '#3B4EA0', '#BE185D', '#0DCFB0', '#C8A45C', '#E8E8E8'],
  paper:   ['#F5E1D2', '#F2F0EB', '#FDF2F8', '#0C0D11', '#0A1420', '#0F0C07'],
  accent2: ['#C04830', '#F97316', '#FFB300', '#0F766E', '#9945FF', '#FF3D71'],
} as const;

// Contrast floor from the skin token contract: ink-on-paper >= 4.5:1,
// accent2-on-paper >= 3:1. Custom skins can fall under it (the streamer
// picked the colours) — never block or silently correct, just warn.
const INK_CONTRAST_FLOOR = 4.5;
const ACCENT2_CONTRAST_FLOOR = 3.0;

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

  // Contrast-floor check on the custom hex commit path. Recomputed live off
  // whatever the streamer currently has picked (including a Paper change,
  // which can push a previously-fine Ink/Accent2 under the floor) — never
  // blocks, never corrects the hex, just an inline warning per field.
  const inkContrast = contrastRatio(effectiveInk, effectivePaper);
  const inkWarning = isCustom && inkContrast !== null && inkContrast < INK_CONTRAST_FLOOR
    ? `hard to read on your paper (${inkContrast.toFixed(2)}:1 — needs ${INK_CONTRAST_FLOOR}:1)`
    : null;
  const accent2Contrast = contrastRatio(effectiveAccent2, effectivePaper);
  const accent2Warning = isCustom && accent2Contrast !== null && accent2Contrast < ACCENT2_CONTRAST_FLOOR
    ? `hard to read on your paper (${accent2Contrast.toFixed(2)}:1 — needs ${ACCENT2_CONTRAST_FLOOR}:1)`
    : null;

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
            swatches={CURATED.ink}
            warning={inkWarning}
          />
          <ColorPickerRow
            label="Paper"
            desc="Background"
            value={effectivePaper}
            onChange={setPaperColor}
            swatches={CURATED.paper}
          />
          <ColorPickerRow
            label="Accent 2"
            desc="Secondary highlight"
            value={effectiveAccent2}
            onChange={setAccent2Color}
            swatches={CURATED.accent2}
            warning={accent2Warning}
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
  swatches,
  warning,
}: {
  label: string;
  desc: string;
  value: string;
  onChange: (hex: string) => void;
  /** Six curated hex values for this field. Replaces the native
   *  `<input type="color">`, which never opened reliably in the prototype
   *  this UI is built from. */
  swatches: readonly string[];
  /** Inline contrast-floor warning, or null when the current pick is fine.
   *  Never blocks or corrects the hex — just surfaces the number. */
  warning?: string | null;
}) {
  const [textVal, setTextVal] = useState(value);
  useEffect(() => { setTextVal(value); }, [value]);

  return (
    <div style={{ marginBottom: 14 }}>
      <div className="flex items-center gap-3">
        {/* Current-value swatch — read-only preview, selection happens via
            the curated swatches / hex field below. */}
        <div
          aria-hidden
          style={{
            width: 36, height: 36, flexShrink: 0,
            borderRadius: 8,
            background: value,
            border: '1px solid rgba(255,255,255,0.15)',
            boxShadow: `0 0 8px ${value}60`,
          }}
        />

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
            borderRadius: 6,
            background: 'var(--casi-bg)',
            border: `1px solid ${warning ? '#C04830' : 'var(--casi-border-2)'}`,
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

      {/* Six curated swatches. */}
      <div className="flex items-center gap-2" style={{ marginTop: 8, marginLeft: 48 }}>
        {swatches.map((hex) => {
          const active = hex.toLowerCase() === value.toLowerCase();
          return (
            <button
              key={hex}
              type="button"
              aria-label={hex}
              aria-pressed={active}
              onClick={() => { onChange(hex); setTextVal(hex); }}
              style={{
                width: 20, height: 20, borderRadius: 6,
                background: hex,
                border: active ? '2px solid var(--casi-text)' : '1px solid rgba(255,255,255,0.15)',
                boxShadow: active ? '0 0 0 2px rgba(255,255,255,0.15)' : 'none',
                cursor: 'pointer', padding: 0,
              }}
            />
          );
        })}
      </div>

      {warning && (
        <div
          className="font-mono"
          style={{ fontSize: 10, color: '#C04830', marginTop: 6, marginLeft: 48, lineHeight: 1.4 }}
        >
          ⚠ {warning}
        </div>
      )}
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
