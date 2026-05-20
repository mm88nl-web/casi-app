# design-explorations/handoff

Two files ready to drop into the repo.

---

## page.tsx → `src/app/page.tsx`

Copy `page.tsx` over `src/app/page.tsx`. The only meaningful diff from the previous
version is the `CASI_DARK` constant and the `style={CASI_DARK}` prop on `<main>`:

```tsx
const CASI_DARK = {
  '--ink': '#0DCFB0',
  '--paper': '#0C0D11',
} as React.CSSProperties;

<main className="casi-v9-landing" style={CASI_DARK}>
```

**Why this matters**: `UserSkinProvider` and `SkinProvider` write `--ink` / `--paper`
onto `<html>` for authenticated streamer pages. If a streamer visits `/admin` (purple
skin) and then navigates to `/` in the same session without a full reload, the CSS vars
on `<html>` stay purple — and the landing renders in the streamer's palette. The inline
style scopes the override to the `<main>` subtree only, so the landing is always CASI
dark regardless of what happened upstream.

No other files need changing.

---

## Apothecary skin → `src/lib/skins.ts`

Paste this object into the `SKINS` array after the `paper` entry and before the
`custom` sentinel:

```ts
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
```

**Palette rationale**: warm amber on near-black mahogany. Old apothecary bottles are
amber glass on dark wood — the palette maps directly. Fills the "earth-tone dark" gap:
the existing grid covers teal, purple, green, red, cyan, mono, pink, orange, violet,
and cream but has no amber/gold on dark.

`ink: '#C8A45C'` is distinct from Sunset (`#FF6B35`) — amber reads as aged gold rather
than orange — and from Gold in the DevTweaksPanel swatches (`#FACC15`, which is bright
yellow). The paper `#0F0C07` has a warm undertone (slight red channel) rather than the
neutral black used by Mono or the blue-tinted black used by Cyber.
