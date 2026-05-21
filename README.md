# Casi landing handoff

Two changes to land the new design in the repo.

## 1. Replace `src/app/page.tsx`

Drop in `design-explorations/handoff/page.tsx` verbatim. Notes:

- Imports `CasiMark` + `Wordmark` from `@/components/v9` directly — no
  `NavBar`, `Marquee`, `Footer`, or `UsdcIcon` (the old strip had all of these).
- Keeps the real `profiles.is_live` count query. Live stamp only renders
  when count > 0 so there's no fake "0 live" or "12 live".
- Pins its own palette via styled-jsx — the visitor's skin preference
  doesn't reskin the marketing page.
- Recolors the existing v9 Wordmark/Mark via `:global()` selectors so we
  reuse the shared mark components, just with the landing's palette.

## 2. Add the "Apothecary" skin in `src/lib/skins.ts`

Insert the entry below into the `SKINS` array, in the `'fresh'` category
(right after the existing `paper` entry would be the natural slot, since
it's the only other light skin):

```ts
{
  id: 'apothecary',
  name: 'Apothecary',
  accent:     '#294B3C',       // deep sage — primary ink
  accentRgb:  '41, 75, 60',
  accent2:    '#C04830',       // terracotta — secondary action / highlight
  accent2Rgb: '192, 72, 48',
  bg:         '#F5E1D2',       // salmon paper
  surface:    '#EAD3BF',       // slightly darker paper for cards
  border:     '#D4B89D',       // warm hairline
  text:       '#221A14',       // deep coffee
  textMuted:  '#6A574B',
  ink:        '#294B3C',
  paper:      '#F5E1D2',
  isLight:    true,            // flips data-paper="light" on the wrapper
  category:   'fresh',
},
```

That's it. Once both files land:

- `/` shows the new editorial landing
- Settings → Appearance shows "Apothecary" in the New group, and any
  streamer who picks it gets a salmon/sage/terracotta studio + profile

## Optional

If you want the landing to *follow* the streamer's selected skin instead
of pinning to Apothecary, delete the three palette overrides in `:root`
of the styled-jsx block:

```css
--paper: #f5e1d2;
--ink:   #294b3c;
--accent: #c04830;
```

The page will then inherit whatever `--ink` / `--paper` the active skin
provides, and the highlight bar will use a fallback `--accent2`.
