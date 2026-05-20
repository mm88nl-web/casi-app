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
  category?: 'platform' | 'casi' | 'fresh' | 'custom';
};

export const SKINS: Skin[] = [
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
    id: 'youtube',
    name: 'YouTube',
    accent:     '#FF0000',
    accentRgb:  '255, 0, 0',
    accent2:    '#cc0000',
    accent2Rgb: '204, 0, 0',
    bg:         '#0d0606',
    surface:    '#1a0a0a',
    border:     '#2a1010',
    text:       '#f0e8e8',
    textMuted:  '#806060',
    ink:        '#FF0000',
    paper:      '#0d0606',
    category:   'platform',
  },
  {
    id: 'cyber',
    name: 'Cyber',
    accent:     '#06B6D4',
    accentRgb:  '6, 182, 212',
    accent2:    '#9945FF',
    accent2Rgb: '153, 69, 255',
    bg:         '#050a12',
    surface:    '#0c1422',
    border:     '#1a2435',
    text:       '#e0eaf5',
    textMuted:  '#506075',
    ink:        '#06B6D4',
    paper:      '#050a12',
    category:   'casi',
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
    id: 'rose',
    name: 'Rose',
    accent:     '#F472B6',
    accentRgb:  '244, 114, 182',
    accent2:    '#9945FF',
    accent2Rgb: '153, 69, 255',
    bg:         '#0a0515',
    surface:    '#150a25',
    border:     '#2a1535',
    text:       '#f0e0ea',
    textMuted:  '#7a5a70',
    ink:        '#F472B6',
    paper:      '#0a0515',
    category:   'casi',
  },
  // ── New (May 2026) ────────────────────────────────────────────────────
  // Three additions that fill gaps in the old grid — Sunset gives streamers
  // a warm option, Aurora gives a high-saturation gradient feel, Paper is
  // the only light-mode preset (flips data-paper="light" on the wrapper).
  {
    id: 'sunset',
    name: 'Sunset',
    accent:     '#FF6B35',
    accentRgb:  '255, 107, 53',
    accent2:    '#FFA94D',
    accent2Rgb: '255, 169, 77',
    bg:         '#140906',
    surface:    '#1f120c',
    border:     '#3a1f15',
    text:       '#fff0e6',
    textMuted:  '#a87a65',
    ink:        '#FF6B35',
    paper:      '#140906',
    category:   'fresh',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    accent:     '#7C3AED',
    accentRgb:  '124, 58, 237',
    accent2:    '#06B6D4',
    accent2Rgb: '6, 182, 212',
    bg:         '#070414',
    surface:    '#100a25',
    border:     '#251940',
    text:       '#ece4ff',
    textMuted:  '#8278a0',
    ink:        '#7C3AED',
    paper:      '#070414',
    category:   'fresh',
  },
  {
    id: 'paper',
    name: 'Paper (Light)',
    accent:     '#0F766E',
    accentRgb:  '15, 118, 110',
    accent2:    '#9333EA',
    accent2Rgb: '147, 51, 234',
    bg:         '#F5F1E8',
    surface:    '#EAE3D2',
    border:     '#D6CCB4',
    text:       '#1A1A1A',
    textMuted:  '#5A5648',
    ink:        '#0F766E',
    paper:      '#F5F1E8',
    isLight:    true,
    category:   'fresh',
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
    category:   'fresh',
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
