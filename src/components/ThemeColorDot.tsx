'use client';

import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Compact theme-color picker: a small colored dot in the nav that opens a
 * popover with preset swatches. Picking one writes `profiles.theme_color`
 * so the viewer overlay and the streamer's own dashboard both reskin on
 * the next realtime update. Matches the preset list admin's
 * ProfileEditCard has been using so streamers see the same choices
 * wherever they change the accent.
 *
 * "Reset" clears theme_color back to null — the skin's own accent takes
 * over (Appearance in settings controls the skin itself).
 *
 * Optimistic update on the caller via onChange so the dot repaints
 * immediately; the supabase write runs after and logs on failure rather
 * than blocking the UI.
 */

type Props = {
  supabase: SupabaseClient;
  profileId: string;
  /** Current accent override, or null/undefined if the skin's default is in use. */
  themeColor: string | null;
  /** Called with the chosen color (or null for "reset") so the parent can
   *  update its local state + SkinProvider optimistically. */
  onChange: (next: string | null) => void;
};

const THEME_PRESETS: Array<{ name: string; color: string }> = [
  { name: 'Casi Orange',   color: '#F58220' },
  { name: 'Twitch Purple', color: '#9146FF' },
  { name: 'Cyber Cyan',    color: '#06b6d4' },
  { name: 'YouTube Red',   color: '#FF0000' },
  { name: 'Matrix Green',  color: '#4ade80' },
  { name: 'Kick Green',    color: '#53FC18' },
  { name: 'Rose Pink',     color: '#f472b6' },
  { name: 'Gold',          color: '#facc15' },
  { name: 'Pure White',    color: '#e8e8e8' },
];

export default function ThemeColorDot({ supabase, profileId, themeColor, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click so the popover doesn't linger when the streamer
  // moves on. Esc also dismisses.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const persist = async (next: string | null) => {
    onChange(next); // optimistic
    const { error } = await supabase
      .from('profiles')
      .update({ theme_color: next })
      .eq('id', profileId);
    if (error) {
      // Non-fatal: the local paint already happened. Log, stay silent.
      console.warn('[ThemeColorDot] profiles.theme_color write failed', error);
    }
  };

  const currentColor = themeColor || 'var(--casi-accent)';

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Overlay accent color"
        aria-label="Change overlay accent color"
        aria-expanded={open}
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '999px',
          background: currentColor,
          border: '2px solid var(--casi-border-2)',
          cursor: 'pointer',
          padding: 0,
          boxShadow: open ? '0 0 0 3px rgba(var(--casi-accent-rgb), 0.2)' : 'none',
          transition: 'box-shadow 0.15s',
        }}
      />

      {open ? (
        <div
          role="dialog"
          aria-label="Overlay accent picker"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            zIndex: 100,
            background: 'var(--casi-surface)',
            border: '1px solid var(--casi-border)',
            borderRadius: '12px',
            padding: '14px',
            minWidth: '240px',
            boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
          }}
        >
          <div
            className="font-mono uppercase"
            style={{
              fontSize: '10px',
              letterSpacing: '0.15em',
              color: 'var(--casi-text-dim)',
              marginBottom: '10px',
            }}
          >
            Overlay accent
          </div>

          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}
          >
            {THEME_PRESETS.map((preset) => {
              const active = themeColor?.toLowerCase() === preset.color.toLowerCase();
              return (
                <button
                  key={preset.color}
                  type="button"
                  onClick={() => { persist(preset.color); setOpen(false); }}
                  title={preset.name}
                  aria-label={preset.name}
                  aria-pressed={active}
                  style={{
                    width: '100%',
                    aspectRatio: '1',
                    borderRadius: '8px',
                    background: preset.color,
                    border: active ? '2px solid #fff' : '1px solid rgba(255,255,255,0.1)',
                    boxShadow: active ? `0 0 0 2px ${preset.color}` : 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => { persist(null); setOpen(false); }}
            className="w-full font-mono uppercase"
            style={{
              marginTop: '10px',
              padding: '8px 10px',
              borderRadius: '8px',
              background: 'transparent',
              border: '1px solid var(--casi-border-2)',
              color: 'var(--casi-text-dim)',
              fontSize: '10px',
              letterSpacing: '0.15em',
              cursor: 'pointer',
            }}
          >
            Reset to skin default
          </button>
        </div>
      ) : null}
    </div>
  );
}
