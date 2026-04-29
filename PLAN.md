# Casi redesign v7 — implementation plan

Source: [`casi-redesign-v7.html`](./casi-redesign-v7.html) (committed to `main`).
Older v3 prototype + handoff: [`Casi/design_handoff_casi_redesign/`](./Casi/design_handoff_casi_redesign/).

This file is the working plan. Phases are intended to land as separate
commits on `claude/share-html-file-ER71s`.

## Confirmed decisions

1. **Palette** — adopt v7 teal (`--accent: #0DCFB0`, "live" green-teal). Old
   orange `#F58220` is retired. All colors stay as CSS vars on `:root` so
   we can iterate the exact shade without touching components.
2. **Skins** — replace, don't extend. Seven new presets: Casi Dark, Twitch,
   Kick, YouTube, Cyber, Mono, Rose. Migration maps old → new:
   - `twitch` → `twitch`
   - `void` → `mono`
   - `chrome` → `mono`
   - `ember` → `rose`
   - `neon` → `rose`
   - `terminal` → `kick`
   - anything else → `casi-dark`
3. **Drop from v3 README** — Moderation, Notifications, Slot defaults
   sections. Backend not built; not stubbing UI.
4. **`/admin` stays** — legacy fallback. Add a "Try new Studio →" chip in
   `/admin` and `/admin/settings` headers pointing at `/studio` and
   `/studio/settings`. (Standalone task; not gated on the rest.)
5. **Auth screen** — build it. Need to inspect existing auth setup first
   (the recent `claude/google-sign-in` merge means there's already work
   here — see Phase 7).
6. **Wallet button** — official Phantom + Solana logos, not the prototype's
   gradient placeholder. Keep `@solana/wallet-adapter-react`'s modal under
   the hood for connect/disconnect; swap only the trigger UI + post-connect
   display.

## Phase 0 — Admin → Studio link (standalone)

Smallest possible PR-able change; lands first so streamers can navigate.

- Add a chip in `/admin/page.tsx` header: "Try the new Studio →" → `/studio`.
- Add a chip in `/admin/settings/page.tsx` header: "Try the new Settings →"
  → `/studio/settings`.

## Phase 1 — Foundation (tokens, fonts, skins)

### Tokens
- Update `@theme` block in `src/app/globals.css` with v7 palette:
  - `--bg #0C0D11`, `--surface #13151C`, `--s2 #191C27`
  - `--border #1E2130`, `--b2 #272B3D`
  - `--text #E8EAED`, `--mid #5E6278`, `--dim #30334A`, `--faint #1A1D27`
  - `--accent #0DCFB0`, `--ar 13,207,176`
  - `--live #0DCFB0`, `--lr 13,207,176`
- Map onto existing `--casi-*` names so existing consumers don't break.

### Fonts
- Swap `src/app/layout.tsx` from Bricolage Grotesque + JetBrains Mono to
  **Barlow Condensed (display) + Barlow (body) + DM Mono (mono)** via
  `next/font`. Keep CSS var names `--font-casi-sans` / `--font-casi-mono`
  + add `--font-casi-display` so v7's heading treatment works.

### Skins
- Replace the seven entries in `src/lib/skins.ts` with the v7 set.
- Migration `YYYYMMDDHHMMSS_v7_skin_remap.sql` runs the mapping in
  decision #2.
- Add `profiles.accent_color text null` for per-streamer accent override.

