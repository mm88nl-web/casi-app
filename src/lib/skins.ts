export type Skin = {
  id: string;
  name: string;
  /** Primary brand colour (v7 alias: same value as `ink`) */
  accent: string;
  /** RGB channels of accent (no `rgb()` wrapper) — for rgba() usage */
  accentRgb: string;
  /** Secondary / state-only colour — live pips, flash ⚡, amount pills,
   *  "Live" badge, the active/selected ring. Never body text or a primary
   *  fill. A genuine third hue, not a shade of `ink`. */
  accent2: string;
  /** RGB channels of accent2 */
  accent2Rgb: string;
  /** Main page background (v7 alias: same value as `paper`) */
  bg: string;
  /** Card / panel background (legacy v7 field — unused by the v9/redesign
   *  ladder, which derives card fill from `paper` + `ink` via color-mix
   *  instead. Kept only so the `Skin` type stays a superset for any code
   *  still reading it.) */
  surface: string;
  /** Hairline / card-edge colour. Curated per skin so it reads correctly
   *  against that skin's exact paper — not a generic mix for presets.
   *  Custom skins fall back to a generated mix(paper, ink, 18%) instead
   *  (see globals.css `--border`). */
  border: string;
  /** Primary text (legacy v7 field, equal to `ink`) */
  text: string;
  /** Secondary / label text (legacy v7 field, equal to `ink`) */
  textMuted: string;
  /** v9 root: brand/accent colour. Equal to `accent` — the providers wire this
   *  into `--ink`, and globals.css derives the rest of the ladder via color-mix. */
  ink: string;
  /** v9 root: page background. Equal to `bg` — wired into `--paper`. */
  paper: string;
  /** Light-mode paper. The provider toggles [data-paper="light"] on the wrapper
   *  for these so derived tokens swap to the bright variant. */
  isLight?: boolean;
  /** Tags shown on the picker tile — purely cosmetic. */
  category?: 'light' | 'dark' | 'custom';
};

export const DEFAULT_SKIN_ID = 'casi-light';

/**
 * Every skin is exactly three colours (`ink` / `paper` / `accent2`) plus one
 * curated `border`. This is the full source of truth — see AGENTS.md → the
 * redesign skin token contract. `accent2` must be a genuine third hue (not a
 * darkened `ink`) or state changes (live pip, flash, amount pill) become
 * invisible against the brand colour.
 *
 * `snow.accent2` was `#F97316` (2.61:1 against its `#F4F7FD` paper — under
 * the 3:1 floor). Fixed to `#EA580C` (3.32:1), same warm-orange hue family,
 * just darker/more saturated so it clears contrast.
 */
const SKIN_SOURCE: {
  id: string;
  name: string;
  cat: 'light' | 'dark' | 'custom';
  ink: string;
  paper: string;
  accent2: string;
  border: string;
}[] = [
  // ── Light ──────────────────────────────────────────────────────────────
  { id: 'casi-light', name: 'Casi Light', cat: 'light', ink: '#294B3C', paper: '#F5E1D2', accent2: '#C04830', border: '#D4C0AA' },
  { id: 'rose',        name: 'Rose',       cat: 'light', ink: '#9D174D', paper: '#FFF1F2', accent2: '#0F766E', border: '#F6CBD3' },
  { id: 'snow',        name: 'Snow',       cat: 'light', ink: '#1D4ED8', paper: '#F4F7FD', accent2: '#EA580C', border: '#C7D6F5' },
  { id: 'amber',       name: 'Amber',      cat: 'light', ink: '#92400E', paper: '#FFFAEC', accent2: '#15803D', border: '#F3DFAE' },
  { id: 'youtube',     name: 'YouTube',    cat: 'light', ink: '#E32118', paper: '#FFFFFF', accent2: '#0F0F0F', border: '#E0E0E0' },
  // ── Dark ───────────────────────────────────────────────────────────────
  { id: 'casi-dark',   name: 'Casi Dark',  cat: 'dark', ink: '#0DCFB0', paper: '#0C0D11', accent2: '#9945FF', border: '#1E2130' },
  { id: 'twitch',      name: 'Twitch',     cat: 'dark', ink: '#A970FF', paper: '#0E0E10', accent2: '#00F5A0', border: '#2A2A32' },
  { id: 'kick',        name: 'Kick',       cat: 'dark', ink: '#53FC18', paper: '#0B0F0A', accent2: '#FF3D71', border: '#1D2A18' },
  { id: 'mono',        name: 'Mono',       cat: 'dark', ink: '#F2F2F2', paper: '#0A0A0A', accent2: '#FFB300', border: '#2A2A2A' },
  { id: 'apothecary',  name: 'Apothecary', cat: 'dark', ink: '#D9B36A', paper: '#100C08', accent2: '#6E9E7C', border: '#2E2310' },
  { id: 'onlyfans',    name: 'OnlyFans',   cat: 'dark', ink: '#00AFF0', paper: '#0A1420', accent2: '#FFC145', border: '#1A3045' },
  // ── Custom ────────────────────────────────────────────────────────────
  // Sentinel skin: ink/paper/accent2 here are seed defaults the picker uses
  // on first selection. The actual visible values come from
  // profiles.ink_color + profiles.paper_color + profiles.accent2_color
  // overrides, which the Appearance section lets the streamer dial in
  // freely from the curated swatches + free-text hex field. `border` for
  // custom is never read from here — it's generated dynamically as
  // mix(paper, ink, 18%) in globals.css so it tracks whatever ink/paper the
  // streamer actually picks.
  { id: 'custom', name: 'Custom', cat: 'custom', ink: '#FFFFFF', paper: '#0A0A0A', accent2: '#FFB300', border: '#2A2A2A' },
];

export const SKINS: Skin[] = SKIN_SOURCE.map((s) => ({
  id: s.id,
  name: s.name,
  accent: s.ink,
  accentRgb: hexToRgbStr(s.ink) ?? '255, 255, 255',
  accent2: s.accent2,
  accent2Rgb: hexToRgbStr(s.accent2) ?? '255, 255, 255',
  bg: s.paper,
  // Legacy v7 fields — unused by the v9/redesign token ladder (nothing
  // outside skins.ts reads them; see the Skin type doc comments above).
  // Filled with sensible equivalents so the type stays a strict superset.
  surface: s.paper,
  text: s.ink,
  textMuted: s.ink,
  border: s.border,
  ink: s.ink,
  paper: s.paper,
  isLight: s.cat === 'light',
  category: s.cat,
}));

export function getSkinById(id: string | null | undefined): Skin {
  return SKINS.find(s => s.id === id) ?? SKINS.find(s => s.id === DEFAULT_SKIN_ID) ?? SKINS[0];
}

/** Parse a 6-digit hex colour into "R, G, B" channel string. */
export function hexToRgbStr(hex: string): string | null {
  const m = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`;
}

/**
 * WCAG relative-luminance contrast ratio between two hex colours (1–21).
 * Used by the custom-skin hex commit path to warn (never block/correct)
 * when a streamer's pick falls under the floor: ink-on-paper 4.5:1,
 * accent2-on-paper 3:1.
 */
export function contrastRatio(hexA: string, hexB: string): number | null {
  const lum = (hex: string): number | null => {
    const m = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
    if (!m) return null;
    const chan = (h: string) => {
      const c = parseInt(h, 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const r = chan(m[1]), g = chan(m[2]), b = chan(m[3]);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const la = lum(hexA);
  const lb = lum(hexB);
  if (la === null || lb === null) return null;
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
