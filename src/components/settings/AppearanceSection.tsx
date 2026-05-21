'use client';

import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import SettingsSection from './SettingsSection';
import SkinPicker from '@/components/SkinPicker';
import { useUserSkin } from '@/components/UserSkinProvider';
import { getSkinById } from '@/lib/skins';

// Curated quick-pick swatches. The hex input below covers everything else —
// these are just "good defaults that don't clash with the v9 derived ladder".
const INK_PRESETS = [
  '#0DCFB0', // Casi teal (default)
  '#9146FF', // Twitch purple
  '#06B6D4', // Cyber cyan
  '#FF0000', // YouTube red
  '#4ADE80', // Matrix green
  '#FF6B35', // Sunset orange
  '#F472B6', // Rose
  '#FACC15', // Gold
  '#E8E8E8', // Mono white
];

const PAPER_PRESETS = [
  '#0C0D11', // Casi base (default)
  '#000000', // True black
  '#0A0515', // Rose mauve
  '#050A12', // Cyber navy
  '#140906', // Sunset deep
  '#0E0E1A', // Twitch night
  '#F5F1E8', // Cream (light)
  '#FAFAFA', // Bright white (light)
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
  /** Persisted accent override from profiles.ink_color (or legacy theme_color). */
  initialInkColor?: string | null;
  /** Persisted background override from profiles.paper_color. */
  initialPaperColor?: string | null;
};

