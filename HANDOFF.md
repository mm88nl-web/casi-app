# Casi — Frontend Handoff (v9 final)

This is the visual + interaction reference for the Casi product. It is a single static HTML file (no build step) intended as the **design source of truth**, not the app shell.

- **File:** `casi-final-v9.html`
- **Stack expected for implementation:** React 18 + Vite (or Next.js App Router), TypeScript, Tailwind, Wagmi + Solana wallet-adapter, Stripe Elements.
- **Deps already pinned in the prototype:** React 18.3.1 (production build), ReactDOM 18.3.1 (production build), Babel standalone 7.29.0 (only used to load JSX inline — strip in real build).

## Screen inventory

| # | id | Purpose |
|---|----|---------|
| 01 | `s-landing` | Marketing landing page |
| 02 | `s-viewer` | Viewer-side overlay booking flow (the streamer's audience) |
| 03 | `s-studio` | Streamer dashboard — earnings, queue, airing now, flashes log |
| 04 | `s-live` | Studio live editor — overlay slot composition |
| 05 | `s-settings` | Profile, payouts, appearance, OBS sources, session key |
| 06 | `s-auth` | Sign in / sign up — OAuth + email + wallet |

Each top-level screen has a `data-screen-label` attribute (e.g. `01 Landing`) for the dev-mode screen switcher at the bottom of the viewport.

## Design tokens

All theming is driven by CSS custom properties on `:root` (see top `<style>` block):

- `--ink` — accent color (orange #FF5C2E by default)
- `--paper` — background
- `--text`, `--text-3`, `--text-4` — text scale
- `--surf`, `--line`, `--line-2` — surfaces & dividers
- `--ink-04`, `--ink-08`, `--ink-22`, `--ink-40`, `--ink-70` — ink at fixed alphas
- `--H` Bricolage Grotesque · `--M` JetBrains Mono · `--S` Instrument Serif

The Tweaks panel (bottom-right when enabled) live-edits these and persists via `__edit_mode_set_keys`. In a real build, replace it with a settings → appearance route — the underlying CSS-var contract stays the same.

## Currency picker (Settings → Profile)

Five display currencies: EUR · USD · GBP · USDC · SOL. Picker is **display-only** — both Stripe and on-chain rails settle in their native asset. The selected currency is written to `localStorage.casiCcy` and read by `setCcy()` to re-render every numeric tile on Studio.

For implementation: hold the picked currency in your global app state (Zustand / Redux / Jotai), persist to user profile on the backend, and run all dashboard amounts through a `formatAmount(value, ccy)` helper.

## Studio Live Editor

Three-column layout: **Layers** (left) · **Canvas** (16:9, center) · **Properties** (right, tabbed: Properties / Pricing / Behavior).

- Layers panel: visibility + lock toggles, drag-grip for z-order, live indicator dot for any slot currently being booked.
- Canvas: edit mode shows dashed bounds + slot labels + 12-col grid; preview mode hides chrome and shows what the audience sees.
- Properties tab: shape (Rect / Rounded / Circle / Hex / Banner / Backdrop).
- Pricing tab: per-rail rates (USD / EUR / USDC / SOL) + min/max duration + cooldown.
- Behavior tab: entrance animation, glow on start, sound on book, show booker name, plus inline 7-day earnings + booked-time per slot.
- Sticky OBS-source URL bar with copy button at the top of the editor.
- Keyboard shortcut hints under the canvas: V, R, C, ⌘D, Del.

## Auth (06)

Four OAuth buttons (Google · Twitch · Discord · X) above an "or use email" divider, on both sign-in and signup step 1. Brand glyphs are inline SVG — see `.oa-btn` blocks.

## Airing-now slot detail modal

`#air-modal` opens from the `i` button on each airing-now row in the Studio dashboard. Shows message, slot/type/rate/total/timestamp/tx grid, progress bar, and end-early / block-buyer actions.

## Things to strip when porting

1. The Babel standalone script tag and all `<script type="text/babel">` blocks — convert JSX to real `.tsx` modules.
2. The dev-mode screen switcher at bottom (`.ss-bar`).
3. The Tweaks panel — replace with Settings → Appearance.
4. Inline `<style>` block — port to Tailwind theme + a few component classes.

## What's mocked vs real

- **Mocked:** all dollar amounts, FX rates, addresses, airing slot data, queue, flashes log.
- **Real contract intent:** OBS source URL pattern, Stripe + Solana payout rails copy, OAuth providers, currency display semantics, the slot-shape vocabulary (Rect / Rounded / Circle / Hex / Banner / Backdrop).

## Brand notes

- Wordmark: lowercase `casi` with a colored period. Mark is the three-stripe + lozenge SVG (see `.casi-mark`). Use the same dedup'd gradient IDs (`solg-u1`, `solg-u2`, etc.) when rendering Solana ribbons in multiple places — IDs collide otherwise.
- Type: Bricolage Grotesque for display, JetBrains Mono for meta/labels, Instrument Serif italic for accents (✦, "live", section flourishes).
