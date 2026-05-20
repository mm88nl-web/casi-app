export type Skin = {
  id: string;
  name: string;
  /** Primary brand colour (v7 alias: same value as `ink`) */
  accent: string;
  /** RGB channels of accent (no `rgb()` wrapper) — for rgba() usage */
  accentRgb: string;
  /** Secondary action colour */
  accent2: string;
  /** RGB channels of accent2 */
  accent2Rgb: string;
  /** Main page background (v7 alias: same value as `paper`) */
  bg: string;
  /** Card / panel background */
  surface: string;
  /** Divider / outline colour */
  border: string;
  /** Primary text */
  text: string;
  /** Secondary / label text */
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
  category?: 'platform' | 'casi' | 'custom';
};

export const SKINS: Skin[] = [
  {
    id: 'homepage',
    name: 'Homepage',
    accent:     '#294b3c',
    accentRgb:  '41, 75, 60',
    accent2:    '#c04830',
    accent2Rgb: '192, 72, 48',
    bg:         '#f5e1d2',
    surface:    '#ede0cf',
    border:     '#d4c0aa',
    text:       '#221a14',
    textMuted:  '#6a574b',
    ink:        '#294b3c',
    paper:      '#f5e1d2',
    isLight:    true,
    category:   'casi',
  },
  {
    id: 'casi-dark',
    name: 'Casi Dark',
    accent:     '#0DCFB0',
    accentRgb:  '13, 207, 176',
    accent2:    '#9945FF',
    accent2Rgb: '153, 69, 255',
    bg:         '#0C0D11',
    surface:    '#13151C',
    border:     '#1E2130',
    text:       '#E8EAED',
    textMuted:  '#5E6278',
    ink:        '#0DCFB0',
    paper:      '#0C0D11',
    category:   'casi',
  },
  {
    id: 'twitch',
    name: 'Twitch',
    accent:     '#9146FF',
    accentRgb:  '145, 70, 255',
    accent2:    '#772CE8',
    accent2Rgb: '119, 44, 232',
    bg:         '#0e0e1a',
    surface:    '#18182a',
    border:     '#2a2a3a',
    text:       '#efeff1',
    textMuted:  '#adadb8',
    ink:        '#9146FF',
    paper:      '#0e0e1a',
    category:   'platform',
  },
  {
    id: 'kick',
    name: 'Kick',
    accent:     '#53FC18',
    accentRgb:  '83, 252, 24',
    accent2:    '#00cc00',
    accent2Rgb: '0, 204, 0',
    bg:         '#0a1a0a',
    surface:    '#102010',
    border:     '#1d301d',
    text:       '#e8eee8',
    textMuted:  '#5a705a',
    ink:        '#53FC18',
    paper:      '#0a1a0a',
    category:   'platform',
  },
  {
    id: 'mono',
    name: 'Mono',
    accent:     '#E8E8E8',
    accentRgb:  '232, 232, 232',
    accent2:    '#888888',
    accent2Rgb: '136, 136, 136',
    bg:         '#0a0a0a',
    surface:    '#141414',
    border:     '#2a2a2a',
    text:       '#f0f0f0',
    textMuted:  '#888888',
    ink:        '#E8E8E8',
    paper:      '#0a0a0a',
    category:   'casi',
  },
  {
    id: 'apothecary',
    name: 'Apothecary',
    accent:     '#C8A45C',
    accentRgb:  '200, 164, 92',
    accent2:    '#7C5C2A',
    accent2Rgb: '124, 92, 42',
    bg:         '#0F0C07',
    surface:    '#1A1508',
    border:     '#2E2310',
    text:       '#F5EDD8',
    textMuted:  '#8A7A5A',
    ink:        '#C8A45C',
    paper:      '#0F0C07',
    category:   'casi',
  },
  // ── Custom ────────────────────────────────────────────────────────────
  // Sentinel skin: ink/paper here are seed defaults the picker uses on
  // first selection. The actual visible ink/paper come from
  // profiles.ink_color + profiles.paper_color overrides, which the
  // Appearance section lets the streamer dial in freely. Selecting any
  // other skin clears the implicit "this is custom" state — overrides can
  // still be set on top of any preset.
  {
    id: 'custom',
    name: 'Custom',
    accent:     '#FFFFFF',
    accentRgb:  '255, 255, 255',
    accent2:    '#888888',
    accent2Rgb: '136, 136, 136',
    bg:         '#0A0A0A',
    surface:    '#141414',
    border:     '#2A2A2A',
    text:       '#F0F0F0',
    textMuted:  '#888888',
    ink:        '#FFFFFF',
    paper:      '#0A0A0A',
    category:   'custom',
  },
];

export const DEFAULT_SKIN_ID = 'casi-dark';

export function getSkinById(id: string | null | undefined): Skin {
  return SKINS.find(s => s.id === id) ?? SKINS[0];
}

/** Parse a 6-digit hex colour into "R, G, B" channel string. */
export function hexToRgbStr(hex: string): string | null {
  const m = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`;
}