### Verify
- `npx tsc --noEmit` clean.
- `npm run lint` clean.
- `/overlay`, `/s/[username]`, `/admin`, `/studio` still render (skin
  inheritance still works on existing surfaces — v1 styling looks
  different but isn't broken).

## Phase 2 — Shared components

Build into `src/components/`:

- **`WalletPill`** — net dot + USDC/SOL balance + identity dropdown.
  Wraps `useWallet()` from `@solana/wallet-adapter-react`. Renders Phantom
  + Solana official SVG logos.
- **`EarningsBar`** — viewer-link + Copy / Today EUR / Today USDC /
  Pending. Replaces v3's 4-stat strip.
- **`SlotCard`** — viewer-side slot row (used in /overlay + /s/[username]
  booking surfaces).
- **`ShapeButtonGroup`** — shape selector for live editor + viewer.
- **`Nav`** — single shared top bar. v7 repeats nav markup on every
  screen; consolidate.

Reuse existing: `MonoNumber`, `CopyRow` (already in `src/components/`).

## Phase 3 — Landing (`src/app/page.tsx`)

Existing structure is a 36-line stub composing four sub-components.
Rebuild each:

- **`LandingNav`** — wordmark + "12 live now" + Connect Wallet pill.
- **`LandingSplitDoor`** — two-pane hero. Left: viewer search ("Book
  screen time on a live stream"). Right: streamer CTA ("Sell slots on
  your stream") + mock-stream watermark.
- **`TrustStrip`** — 3-column band: "0% revenue cut" / payment rails
  (Stripe + USDC + Free) / approval guarantees.
- **`LandingFooter`** — © + 4 links.

Pure CSS — no new data dependencies.

## Phase 4 — Studio split

Currently one page (`src/app/studio/page.tsx`, 1011 lines). v7 splits into
two routes via tabs.

### `/studio` (Dashboard mode)
- Control header (welcome + live status + End stream).
- `EarningsBar`.
- Mode tabs (`/studio` ↔ `/studio/live`).
- "Airing now" list (restyled `AiringNow.tsx`).
- "Pending approval" list (restyled `ApprovalQueue.tsx` with the
  `.q-r.beam` / `.q-r.flash` left-border rail).
- "Flashes today" list (restyled `FlashesLog.tsx`).

### `/studio/live` (Live editor mode, NEW route)
- Same control header + mode tabs.
- Toolbar: "Ready" status + "+ Beam" button.
- Canvas (`StudioLiveEditor.tsx` moves here): backdrop + slots, click to
  select, drag to move.
- Right control panel: Shape buttons / Price / Opacity / Glow on
  start / Done / Delete.

Mode tabs are real route links, not local state — bookmarking + reload
should land on the right surface.

## Phase 5 — Settings (`/studio/settings`, NEW)

New route mirroring v7's leaner rail. Reuses existing components from
`src/app/admin/settings/_components/` — extract the reusable ones to
`src/components/settings/` rather than duplicating.

Rail groups:
- **Account**: Profile
- **Payouts**: Payouts
- **Studio**: Appearance · OBS sources · Session key

Sections:
1. **Profile** — restyle existing `ProfileSection.tsx`. Avatar +
   display name + handle + bio.
2. **Payouts** — restyle existing `PayoutsSection.tsx`. Stripe Connect
   + Solana wallet rows with status pills.
3. **Appearance** — NEW. Combines skin picker + accent override + live
   preview tile. Replaces existing `AppearanceSection.tsx` +
   `SkinPickerCard.tsx` (admin) which were separate.
4. **OBS sources** — restyle existing `ObsSourcesSection.tsx`. Two URL
   rows (backdrop, beams) + custom CSS hint.
5. **Session key** — restyle existing `SessionKeySection.tsx`. Active
   pill + key meta + scope description + Revoke button.

Leave `/admin/settings` alone. The Phase 0 chip points streamers at the
new surface.

## Phase 6 — Viewer surfaces

### `/overlay` (1976 lines, battle-tested)
- Keep all booking/escrow/Stripe logic untouched.
- Restyle the booking panel to v7's `slot-card` list + inline expanding
  `book-form` (media tabs, duration stepper + presets, optional message,
  cost panel, dual pay buttons).
- Wallet pill in the nav.
- Keep the canvas + active beams renderer as-is — only the booking UI
  surface changes.

### `/s/[username]`
- Restyle to v7's `vb-head` venue-feel header (avatar + bio + live
  badge + overlay link).
- Flash feed already exists; restyle rows to `flash-item` shape.
- This page is marketing — booking still funnels into `/overlay`.

## Phase 7 — Auth (`/auth`, NEW)

**Pre-work**: inspect the existing auth setup. The recent
`claude/google-sign-in` merge (commit `edec2ef`) suggests there's
already a sign-in surface; need to read it before estimating the delta.

If existing surface is minimal:
- Build new `/auth` route with v7's split-panel layout.
- Sign-in tab: Google OAuth + email/password.
- Sign-up tab: 3-step wizard (Account → Username → Profile).
- Left panel switches between brand quote (sign-in) and step progress
  (sign-up).

If existing surface is substantial: restyle in place rather than
greenfield.

## Verification per phase

Each phase ends with:
- `npx tsc --noEmit` clean
- `npm run lint` clean
- `npm test` (existing 35 unit assertions stay green)
- Manual smoke of the changed surface in `npm run dev`

## Open / deferred

- Exact teal shade — `#0DCFB0` is the v7 starting point; iterate later.
- Auth flow detail — pending pre-work in Phase 7.
- Cleanup of `/admin` — separate PR after redesign ships.
- Skin migration rollback — if a streamer reverts, what happens? Likely
  fine since old ids fall through to `casi-dark` default; confirm before
  shipping the migration.
