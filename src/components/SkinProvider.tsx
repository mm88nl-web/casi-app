'use client';
import { useEffect } from 'react';
import { getSkinById, hexToRgbStr } from '@/lib/skins';

/**
 * Injects Casi skin tokens as CSS custom properties onto <html>.
 * Place this component anywhere inside a page — it renders nothing and uses
 * useEffect so it never causes a hydration mismatch.
 *
 * Priority:
 *   1. If `skin` is set, use that preset's full palette.
 *   2. If only `themeColor` is set (legacy), use Casi Dark as the base
 *      but override accent + accentRgb with the custom colour.
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

    // Resolve accent — custom themeColor overrides only when no named skin is chosen
    const accent    = (!skin && themeColor) ? themeColor : s.accent;
    const accentRgb = (!skin && themeColor) ? (hexToRgbStr(themeColor) ?? s.accentRgb) : s.accentRgb;

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
