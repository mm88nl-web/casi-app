# Handoff — Casi Redesign (v3)

## Overview

This package contains the v3 redesign of **Casi** (`www.casi.gg`) — a streamer
monetization platform with three earn-surfaces: **flashes** (paid chat),
**beams** (time-rented slot overlays on the stream), and **backdrops**
(full-bleed sponsor skins). The redesign covers four screens:

1. **Landing** — public marketing page with two-path CTA (viewer / streamer)
2. **Viewer booking** — the flow a viewer follows to book a slot on a stream
3. **Streamer dashboard** — live monitor + inbound queue + earnings
4. **Settings** — profile, payouts, slot defaults, OBS sources, session key, notifications, moderation

It also includes a **skin system**: 7 themable colorways (Casi Dark, Void,
Neon, Twitch, Terminal, Ember, Chrome) driven entirely by CSS custom
properties.

## About the design files

The file in `design/casi-redesign-v3.html` is a **design reference** — a
single self-contained HTML prototype showing intended look, copy, layout, and
behavior. **It is not production code.** Your job is to recreate these
screens inside the existing `casi-app` codebase
(`github.com/mm88nl-web/casi-app`, Next.js 16 App Router + Tailwind 4 +
Supabase) using its established patterns and libraries. Note: this repo is on
Next 16 and Tailwind 4 — see `AGENTS.md` for the breaking-change callouts
(async `params`/`cookies()`, `@theme` in CSS instead of `tailwind.config.ts`,
etc.). Lift the design tokens, typography, and component vocabulary; ignore
the HTML scaffolding (meta-bar, skin-swatch strip, JS tab switcher) — that's
prototype chrome.

The file contains four screens stacked as `<section class="screen">` with
`id="screen-landing" | "screen-viewer" | "screen-streamer" | "screen-settings"`.
Use the meta-bar at the top of the file to switch between them when viewing
the prototype in a browser.

## Fidelity

**High-fidelity.** Final colors, typography, spacing, component shapes, and
copy. Recreate pixel-close using the repo's existing stack (Next.js + Tailwind
+ Supabase). This repo is on Tailwind 4 — there is no `tailwind.config.ts`;
theme tokens live in the `@theme` block in `src/app/globals.css`. Extend
tokens there rather than hard-coding.

---

## Design tokens

All tokens live on `:root` in the prototype. Port them into the `@theme`
block in `src/app/globals.css` (Tailwind 4) and/or as CSS custom properties
on `:root` for the skin-overridable ones.

### Color — default skin (Casi Dark)

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#050505` | Page background |
| `--surface` | `#0d0d0d` | Cards, panels |
| `--surface-2` | `#111111` | Nested surfaces, input bg |
| `--border` | `#1c1c1c` | Default border |
| `--border-2` | `#2a2a2a` | Emphasized border / hover |
| `--text` | `#f0f0f0` | Primary text |
| `--text-mid` | `#888` | Secondary text |
| `--text-dim` | `#555` | Tertiary / labels |
| `--text-faint` | `#333` | Quaternary / hints |
| `--accent` | `#F58220` | Primary accent (orange) |
| `--accent-rgb` | `245,130,32` | For `rgba()` on accent |
| `--accent2` | `#06b6d4` | Secondary accent (cyan) |
| `--accent2-rgb` | `6,182,212` | For `rgba()` on accent2 |

### Skins

Seven skins, each overrides `--bg`, `--surface`, `--border`, `--text`,
`--accent`, `--accent-rgb`, `--accent2`, `--accent2-rgb`. Match
`src/lib/skins.ts` in the repo (already defines these):

