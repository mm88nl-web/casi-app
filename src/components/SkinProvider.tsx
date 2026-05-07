'use client';
import { useEffect } from 'react';
import { getSkinById, hexToRgbStr } from '@/lib/skins';

/**
 * Injects Casi skin tokens as CSS custom properties onto <html>.
 * Place this component anywhere inside a page — it renders nothing and uses
 * useEffect so it never causes a hydration mismatch.
 *
 * Priority:
 *   1. `skin` controls the full palette (bg, surfaces, borders, text).
 *   2. `themeColor` always overrides the accent on top of the chosen skin —
 *      so the streamer can pick Neon as a base but use their brand colour.
 *   3. Defaults in globals.css cover SSR / first paint.
 */
export default function SkinProvider({
  skin,
  themeColor,
}: {
  skin?: string | null;
  themeColor?: string | null;
}) {
  useEffect(() => {
    const s = getSkinById(skin);
    const root = document.documentElement;

    // themeColor always wins for accent — skin sets everything else.
    const accent    = themeColor ? themeColor : s.accent;
    const accentRgb = themeColor ? (hexToRgbStr(themeColor) ?? s.accentRgb) : s.accentRgb;

    // v9 roots — derived ladder (--ink-04…70, --text…4, --surf*, --line*, --on-ink)
    // is computed in globals.css via color-mix(), so two writes cover everything.
    root.style.setProperty('--ink',   accent);
    root.style.setProperty('--paper', s.paper);

    // v7 alias layer kept in sync for components that read --casi-* directly.
    root.style.setProperty('--casi-accent',     accent);
    root.style.setProperty('--casi-accent-rgb', accentRgb);
    root.style.setProperty('--casi-accent2',     s.accent2);
    root.style.setProperty('--casi-accent2-rgb', s.accent2Rgb);
    root.style.setProperty('--casi-bg',          s.bg);
    root.style.setProperty('--casi-surface',     s.surface);
    root.style.setProperty('--casi-border',      s.border);
    root.style.setProperty('--casi-text',        s.text);
    root.style.setProperty('--casi-text-muted',  s.textMuted);
  }, [skin, themeColor]);

  return null;
}
