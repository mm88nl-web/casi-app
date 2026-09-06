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
 *   4. `accent2Color` overrides --casi-accent2 (the state-only third hue) on
 *      top of the chosen skin.
 *   5. Defaults in globals.css cover SSR / first paint.
 *
 * The `themeColor` prop is the legacy name for inkColor and is honoured for
 * any caller that hasn't been renamed yet — pass either, not both.
 *
 * Callers should also mount this inside a `.skin-root`-classed wrapper (see
 * globals.css) so the redesign ladder's --on-ink scoping applies.
 */
export default function SkinProvider({
  skin,
  inkColor,
  paperColor,
  accent2Color,
  themeColor, // legacy alias for inkColor
}: {
  skin?: string | null;
  inkColor?: string | null;
  paperColor?: string | null;
  accent2Color?: string | null;
  themeColor?: string | null;
}) {
  useEffect(() => {
    const s = getSkinById(skin);
    const root = document.documentElement;
    const isCustom = skin === 'custom';

    const inkOverride = inkColor ?? themeColor ?? null;
    const useInk     = !!inkOverride   && /^#[0-9A-Fa-f]{6}$/.test(inkOverride);
    const usePaper   = !!paperColor    && /^#[0-9A-Fa-f]{6}$/.test(paperColor);
    const useAccent2 = !!accent2Color  && /^#[0-9A-Fa-f]{6}$/.test(accent2Color);
    const ink        = useInk     ? inkOverride!    : s.accent;
    const inkRgb      = useInk     ? (hexToRgbStr(inkOverride!) ?? s.accentRgb) : s.accentRgb;
    const paper       = usePaper   ? paperColor!     : s.paper;
    const accent2     = useAccent2 ? accent2Color!   : s.accent2;
    const accent2Rgb  = useAccent2 ? (hexToRgbStr(accent2Color!) ?? s.accent2Rgb) : s.accent2Rgb;

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

    // v7 alias layer — only the values that can't derive from --ink/--paper
    // via color-mix() in globals.css. Surface/text are intentionally
    // omitted so the globals.css derivations win over stale inline overrides.
    root.style.setProperty('--casi-accent',     ink);
    root.style.setProperty('--casi-accent-rgb', inkRgb);
    root.style.setProperty('--casi-accent2',     accent2);
    root.style.setProperty('--casi-accent2-rgb', accent2Rgb);
    root.style.setProperty('--casi-bg',          paper);

    // Redesign ladder --border: curated exact hex per skin, EXCEPT custom
    // (no per-streamer border field — left to the globals.css fallback,
    // mix(paper, ink, 18%), so it tracks whatever ink/paper this streamer
    // picked instead of the static Custom-skin sentinel).
    if (isCustom) root.style.removeProperty('--border');
    else          root.style.setProperty('--border', s.border);
  }, [skin, inkColor, paperColor, accent2Color, themeColor]);

  return null;
}