| Skin | Accent | Notes |
|---|---|---|
| Casi Dark | `#F58220` orange + `#06b6d4` cyan | Default |
| Void | `#ffffff` + `#888` | Pure mono |
| Neon | `#ff2d78` + `#00f5d4` | Magenta/mint on deep violet `#080010` |
| Twitch | `#9146FF` + `#772CE8` | Purple on `#0e0e10` |
| Terminal | `#39ff14` + `#00cc00` | Phosphor green on black |
| Ember | `#ff6a00` + `#ee0979` | Orange/pink on `#0d0805` |
| Chrome | `#e2e2e2` + `#c9a227` | Silver/gold on `#0a0c10` |

Implementation: apply by setting CSS vars on `document.documentElement`.
See `applySkin()` at line 5625 of the prototype. **Persistence: the DB is
source of truth** — the streamer's choice is stored on `profiles.skin`
(migration `20260413120000_add_skin_column.sql`) because the OBS overlay
(`/overlay`) runs in a separate browser context on the streamer's OBS
machine and must read the chosen skin from the server. `localStorage` is
fine as a per-device cache for instant paint, but the write-path must hit
`profiles.skin` so the overlay stays in sync.

### Typography

| Role | Family | Fallback | Google Fonts weights |
|---|---|---|---|
| Display (UI, headings) | **Syne** | Space Grotesk, system-ui | 500, 600, 700, 800 |
| Mono (labels, code, numeric) | **DM Mono** | JetBrains Mono, IBM Plex Mono, ui-monospace | 300, 400, 500 |

Pattern: Syne for everything by default, DM Mono for:
- Labels, meta, timestamps, IDs
- Numeric values (€ amounts, counts, viewer counts, slot sizes)
- Navigation items in sidebars
- Button copy in some contexts (check prototype per component)

Sizes used in the prototype (these are rough — match visual size, not px):

- Hero display: 88–120px Syne 700
- Section title: 28–40px Syne 700
- Body: 14–15px Syne 500
- Eyebrow / meta mono: 10–12px DM Mono 500, `letter-spacing: 1.5–2px`, uppercase
- Numeric display (earnings, timer): 24–48px DM Mono 500, tabular-nums

### Spacing, radius, misc

- Card radius: **16px** (large panels), **10–12px** (inner elements), **6–8px** (chips, pills, inputs)
- Button radius: **8px** (default), **999px** (pill CTAs on landing)
- Border: always 1px solid, using `--border` or `--border-2`
- Grid bg: 80px × 80px, `rgba(accent, 0.035)` lines — landing only
- Accent tint on backgrounds: `rgba(var(--accent-rgb), 0.06)` for hovers, `0.14` for active

---

## Screens

### 1. Landing (`#screen-landing`, line ~750)

**Purpose:** Public marketing. Explain Casi's three earn-surfaces and funnel
visitors into either the viewer or streamer path.

**Layout:**
- Hero section: centered column, max-width ~1100px, large Syne display headline
- "Two paths" CTA row: two big tile-buttons side-by-side — "I want to watch" / "I want to stream" — each with a headline, sub-tag, and arrow
- How-it-works: numbered steps explaining flashes / beams / backdrops
- Footer: minimal, links to docs + Discord

**Copy:** "Sell space on your stream." "Drop a browser source into OBS.
Viewers pay to place images, clips or banners on your screen — by the
minute, or per-flash. You approve. You keep 100%."

### 2. Viewer booking (`#screen-viewer`, line ~972)

**Purpose:** A viewer picks a streamer, chooses a surface (flash/beam/
backdrop), configures it, pays, and submits for streamer approval.

**Layout:**
- Top: streamer card (avatar, name, live status, current viewer count)
- Main: 2-tab surface selector (**Flash** / **Beam**). Backdrop is not a top-level tab in the viewer UI — it lives as a shape (`data-shape="backdrop"`) inside Beam's slot picker, priced as a full-bleed slot
- Config panel (context-dependent): upload media, set duration, pick a shape (hex / circle / banner / rect / rounded / backdrop), live preview on a mock stream
- Pay CTA (Stripe copy): "€4.00 · 60 seconds · Stripe processes, fees included"

### 3. Streamer dashboard (`#screen-streamer`, line ~1948)

