export type Skin = {
  id: string;
  name: string;
  /** Primary brand colour */
  accent: string;
  /** RGB channels of accent (no `rgb()` wrapper) — for rgba() usage */
  accentRgb: string;
  /** Secondary action colour */
  accent2: string;
  /** RGB channels of accent2 */
  accent2Rgb: string;
  /** Main page background */
  bg: string;
  /** Card / panel background */
  surface: string;
  /** Divider / outline colour */
  border: string;
  /** Primary text */
  text: string;
  /** Secondary / label text */
  textMuted: string;
};

export const SKINS: Skin[] = [
  {
    id: 'casi-dark',
    name: 'Casi Dark',
    accent:     '#F58220',
    accentRgb:  '245, 130, 32',
    accent2:    '#06b6d4',
    accent2Rgb: '6, 182, 212',
    bg:         '#050505',
    surface:    '#0d0d0d',
    border:     '#1c1c1c',
    text:       '#e8e8e8',
    textMuted:  '#555',
  },
  {
    id: 'void',
    name: 'Void',
    accent:     '#ffffff',
    accentRgb:  '255, 255, 255',
    accent2:    '#888888',
    accent2Rgb: '136, 136, 136',
    bg:         '#000000',
    surface:    '#0a0a0a',
    border:     '#1a1a1a',
    text:       '#f0f0f0',
    textMuted:  '#444',
  },
  {
    id: 'neon',
    name: 'Neon',
    accent:     '#ff2d78',
    accentRgb:  '255, 45, 120',
    accent2:    '#00f5d4',
    accent2Rgb: '0, 245, 212',
    bg:         '#080010',
    surface:    '#10001a',
    border:     '#220030',
    text:       '#f0f0f0',
    textMuted:  '#664466',
  },
  {
    id: 'twitch',
    name: 'Twitch',
    accent:     '#9146FF',
    accentRgb:  '145, 70, 255',
    accent2:    '#772CE8',
    accent2Rgb: '119, 44, 232',
    bg:         '#0e0e10',
    surface:    '#18181b',
    border:     '#2a2a35',
    text:       '#efeff1',
    textMuted:  '#adadb8',
  },
  {
    id: 'terminal',
    name: 'Terminal',
    accent:     '#39ff14',
    accentRgb:  '57, 255, 20',
    accent2:    '#00cc00',
    accent2Rgb: '0, 204, 0',
    bg:         '#000000',
    surface:    '#040a04',
    border:     '#0d1f0d',
    text:       '#ccffcc',
    textMuted:  '#2a5a2a',
  },
  {
    id: 'ember',
    name: 'Ember',
    accent:     '#ff6a00',
    accentRgb:  '255, 106, 0',
    accent2:    '#ee0979',
    accent2Rgb: '238, 9, 121',
    bg:         '#0d0805',
    surface:    '#130c08',
    border:     '#2a1810',
    text:       '#f0e8e0',
    textMuted:  '#6a4a3a',
  },
  {
    id: 'chrome',
    name: 'Chrome',
    accent:     '#e2e2e2',
    accentRgb:  '226, 226, 226',
    accent2:    '#c9a227',
    accent2Rgb: '201, 162, 39',
    bg:         '#0a0c10',
    surface:    '#0f1218',
    border:     '#1e2430',
    text:       '#e2e2e2',
    textMuted:  '#556070',
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