export default function AppearanceSection({
  supabase,
  profileId,
  username,
  initialSkinId,
  initialInkColor,
  initialPaperColor,
}: Props) {
  const { skinId, setSkinId, inkColor, setInkColor, paperColor, setPaperColor } = useUserSkin();

  // Seed the provider from profiles on mount if the server has values.
  // Only runs once — subsequent changes flow the other way (user picks → DB).
  const seededRef = useRef(false);
  // When the seed calls setSkinId(initialSkinId), the sync effect fires in
  // the same batch with the OLD skinId (localStorage value). Skip that one
  // run so we don't write the stale localStorage value back to DB.
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
    seededRef.current = true;
  }, [initialSkinId, initialInkColor, initialPaperColor, skinId, inkColor, paperColor, setSkinId, setInkColor, setPaperColor]);

  // Mirror skin changes into profiles.skin so the OBS overlay (separate
  // browser context, no localStorage access) stays in sync.
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

  // Debounced ink + paper saves — color picker drag emits many changes.
  useDebouncedSave(supabase, profileId, 'ink_color',   inkColor,   initialInkColor   ?? null);
  useDebouncedSave(supabase, profileId, 'paper_color', paperColor, initialPaperColor ?? null);

  const [inkInput, setInkInput] = useState('');
  const [paperInput, setPaperInput] = useState('');

  const skin = getSkinById(skinId);
  const effectiveInk   = inkColor   ?? skin.ink;
  const effectivePaper = paperColor ?? skin.paper;

  const overlayHref = username ? `/overlay?s=${encodeURIComponent(username)}&mode=obs` : null;
  const hasOverrides = Boolean(inkColor) || Boolean(paperColor);

  return (
    <SettingsSection
      id="appearance"
      title="Appearance"
      desc="A skin is a preset Ink + Paper pair (ink = brand colour, paper = background). Pick one, then optionally override either colour to fine-tune. Changes save to your account, so every device + your OBS browser source stays in sync."
    >
      {/* ── Skin presets ─────────────────────────────────────────────────── */}
      <SubHeading title="Skin" hint="curated preset palettes" />
      <SkinPicker />

      {/* ── Ink (brand accent) ───────────────────────────────────────────── */}
      <Divider />
      <SubHeading
        title="Ink"
        hint={inkColor ? 'overriding skin ink' : 'using skin ink'}
      />
      <PresetSwatchRow
        presets={INK_PRESETS}
        active={effectiveInk}
        overridden={!!inkColor}
        onPick={(c) => { setInkInput(''); setInkColor(c); }}
        onReset={() => { setInkInput(''); setInkColor(null); }}
      />
      <HexInput
        value={inkInput || (inkColor ?? '')}
        placeholder={skin.ink}
        previewColor={effectiveInk}
        onChange={(raw) => {
          const v = raw.startsWith('#') ? raw : `#${raw}`;
          const trimmed = v.slice(0, 7);
          setInkInput(trimmed);
          if (HEX_RE.test(trimmed)) setInkColor(trimmed);
        }}
      />

      {/* ── Paper (background) ───────────────────────────────────────────── */}
      <Divider />
      <SubHeading
        title="Paper"
        hint={paperColor ? 'overriding skin paper' : 'using skin paper'}
      />
      <PresetSwatchRow
        presets={PAPER_PRESETS}
        active={effectivePaper}
        overridden={!!paperColor}
        onPick={(c) => { setPaperInput(''); setPaperColor(c); }}
        onReset={() => { setPaperInput(''); setPaperColor(null); }}
      />
      <HexInput
        value={paperInput || (paperColor ?? '')}
        placeholder={skin.paper}
        previewColor={effectivePaper}
        onChange={(raw) => {
          const v = raw.startsWith('#') ? raw : `#${raw}`;
          const trimmed = v.slice(0, 7);
          setPaperInput(trimmed);
          if (HEX_RE.test(trimmed)) setPaperColor(trimmed);
        }}
      />
      <div
        className="font-mono uppercase"
        style={{ fontSize: 9, letterSpacing: '0.16em', color: 'var(--casi-text-faint)', marginTop: 6 }}
      >
        Tip: a bright paper colour switches the dashboard to light mode automatically.
      </div>

      {hasOverrides && (
        <button
          type="button"
          onClick={() => { setInkColor(null); setPaperColor(null); setInkInput(''); setPaperInput(''); }}
          className="font-mono uppercase"
          style={{
            marginTop: 14,
            padding: '6px 12px',
            background: 'transparent',
            border: '1px solid var(--casi-border-2)',
            color: 'var(--casi-text)',
            fontSize: 9,
            letterSpacing: '0.18em',
            cursor: 'pointer',
            borderRadius: 0,
          }}
        >
          ↺ Reset both to skin defaults
        </button>
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

// Shared debounced single-column writer. Two of these run side-by-side for
// ink_color and paper_color so a streamer dragging both colour picks doesn't
// stack two queued writes per stroke.
function useDebouncedSave(
  supabase: SupabaseClient,
  profileId: string,
  column: 'ink_color' | 'paper_color',
  value: string | null,
  initial: string | null,
) {
  const lastSyncedRef = useRef<string | null>(initial);
  const seededRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Skip first run — that's the seed, not a user edit.
    if (!seededRef.current) { seededRef.current = true; return; }
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
  }, [value, column, supabase, profileId]);
}

function PresetSwatchRow({
  presets,
  active,
  overridden,
  onPick,
  onReset,
}: {
  presets: string[];
  active: string;
  overridden: boolean;
  onPick: (color: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" style={{ marginBottom: 12 }}>
      {presets.map((color) => {
        const isActive = active.toLowerCase() === color.toLowerCase();
        return (
          <button
            key={color}
            type="button"
            title={color}
            onClick={() => onPick(color)}
            style={{
              width: 28,
              height: 28,
              borderRadius: 0,
              background: color,
              border: isActive ? `2px solid var(--casi-text)` : '1px solid rgba(255,255,255,0.1)',
              boxShadow: isActive ? `0 0 0 3px rgba(255,255,255,0.05)` : 'none',
              cursor: 'pointer',
            }}
          />
        );
      })}
      <button
        type="button"
        title="Reset to skin default"
        onClick={onReset}
        disabled={!overridden}
        className="font-mono uppercase"
        style={{
          padding: '0 12px',
          height: 28,
          borderRadius: 0,
          background: 'transparent',
          border: '1px solid var(--casi-border-2)',
          color: overridden ? 'var(--casi-text)' : 'var(--casi-text-dim)',
          fontSize: 9,
          letterSpacing: '0.15em',
          cursor: overridden ? 'pointer' : 'not-allowed',
          opacity: overridden ? 1 : 0.5,
        }}
      >
        ↺ Reset
      </button>
    </div>
  );
}

function HexInput({
  value,
  placeholder,
  previewColor,
  onChange,
}: {
  value: string;
  placeholder: string;
  previewColor: string;
  onChange: (raw: string) => void;
}) {
  return (
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
        value={value}
        placeholder={placeholder}
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
        onChange={(e) => onChange(e.target.value)}
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

/**
 * Cosmetic mock of an "active beam" tile + a chrome strip + a flash row, so
 * the streamer sees ink AND paper effects together (not just the slot tile).
 * Renders with the live --casi-* / v9 vars so changes reflect instantly.
 */
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

      {/* canvas-ish area */}
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
