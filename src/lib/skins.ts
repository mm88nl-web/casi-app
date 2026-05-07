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
