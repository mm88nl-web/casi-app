'use client';
import { useEffect } from 'react';
import { getSkinById, hexToRgbStr } from '@/lib/skins';

/**
 * Injects Casi skin tokens as CSS custom properties onto <html>.
 * Place this component anywhere inside a page — it renders nothing and uses
 * useEffect so it never causes a hydration mismatch.
 *
 * Priority:
 *   1. `skin` controls the full palette (surfaces, borders, text).
 *   2. `inkColor` overrides --ink (the brand accent) on top of the chosen skin.
 *   3. `paperColor` overrides --paper (the background) on top of the chosen skin.
 *   4. Defaults in globals.css cover SSR / first paint.
 *
 * The `themeColor` prop is the legacy name for inkColor and is honoured for
 * any caller that hasn't been renamed yet — pass either, not both.
 */
export default function SkinProvider({
  skin,
  inkColor,
  paperColor,
  themeColor, // legacy alias for inkColor
}: {
  skin?: string | null;
  inkColor?: string | null;
  paperColor?: string | null;
  themeColor?: string | null;
}) {
  useEffect(() => {
    const s = getSkinById(skin);
    const root = document.documentElement;

    const inkOverride = inkColor ?? themeColor ?? null;
    const useInk   = !!inkOverride && /^#[0-9A-Fa-f]{6}$/.test(inkOverride);
    const usePaper = !!paperColor && /^#[0-9A-Fa-f]{6}$/.test(paperColor);
    const ink      = useInk   ? inkOverride!  : s.accent;
    const inkRgb   = useInk   ? (hexToRgbStr(inkOverride!) ?? s.accentRgb) : s.accentRgb;
    const paper    = usePaper ? paperColor!   : s.paper;

    // v9 roots — derived ladder is computed in globals.css via color-mix(),
    // so two writes cover everything.
    root.style.setProperty('--ink',   ink);
    root.style.setProperty('--paper', paper);

    // Light/dark switch for derived tokens. Skin-level isLight wins;
    // a paper override that's actually bright also trips it.
    const lightFromOverride = usePaper && (() => {
      const c = paper.replace('#', '');
      const r = parseInt(c.slice(0, 2), 16) / 255;
      const g = parseInt(c.slice(2, 4), 16) / 255;
      const b = parseInt(c.slice(4, 6), 16) / 255;
      return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
    })();
    if (s.isLight || lightFromOverride) root.setAttribute('data-paper', 'light');
    else                                root.removeAttribute('data-paper');

    // v7 alias layer kept in sync for components that read --casi-* directly.
    root.style.setProperty('--casi-accent',     ink);
    root.style.setProperty('--casi-accent-rgb', inkRgb);
    root.style.setProperty('--casi-accent2',     s.accent2);
    root.style.setProperty('--casi-accent2-rgb', s.accent2Rgb);
    root.style.setProperty('--casi-bg',          paper);
    root.style.setProperty('--casi-surface',     s.surface);
    root.style.setProperty('--casi-border',      s.border);
    root.style.setProperty('--casi-text',        s.text);
    root.style.setProperty('--casi-text-muted',  s.textMuted);
  }, [skin, inkColor, paperColor, themeColor]);

  return null;
}