**Purpose:** Live monitor + approval queue + earnings summary. This is the
screen a streamer keeps open in a second window while streaming.

**Layout (3-column):**
- Left rail (220px): nav + status + quick-link to settings
- Center: live scene preview (16:9) with active beams/backdrops rendered on top, plus timeline of upcoming bookings
- Right rail (340px): inbound approval queue — each item has thumbnail, @handle, €amount, duration, [Approve] / [Reject] / [Ban] actions

**Notable:** Earnings strip across the top showing today / week / month / all-time with DM Mono numerics.

### 4. Settings (`#screen-settings`, line ~2722)

**Purpose:** Configure everything. Two-column layout with sticky left rail.

**Rail groups (current order):**
- **You**: Profile · Payouts · Account
- **Stream**: Slot defaults · OBS sources
- **Wallet**: Session key *(Solana delegate — see below)*
- **Alerts**: Notifications
- **Safety**: Moderation *(bottom — backend is stub, de-emphasized)*

**Sections in order:**
1. Profile — avatar, @handle, display name, bio, social links
2. Payouts — Stripe Connect status, payout schedule, €-per-payout threshold
3. Slot defaults — allowed shapes, min/max duration, default prices
4. OBS sources — **two separate URLs** (see below)
5. Session key — Solana escrow delegate (see below; has nothing to do with OBS)
6. Notifications — email/push toggles per event type
7. Moderation — category blocklist (NSFW/Political/Gambling/Alcohol), keyword list, user blocklist
8. Danger zone — delete account

**OBS sources:**
Two copy-rows. These are the real route shape (`src/app/obs/page.tsx`):

1. **Backdrop** — `https://www.casi.gg/obs?s={username}&layer=backdrop` · "Full-bleed. Put this at the bottom of your scene."
2. **Beams** — `https://www.casi.gg/obs?s={username}&layer=beams` · "All shaped slots render here — hex, circle, banner, rect, rounded, backdrop."

Notes for the implementer:
- Flashes are **not** an OBS source. They render inside `/overlay` via
  `FlashFeed` / `FlashPanel` alongside the beams layer. Don't add a third
  OBS URL — there is no `flashes` layer in `/obs/page.tsx`.
- URLs carry **no `k={key}` auth param**. The route resolves the streamer by
  public `username` slug. Don't invent a key-rotation RPC or a
  `{backdrop,beams}_key` column — none of that exists in the repo, and the
  route has no code to validate such a key.
- **No "Regenerate all keys" button.** The prior handoff described one; drop
  it from the UI.
- **No webhook fields** — removed in this redesign.

**Session key (Solana delegate):**
This is the **Solana escrow delegate keypair**, not an OBS URL token.
Streamer registers a session pubkey on-chain via `set_delegate`; the server
holds the encrypted secret (`streamer_delegates` table, sealed with
`DELEGATE_ENCRYPTION_KEY`) and uses it to sign delegated booking-lifecycle
instructions (`start_beam_delegated`, `settle_beam_delegated`,
`approve_flash_delegated`, `deny_flash_delegated`) so the **streamer** doesn't
get a wallet popup on every approve/kick. See `AGENTS.md` → "Phase 3 —
session-key delegation" and `src/app/admin/_components/DelegateKeyCard.tsx`
for the install / rotate / revoke state machine. **Do not** reuse this key
as an OBS URL auth token — it's a signing key and leaking it in browser-source
URLs compromises the streamer's delegated approvals.

---

## Components to build

### Global
- **`<Skin provider>`** — context that reads from `localStorage`, sets CSS vars on `<html>`, persists changes. 7 presets from `src/lib/skins.ts`.
- **`<MonoNumber>`** — renders a numeric with `font-variant-numeric: tabular-nums` and DM Mono. Used throughout for €, durations, viewer counts.
- **`<CopyRow>`** — input + copy-to-clipboard button. Used in Settings > OBS sources. Truncates middle of URL, shows toast on copy.
- **Button variants**: `primary` (solid accent), `ghost` (transparent + border), `danger` (red). All 8px radius except landing CTAs (pill).

### Settings-specific
- **`<SettingsLayout>`** — sticky left rail + scrollable content column. Rail auto-highlights current section on scroll.
- **`<SettingsSection>`** — card with `title`, `desc`, children. 16px radius, 24px padding, `--surface` bg, 1px `--border`.
- **`<FieldRow>`** — label above input pattern used throughout. Label is DM Mono 11px uppercase + letter-spacing.
- **`<BlockChip>`** — removable chip for blocklists (categories, blocked users). `× remove` affordance, `+ add` chip to append.

### Dashboard-specific
- **`<LivePreview>`** — 16:9 embed showing the live scene with overlay surfaces rendered on top. Hot-reloads as bookings become active.
- **`<ApprovalCard>`** — inbound booking item in right rail. Shows thumbnail, @handle, € amount, duration, shape, with Approve/Reject/Ban.
- **`<EarningsStrip>`** — horizontal 4-stat bar at top of dashboard.

### Viewer-specific
- **`<SurfaceSelector>`** — 2-up tab selector for Flash / Beam. Backdrop is rendered as a shape option inside Beam's slot picker, not as a third top-level card.
- **`<ShapePicker>`** — icon grid for hex/circle/banner/rect/rounded.
- **`<StreamMockPreview>`** — shows the user's upload composited onto a mock stream in the chosen shape/position.

---

## Interactions & behavior

- **Skin switch**: instant. CSS custom property swap on `<html>`. No page reload. Transition: 150ms ease on relevant properties.
- **Settings rail nav**: click scrolls the section into view (`behavior: 'smooth'`). Active item follows scroll via `IntersectionObserver`.
- **OBS copy buttons**: `navigator.clipboard.writeText(url)` → inline toast "Copied". Auto-dismiss 1.5s.
- **Dashboard approval queue**: real-time via Supabase Realtime on the `bookings` table, status=`pending`. Approve/Reject mutates status.
- **Viewer booking**: Stripe Checkout for payment. On success, booking enters `pending` state until streamer approves.

## State management

Follow the existing repo patterns (`src/app/page.tsx` uses `useState` +
Supabase client). For settings specifically:
- Profile / payouts / slot defaults / moderation: form state, save on blur or explicit Save button
- OBS URLs: derived client-side from the streamer's own `profiles.username` — no keys, no server write path
- Session key (Solana delegate): install via `/api/solana/delegates/install`, status via `/api/solana/delegates/status`, revoke via `/api/solana/delegates/revoke`. See `AGENTS.md` for the two-phase install contract (DB upsert + on-chain `set_delegate`)
- Skin: persisted on `profiles.skin` (DB is source of truth so the OBS overlay can read it); `localStorage` may be used as a per-device cache

## Assets

The prototype uses:
- **Google Fonts**: Syne, DM Mono. Load via `next/font` in the app to avoid FOUT.
- **No image assets** — everything is CSS. Avatars are placeholder colored circles with initials. Streamer scene previews are mock gradients + noise.

When you connect the real app, user avatars come from `profiles.avatar_url`
(there is no `streamers` table — the schema uses `profiles` for both
streamers and authenticated users; see `AGENTS.md` → "RLS and permission
model").

## Files

```
design_handoff_casi_redesign/
├── README.md                             ← this file
└── design/
    └── casi-redesign-v3.html             ← the prototype, all 4 screens + skin system
```

Open `design/casi-redesign-v3.html` in a browser. Use the meta-bar at top to
switch screens. Use the swatch strip to try skins.

## Open work (not in this handoff)

Two design tasks from this session's todo are **not yet in the prototype** —
mention to the design team before implementing:

1. How-it-works section on landing needs a less-templated layout
2. Streamer dashboard may split into `/studio` (live monitor) + `/studio/setup` (config) — not yet decided
