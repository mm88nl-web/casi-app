<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing code that touches App Router, Route Handlers, Server Actions, or `next.config`. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# CASI — agent orientation

CASI lets livestream viewers pay to put their image / video / message **on stream** as an overlay for a fixed duration. Streamers run OBS with a CASI browser-source URL; viewers book a slot via the web app; the streamer approves, the beam appears, the timer expires, payment settles.

## Current project state (May 2026)

**Phase**: pre-mainnet. The web app and `casi-escrow` Anchor program run on Solana **devnet** at https://casi.gg. Mainnet launch is gated on an external audit currently being scoped.

**Repository**: public on GitHub at `mm88nl-web/casi-app`, **Apache-2.0** for the entire codebase. Founder: Matthew Melendez (mm88nl@gmail.com), Netherlands, solo non-technical builder using AI-assisted tooling.

**Grant in flight**: a Solana Foundation grant application is being prepared, framed around `casi-escrow` as a reusable time-vested USDC escrow primitive (developer tooling category, $25k ask). Working draft lives at [`grant-answers.md`](./grant-answers.md) with two remaining TODOs (audit firm name + quote amount) blocked on quote replies. The grant funds: external audit + remediation contractor, `@casi/escrow-sdk` npm package + tutorial, public `cancel_stale_pending` cranker + design note. CASI itself is positioned as the *reference integration* — the consumer product is sustained separately by streamer SaaS, not the grant.

**Audit outreach**: written quote requests sent to **Sec3** (Jack Tsai's reply: stated rate ~$18/LOC excluding comments + tests, putting `casi-escrow`'s ~1.2k LOC at roughly $22k; advised that audits should follow product-market-fit rather than precede it — directly informs the capped-mainnet plan), **OtterSec**, and **Neodyme**. Realistic total: $22k audit + ~$3k remediation contractor sourced via Superteam Earn or audit-firm referral. Full context in [`grant-answers.md`](./grant-answers.md) and [`capped-mainnet-plan.md`](./capped-mainnet-plan.md).

**Monetization posture**: **no protocol fees, ever** — 100% of every booking flows directly viewer→streamer on both rails. CASI never holds, routes, or skims funds (legal posture: software company, not a payment processor). Future revenue is planned via streamer SaaS (Streamlabs Ultra-style $10–30/mo Pro tier with custom branding, auto-approve rules, team accounts, analytics) and possibly brand-deal advertising once there's enough streamer inventory. None of that is shipped yet.

**Recent design overhauls**: `v9` design system (May 2026) replaced v7's 7-skin variable bag with a **two-color contract** (`--ink` + `--paper`) — see "Theme system" below. Fonts moved to Bricolage Grotesque + JetBrains Mono + Instrument Serif (Barlow + DM_Mono are gone from `layout.tsx`). Default ink stayed teal `#0DCFB0` so existing streamers don't see a brand flip; cinnabar `#FF5C2E` is now an opt-in skin. Per-streamer `profiles.skin` + `profiles.theme_color` overrides still work — they now drive `--ink` + `--paper` instead of the old per-skin variable bag. v7 tokens (`--casi-accent`, `--casi-bg`, …) are aliased onto v9 in `globals.css` so legacy code keeps rendering. Dev tools (`DevScreenSwitcher` + `DevTweaksPanel`, mounted in `layout.tsx`) ship gated to `NODE_ENV !== 'production'`. Earlier `v7` (Phases 0–7) introduced the `/studio` split (dashboard + live editor) and the four OAuth providers on `/login` — both still live.

**Studio dashboard polish (PR #59, May 2026)**: per-slot inline queue under each Airing row with **Play now** per queued booking; **End Stream** confirm dialog driving sequential delegate-first shutdown via `endStreamCleanly` (kick actives → deny pendings → deny flashes → deny queue → flip `is_live`); **payment-gate** on Approve (gated on `payment_intent_id || tx_signature || free || price_value === 0`, mirroring admin); **click-to-preview modal** on pending rows; **live vested-amount** under each Airing timer (matches the on-chain settle math); streamer-level **`profiles.display_currency`** preference (eur / usd / usdc) with a picker under Profile in Settings — collapses dashboard tiles to a single currency. "Live editor" tab renamed to **"Live"**. See `studio/_components/EndStreamDialog.tsx`, `studio/_components/PreviewBookingModal.tsx`, and migration `20260502000000_profile_display_currency.sql`.

**What an agent picking this up should NOT do**: don't add protocol fees on the Stripe or Solana rail; don't refactor the Anchor program before audit; don't build new Pro-tier features pre-mainnet; don't widen RLS to fix permission errors (always go column-level). Read the rest of this file before changing money-moving code.

## Stack at a glance

- **Frontend**: Next.js App Router, TypeScript, Supabase JS client, Solana wallet-adapter (Phantom et al.).
- **Backend**: Next.js Route Handlers under `src/app/api/`. Webhook endpoints, cron jobs, payment flows all live here. Server routes use the Supabase service-role key and bypass RLS.
- **Database**: Supabase (Postgres + PostgREST + RLS). Hosted. Migrations in `supabase/migrations/` with timestamp prefixes.
- **Payments**:
  - **Stripe Connect Direct Charges** for fiat. Streamers onboard via Connect; charges land on their connected account. **No application-fee skim** (the previous 5% platform fee was stripped in commit `46fa5ab`). 100% of the charge goes to the streamer. **Charge currency = streamer's `account.default_currency`** — pulled at authorize/approve-queue time and mirrored to `profiles.settlement_currency` so viewer surfaces (overlay, /s/[username]) render the right symbol without a per-render Stripe round-trip. Supported in the picker: EUR, USD, GBP, AUD, CAD, BRL, JPY, SGD (see `src/lib/currency.ts::SUPPORTED_FIAT`). CNY + BTC deliberately excluded — Stripe Connect doesn't support CN-based accounts and the escrow program is USDC-only.
  - **Solana escrow** for crypto. Anchor program in `programs/casi-escrow/`. Viewer locks **USDC** in a PDA-owned vault ATA; `CasiEscrowClient` in `src/lib/casi-escrow.ts` wraps the IDL. Prorated settle on early end, refund on cancel. SOL is only used for transaction fees (paid by the cranker for delegated calls; otherwise by the wallet signer).
- **Auth**: `/login` (single page covering both sign-in and 3-step signup). Supabase email/password + four OAuth providers — Google, Twitch, Discord, X (Twitter) — wired in `src/app/login/page.tsx`. OAuth callback at `src/app/auth/callback/route.ts` is provider-agnostic. **Each OAuth provider must be enabled in the Supabase Dashboard** (Authentication → Providers) with its own client id + secret, or the button throws "provider is not enabled."
- **Hosting**: Vercel. Cron jobs defined in `vercel.json`. **On Hobby plan — daily-only cron, no more.**
- **Tests**: `ts-mocha` over `tests/unit/*.test.ts`. Run `npm test`.

## Repo layout

```
src/app/
  admin/              legacy streamer dashboard (auth-gated)
    page.tsx          main file — kept <2k lines by design
    _components/      private components (underscore = Next.js ignores for routing)
    settings/         settings home — payouts, session key, accent picker, etc.
      _components/    one component per section (incl. AppearanceSection.tsx)
  studio/             v7 streamer cockpit — split into two pages (Phase 4):
    page.tsx          /studio = dashboard (stats, share section, live status)
    live/page.tsx     /studio/live = canvas editor (slots / pricing / approvals)
    settings/         v7 settings home (mirrors /admin/settings; canonical home)
    setup/            initial-setup flow for fresh streamer accounts
    _components/      shared studio chrome
  overlay/            OBS browser-source target (renders active beams)
  s/[username]/       shareable streamer landing page — bio + live indicator +
                      flashes feed + hero CTA to /overlay (NOT a booking surface)
  login/              single-page auth (sign-in + 3-step signup); 4 OAuth
                      providers + email/password
  auth/callback/      OAuth callback route — provider-agnostic, hands off to
                      /login?finish=true if the user has no profiles row yet
  api/
    bookings/         create/expire/advance/deny + per-rail variants
    stripe/           authorize, cancel, webhook, end-early, approve-queue
                      connect/ (POST = onboarding link writer; status = read-only)
    solana/           sync-webhook (on-chain events → DB)
                      delegates/ (install / status / revoke / start-beam /
                                  settle-beam / approve-flash / deny-flash)
    cron/             stripe-janitor, solana-reconciler, cranker-monitor
    flashes/          tip-style ephemeral messages
    log/              client-side error ingest (rate-limited)
  ...
src/lib/
  casi-escrow.ts          Anchor client wrapper
  casi-errors.ts          enumerated on-chain error names → user-readable
  cranker-keypair.ts      shared loader for SOLANA_CRANKER_KEYPAIR
  observability.ts        structured JSON logs → stdout + optional webhook
  solana-network.ts       cluster + explorer URL helpers
  streamer-moderation.ts  SINGLE SOURCE OF TRUTH for the moderation handlers
                          (approve / deny / endBeamEarly / moderateFlash) and
                          the escrow primitives (startSolanaBeamOnChain,
                          settleOrClearSolanaEscrow). Both /admin and /studio
                          call into this — don't reimplement in either surface.
  stripe.ts               Stripe SDK singleton
programs/casi-escrow/     Anchor program source (Rust)
supabase/migrations/      SQL, applied via Supabase Dashboard SQL Editor
tests/unit/               mocha + chai, wired into CI via .github/workflows/ci.yml
```

## Data model — the three things booked

- **`bookings`**: image/video "beams" and "backdrops" that occupy an overlay slot for N minutes at a price per minute/total.
- **`flashes`**: tip messages with optional media. No slot, no timer — pop up briefly.
- **`overlay_elements`**: streamer-defined slots on their canvas (position, size, lock state).

Every bookable row has a `status` lifecycle: `pending → approved_queued | active → expired | denied | cancelled`. The `element_id` foreign key connects bookings to slots.

## RLS and permission model (read this before touching auth)

- **`anon`** has column-level SELECT on `bookings` and `flashes`, *excluding* `cancel_token`. Reading that column via PostgREST is denied — server routes read it as service-role.
- **`anon` cannot UPDATE or INSERT** any booking/flash. All mutations go through server routes.
- **Viewer-initiated mutations** (cancel a pending booking, deny a queue spot) authenticate via a per-booking `cancel_token` handed out only once at create time. See `/api/bookings/viewer-deny`, `/api/stripe/cancel`.
- **Streamer-initiated mutations** use the Supabase session bearer. Streamers can only mutate their own `profile_id` rows.
- When adding a new sensitive column to `bookings` or `flashes`, **extend the column-level GRANT list** in a migration — don't rely on RLS alone.

## Auth providers (read this before touching `/login`)

The `/login` page (`src/app/login/page.tsx`) is the single auth surface — same page handles sign-in, 3-step signup, and post-OAuth profile finalization (`?finish=true` query param). No separate `/signup` page; `/signup` redirects here with `?tab=signup`.

**Providers wired in code**:

- **Email + password** (Supabase native, always available).
- **Google OAuth** (commit `4786cf6`).
- **Twitch OAuth** (commit `f52366f`).
- **Discord OAuth** (commit `f52366f`).
- **X / Twitter OAuth** (commit `f52366f`).

All four OAuth buttons call a single generic `handleOAuth(provider)` → `supabase.auth.signInWithOAuth({ provider })`. The OAuth callback at `src/app/auth/callback/route.ts` is provider-agnostic — it exchanges the code for a session and routes based on whether a `profiles` row exists.

**Each provider must be separately enabled in the Supabase Dashboard** (Authentication → Providers) with its client id + secret. Google is configured today. Twitch / Discord / X were added in code but **may not be enabled in the dashboard yet** — if a streamer clicks one of those buttons and gets "provider is not enabled," the dashboard config is the missing piece, not the code. The Supabase OAuth callback URL pattern is `https://<project-ref>.supabase.co/auth/v1/callback`.

**First-time OAuth signup flow**:
1. User clicks "Continue with Twitch" (or any OAuth provider) on `/login`.
2. Supabase redirects to provider, provider returns to `/auth/callback?code=...`.
3. `exchangeCodeForSession` writes the cookie, then we check for a `profiles` row.
4. **Profile exists** → redirect to `/admin` (or `?next` destination).
5. **Profile missing** → redirect to `/login?finish=true`. Login page detects this, jumps the user to step 2 (username) of signup with display_name + avatar pre-filled from provider metadata. Final submit just inserts into `profiles` (auth.users already created).

**Don'ts**:
- Don't add a provider to the login page without also enabling it in the Supabase Dashboard — the buttons render but throw on click.
- Don't try to do post-OAuth profile creation server-side from `/auth/callback`. The current flow intentionally bounces the user back through the multi-step signup UI so they pick a username + bio. Skipping that gives you orphan profiles with auto-generated usernames.

## Theme system — v9 two-color (ink + paper)

The v9 design system replaces v7's 7-skin variable bag with a **two-color contract**: `--ink` (accent) and `--paper` (background). Every other token (text scale, surfaces, lines, ink tints, on-ink) is derived from those two via `color-mix()` in `src/app/globals.css`. Skin/user providers only set the two roots; the rest falls out for free.

| Token group | Vars |
|---|---|
| Roots | `--ink`, `--paper` |
| Ink ladder | `--ink-04`, `--ink-08`, `--ink-14`, `--ink-22`, `--ink-40`, `--ink-70` |
| Text scale | `--text`, `--text-2`, `--text-3`, `--text-4` |
| Surfaces / lines | `--surf`, `--surf-2`, `--line`, `--line-2`, `--on-ink` |
| Type | `--H` (Bricolage display), `--B` (Bricolage body), `--M` (JetBrains Mono), `--S` (Instrument Serif) |
| Density | `--gap`, `--pad` |

**Light/dark**: opt-in via `[data-paper="light"]` on a wrapper element. The `DevTweaksPanel` flips it automatically when paper is bright.

**Backwards-compat alias layer**: every v7 token (`--casi-accent`, `--casi-bg`, `--casi-surface`, `--casi-border`, `--casi-text`, `--casi-text-muted`, `--casi-surface-2`, `--casi-border-2`, `--casi-text-mid`, `--casi-text-dim`, `--casi-text-faint`) is aliased onto its v9 equivalent in `:root`. Existing components that read `var(--casi-*)` keep rendering correctly. **New code should use the v9 tokens directly.**

**Skins** in `src/lib/skins.ts` still exist as 7 presets, but each entry now also declares `ink` + `paper` (== accent + bg in v9 vocabulary). Default `--ink` stays teal `#0DCFB0` so existing streamers don't see a brand-color flip.

| Skin id | Name | Ink | Paper |
|---|---|---|---|
| `casi-dark` (default) | Casi Dark | `#0DCFB0` (teal) | `#0C0D11` |
| `twitch` | Twitch | `#9146FF` | `#0E0E1A` |
| `kick` | Kick | `#53FC18` | `#0A1A0A` |
| `youtube` | YouTube | `#FF0000` | `#0D0606` |
| `cyber` | Cyber | `#06B6D4` | `#050A12` |
| `mono` | Mono | `#E8E8E8` | `#0A0A0A` |
| `rose` | Rose | `#F472B6` | `#0A0515` |

**Per-streamer overrides** live on the `profiles` table:
- `profiles.skin` — picks one of the 7 skin ids above.
- `profiles.theme_color` — optional **custom ink override** for that streamer's surfaces. Stored as a hex string. NULL means "use the skin's ink."

**Where colors are applied** (unchanged from v7):
- `src/components/UserSkinProvider.tsx` — logged-in streamer's own pages.
- `src/components/SkinProvider.tsx` — viewer-facing pages scoped to a streamer (`/overlay?s=username`, `/s/username`). Both providers now write `--ink` + `--paper` (the rest derives via `color-mix`); v7 alias writes are kept in sync for backward-compat.
- `src/app/globals.css` — v9 root defaults + `[data-paper="light"]` variant + v9 chrome classes (`.casi-v9-nav`, `.casi-v9-mark`, `.casi-v9-wordmark`, `.casi-v9-marquee`, `.casi-v9-foot`, `.casi-v9-vb-*`, etc).

**v9 component library** in `src/components/v9/`:
- `CasiMark` — 3-stripe + lozenge SVG with `var(--paper)` cutout (auto-adapts when paper changes).
- `Wordmark` — `casi.` with ink-color dot.
- `NavBar` — sticky nav: logo + wordmark left, optional `liveLabel`, `chips`, default `WalletButton` on the right.
- `WalletButton` — pre-connect pill (the connected wallet pill is still `WalletPill` until that's ported).
- `Marquee`, `Footer` — shared chrome.
- `DevScreenSwitcher`, `DevTweaksPanel` — dev-only tools, mounted in `src/app/layout.tsx`, gated to `NODE_ENV !== 'production'`. Hide via `localStorage.casi-v9-devbar='off'`. Tweaks panel persists to `localStorage.casi-v9-tweaks`.

**Common confusion**: if a streamer says "the colors look wrong," check `profiles.theme_color` first — they probably picked a preset (Gold, Rose) that overrides the teal default ink. Fix in Settings → Appearance.

**Don'ts**:
- Don't hardcode brand colors in components. Use `var(--ink)` (or v7-alias `var(--casi-accent)`) and the derived ladder. Known exceptions: yellow "Extend" mode button in `overlay/page.tsx` (`#eab308`), OAuth provider brand-color SVG icons in `login/page.tsx`.
- Don't bypass `SkinProvider` for viewer-facing pages — the streamer's accent must propagate to the overlay or brand consistency breaks.
- Don't reintroduce `--casi-accent2`. v9 is two-color only; the legacy purple is preserved as a static alias for any code that still reads it, but new code should compose with `--ink` only.
- Don't mount the dev tools (`DevScreenSwitcher` / `DevTweaksPanel`) anywhere outside `layout.tsx` — they auto-gate on `NODE_ENV` and would render twice.

## Admin / Studio conventions

- `src/app/admin/page.tsx` is the legacy kitchen sink — canvas, requests queue, modals, toasts. Kept together because state flows top-down and splitting the state shards makes things worse. Every self-contained UI chunk is extracted into `_components/`.
- **`/studio` is the v7 streamer cockpit, split into two pages** (Phase 4):
  - `src/app/studio/page.tsx` is the **dashboard** — stats, share section, live status, no canvas editing.
  - `src/app/studio/live/page.tsx` is the **canvas editor** — slot positioning, pricing, approvals queue, the actual moderation surface.
  - Both call the same moderation lib (see below); they differ only in layout and which surfaces they expose.
- **Both pages share moderation handlers via `src/lib/streamer-moderation.ts`.** The lib is the single source of truth for `approveBooking`, `denyBooking`, `endBeamEarly`, `moderateFlash`, `playNowBooking`, `endStreamCleanly`, plus the escrow primitives `startSolanaBeamOnChain` and `settleOrClearSolanaEscrow`. Admin's local handlers are thin adapters that pipe React state (toasts, optimistic updates) around lib calls — don't add new business logic to them, edit the lib instead.
- When adding a new card or panel, follow the existing split pattern: one component per file, props-driven, variant prop (e.g. `kind: 'beam' | 'backdrop'`) to share a component across similar but differently-themed surfaces.
- Admin's four core handlers (`playNow`, `kickBeam`, `approveBooking`, `denyBooking`) close over supabase + profile + state and get passed into card components as callbacks. Don't duplicate them into children.
- `kickBeam` (admin) and `endBeamEarly` (lib) both accept an `opts.skipAutoAdvance` flag. Play-Now and End-Stream callers set it true — they pick which booking gets promoted (or none, in End-Stream's case), so letting the auto-advance branch promote the queue's first entry would leave two `active` rows on the same slot.
- `endStreamCleanly(ctx, { actives, pendingBookings, pendingFlashes, queuedBookings, profileId }, { onProgress })` runs sequential shutdown: `endBeamEarly({ skipAutoAdvance: true })` per active → `denyBooking` per pending → `moderateFlash('deny')` per flash → `denyBooking` per queued → flip `is_live=false`. Sequential not parallel (wallet popups must come up one at a time when delegate isn't installed); failures collected (`EndStreamFailure[]`), don't halt the loop. Delegate-first via the existing primitives — zero popups when the session key is healthy. `/studio/live` bounces to `/studio?end=true` so the dashboard (which has the data loaded) owns the dialog.
- `playNowBooking(ctx, queuedBooking, currentActive)` is the lib mirror of admin's `playNow`. Kicks the current beam (if any) with `skipAutoAdvance: true`, runs `start_beam` on the chosen booking (Solana rail), flips DB to `active`, and overwrites `overlay_elements.image_url`. Other queued rows untouched.

## Payment flow quick reference

**Stripe booking create**:
1. Viewer fills form → `POST /api/stripe/authorize` creates a PaymentIntent in manual-capture mode on the streamer's connected account.
2. Viewer confirms → PI status `requires_capture`. Row inserted as `pending` with `payment_intent_id`.
3. Streamer approves in admin → server flips to `active` (or queues if slot occupied).
4. Beam timer expires → `/api/stripe/end-early` (or `/api/bookings/expire-and-advance`) captures the PI. Cron (daily) sweeps any abandoned ones.

**Solana booking create**:
1. Viewer fills form → `start_beam` instruction on the Anchor program stakes SOL into a vault ATA under a PDA keyed by booking id.
2. DB row inserted as `pending` with `escrow_pda`, `viewer_wallet`.
3. Streamer approves → `active`.
4. Beam expires or streamer kicks → `settle_beam` instruction: streamer receives vested portion, viewer gets unvested refund, vault closes.
5. On-chain events sync back via `/api/solana/sync-webhook`.

**Important**: the Solana rail does **not** auto-promote the next queued booking on expire. The admin page's `playNow` handler explicitly kicks the current and starts the next. Don't add auto-promotion to the Solana rail without also updating the escrow program.

## Phase 3 — session-key delegation (the "no popup on approve" flow)

Phase 3 added a scoped delegation layer to the escrow program so the streamer doesn't have to sign a wallet popup every time a beam starts OR gets kicked early. The program still works without any of this — it's pure UX glue on top of `start_beam` / `settle_beam`.

**Program surface** (see `programs/casi-escrow/PRIMITIVE.md` for the full framing):

- `set_delegate` — streamer signs once, stores a session pubkey + expiry under a PDA keyed by the streamer.
- `revoke_delegate` — streamer invalidates the delegate at any time.
- `start_beam_delegated` — same effect as `start_beam`, but signed by the registered session key instead of the streamer wallet.
- `settle_beam_delegated` — same effect as `settle_beam`, signed by the session key. Vesting math is identical to wallet-signed settle, so a compromised session key can at worst force an early settle at the current vested point; funds still split per the on-chain schedule.
- `approve_flash_delegated` — same effect as `approve_flash` (Pending → Settled, full amount → streamer ATA), signed by the session key. Cranker pays fees + one-time streamer-ATA rent.
- `deny_flash_delegated` — same effect as `deny_flash` (Pending → Cancelled, full refund → viewer ATA), signed by the session key. Cranker pays fees (viewer almost always already has a USDC ATA since they funded from it).
- Scoping summary: the session key can ONLY call the four delegated twins above. It cannot withdraw funds outside the escrow's declared destinations (approve always goes to `escrow.streamer`, deny always goes to `escrow.viewer`, settle splits per the on-chain vesting schedule), cannot cancel pending escrows on the viewer's behalf, cannot change delegation.
- `cancel_stale_pending` — permissionless crank that refunds the viewer after a 7-day (`PENDING_TIMEOUT_SECS`) Pending timeout. Any signer can call it.

**Server surface**:

- `/api/solana/delegates/install` — streamer-auth; generates a session keypair, seals the secret with `DELEGATE_ENCRYPTION_KEY` (AES-256-GCM), upserts to `streamer_delegates`.
- `/api/solana/delegates/status` — UI helper to pick card state (not-installed / installed / expired / revoked).
- `/api/solana/delegates/revoke` — streamer-auth; stamps `revoked_at`. Admin should also fire `revoke_delegate` on-chain.
- `/api/solana/delegates/start-beam` — called by the admin page's approve handler when a healthy delegate exists. Signs `start_beam_delegated` with the decrypted session key. **Uses the cranker as fee payer** (the session key has no SOL; Solana refuses to debit an un-credited account).
- `/api/solana/delegates/settle-beam` — called by admin's `kickBeam` + `settleOrClearSolanaEscrow` (deny-on-Active). Signs `settle_beam_delegated` with the session key, cranker pays fees + ATA inits. On 503 `no_cranker` or any non-OK status, the admin page falls back to wallet-signed `settle_beam`.
- `/api/solana/delegates/approve-flash` / `/api/solana/delegates/deny-flash` — called by admin's `moderateSolanaFlash` before the wallet-sign path. Sign `approve_flash_delegated` / `deny_flash_delegated`; same outcome shape as settle-beam so `describeDelegateSettleFailure` maps reasons to toasts. Webhook mirror: the Helius handler routes flash instructions through `applyFlashTransition` (parallel to the bookings path) to flip `flashes.status` — both wallet-signed and delegate-signed trips converge there.

**The cranker** (`SOLANA_CRANKER_KEYPAIR` env var, loaded via `src/lib/cranker-keypair.ts`):

- Single shared keypair that pays fees for the delegated twins (`start_beam_delegated`, `settle_beam_delegated`) and signs the permissionless `cancel_stale_pending` crank from the daily reconciler.
- Required if the delegate flow is enabled. Unset = both delegated routes return 503 `reason: 'no_cranker'` and admin falls back to wallet-signed start/settle (popup per action). This is a safe degradation; the program doesn't care.
- Fund with ~0.05 SOL. Steady-state cost per delegated start or settle is ~10k lamports (0.00001 SOL, two signatures × 5k base fee). First-ever settle to a brand-new streamer OR first-ever refund to a brand-new viewer adds a one-time ~2.04M lamports (0.00204 SOL) ATA rent-exempt reserve per fresh ATA; once created, subsequent flashes/beams to the same wallet skip it. Worst-case both-ATAs-fresh is ~0.00409 SOL. Cancel-stale-pending cranks eat ~5k lamports each. At steady state 0.05 SOL covers thousands of operations.
- Loader returns `null` on missing/malformed env — never throws. Callers branch on null and either fall back or 503.
- **Daily balance monitor**: `/api/cron/cranker-monitor` (04:00 UTC) probes the cranker's SOL via `Connection.getBalance` and emits structured logs at two thresholds — `logWarn` at 0.005 SOL (~500 ops left), `logError` at 0.001 SOL (one fresh-ATA settle could break the next op). `ERROR_WEBHOOK_URL` fans the critical case out to Slack/Discord. Read-only; never moves funds.

**Where the install UI lives**: `DelegateKeyCard.tsx` (in `src/app/admin/_components/`) is the reusable card. It's mounted inside `src/app/admin/settings/_components/SessionKeySection.tsx`, which provides the `onInstalled` callback that signs `set_delegate` from the streamer wallet. The legacy `/admin` route's `ProfileEditCard` also references it but the new settings page is the canonical home.

**Install UX contract** (see `DelegateKeyCard.tsx` state machine):

Install is a two-phase write — DB row (server) + on-chain `set_delegate` (streamer wallet). Either can fail independently, so the component tracks a `needs-finalize` state:

1. `loading` → fetch status.
2. `absent` → "Install" button. Disabled unless `walletReady` (wallet connected AND matches `profile.solana_wallet`).
3. Click Install → POST `/api/solana/delegates/install` (DB upsert). Then call `onInstalled(sessionPubkey, expiresAt)` which the admin page implements as a `set_delegate` tx from the streamer wallet.
4. If step 3b throws, component stays in `needs-finalize` with a "Finalize →" button. Clicking re-runs `onInstalled` with the **same** session pubkey — no DB write, no key regeneration. Idempotent retry.
5. Green "✓ Delegate registered on-chain — view tx" with Solscan link on success.
6. Rotate = same flow but keeps the old `installed_at`; revoke flips DB `revoked_at` and (should) fire `revoke_delegate` on-chain.

**Never regenerate session keys on finalize retry** — the DB already has the pubkey committed. A new key means the on-chain `set_delegate` would register a stranger. Always re-use the pubkey the server returned.

**Env vars introduced in phase 3**:

| Name | Notes |
|---|---|
| `DELEGATE_ENCRYPTION_KEY` | 32 raw bytes, base64 or hex. `openssl rand -base64 32`. Rotating invalidates every installed delegate. |
| `SOLANA_CRANKER_KEYPAIR` | 64-byte secret as base58 OR JSON array. Same format as `~/.config/solana/id.json`. |

**Migration**: `supabase/migrations/20260425000000_streamer_delegates.sql` adds the `streamer_delegates` table (one row per streamer, sealed secret + pubkey + expiry + rotated/revoked timestamps).

**Don'ts**:

- Don't make the install button callable without `walletReady` — you'll leave orphan DB rows when the streamer clicks before connecting.
- Don't have the client sign `start_beam_delegated` / `settle_beam_delegated` with a user wallet. They're scoped to the session pubkey; a user-wallet sig will fail the `delegate.session_key == session` constraint.
- Don't reuse the cranker as the escrow vault authority, the streamer, or anything else money-moving. It's a fee payer. Keep its balance small.
- Don't skip the webhook for `start_beam_delegated` / `settle_beam_delegated` / `approve_flash_delegated` / `deny_flash_delegated` / `cancel_stale_pending` / `set_delegate` / `revoke_delegate` discriminators. For bookings the webhook is the only authoritative DB writer; for flashes both the webhook AND `/api/flashes/moderate` can write, but both gate on `WHERE status = 'pending'` so first-writer-wins and duplicates no-op. Delegated variants must share the non-delegated handler (`settle_beam_delegated` → `settle_beam`'s Active → expired path; `approve_flash_delegated` → pending → approved; `deny_flash_delegated` → pending → denied).

## Solana escrow state machine (read this before touching deny / refund paths)

**On-chain state is authoritative.** The DB is a projection; it can drift (tab closes mid-tx, cron hasn't run, webhook missed). Anything that acts on funds must probe the PDA first via `connection.getAccountInfo(pda)` and branch on the result.

**Program constraints (from `programs/casi-escrow/src/lib.rs`)**:

| State | Who can close it | How |
|---|---|---|
| `Pending` (viewer funded, streamer hasn't approved) | **viewer only** | `cancel_escrow` → 100% refund |
| `Pending`, age ≥ 7 days | **anyone (permissionless crank)** | `cancel_stale_pending` → 100% refund to viewer |
| `Active` (streamer called `start_beam`) | **viewer OR streamer** | `settle_beam` → pro-rata |
| after `elapsed ≥ duration` | **anyone (permissionless crank)** | `settle_beam` → 100% to streamer |

Streamers cannot cancel a `Pending` escrow from their side. That's a program-level constraint, not a UI choice — if you think you need to add it, update the program first.

`start_beam` and `settle_beam` both have delegated twins (`start_beam_delegated` / `settle_beam_delegated`) signed by a pre-registered session key instead of the streamer wallet. Same status effects and same vesting math — the program treats the session key as a narrow proxy for the streamer's signature, nothing more. See the phase-3 section above.

**Settle math**: `vested_to_streamer = total × min(elapsed, duration) / duration`, viewer gets the remainder. `elapsed = now − start_timestamp` where `start_timestamp` is set by `start_beam`. This means **a booking left in `denied` DB state while the escrow is still `Active` on-chain vests 100% to the streamer as wall-clock time passes**. Admin deny MUST call `settle_beam` immediately for Active escrows, not just flip DB status.

**EscrowState layout** (for raw decoding without loading the IDL):
```
8   bytes  Anchor discriminator
32  bytes  escrow_id
32  bytes  viewer Pubkey
32  bytes  streamer Pubkey
32  bytes  usdc_mint Pubkey
8   bytes  total_amount (u64)
8   bytes  duration_secs (u64)
8   bytes  start_timestamp (i64)
1   byte   escrow_type (0=Flash, 1=Beam)
1   byte   status       (0=Pending, 1=Active)   ← offset 161
1   byte   bump
```
`Settled` / `Cancelled` close the account, so if `getAccountInfo` returns non-null the status byte is only 0 or 1. Viewer-side recovery uses this to skip loading the IDL on every row.

**Recovery surfaces**:
- Viewer: `reclaimSolanaEscrow` in `overlay/page.tsx` — probes PDA, cancels if Pending, tells viewer "beam is live" if Active. Handles numeric booking ids. Shows for denied rows scoped by `viewer_name` (local-tab) OR `viewer_wallet` (cross-device same-wallet), so abandoning a tab and reconnecting from a new browser still surfaces the refund chip as long as the same wallet is used.
- Viewer bulk: `POST /api/bookings/cleanup-stale-solana` + the "Clean up ended" button in the overlay's "Your beams" header. Probes every denied/expired/cancelled Solana row for a given `viewer_wallet` and nulls `escrow_pda` where the on-chain PDA is actually gone. No auth — only write is clearing a DB column on rows whose funds already left the vault. Used to wipe "ghost" RECOVER USDC chips left over from prior builds / aborted flows.
- Streamer: none by design. Deny-on-Active settles immediately via `settleOrClearSolanaEscrow`, and the `cancel_stale_pending` crank in `/api/cron/solana-reconciler` refunds abandoned Pending escrows after 7 days. Admins don't need to babysit stuck escrows.
- Shared helper: `settleOrClearSolanaEscrow` in `src/lib/streamer-moderation.ts` — discriminated-outcome (`settled | closed | pending-chain | no-wallet | error`) so callers compose their own DB + toast logic without duplicating signing boilerplate. `kickBeam` uses this too: DB only transitions to `expired` when outcome is `settled` or `closed`. Every other outcome leaves the beam live with a toast — this is load-bearing, since flipping DB while the escrow is still Active on-chain is how streamers end up with "Ended early — USDC recoverable" ghost chips and vesting clocks that keep ticking. Accepts an optional `hooks.onDelegateFailure` callback so admin can toast the delegate failure reason before the wallet-sign fallback fires.

**Delegate failure diagnostics**:
- `trySolanaStartDelegated` / `trySolanaSettleDelegated` / `trySolanaFlashDelegated` (all exported from `src/lib/streamer-moderation.ts`) return a `DelegateSettleOutcome` discriminated union (`{ ok: true, alreadyProcessed? } | { ok: false, reason?, message?, status? }`). Never a bare boolean — every caller must branch on `.ok`.
- `describeDelegateSettleFailure(outcome)` (also in `src/lib/streamer-moderation.ts`) maps reason codes (`no_session | no_delegate | revoked | expired | no_cranker | decrypt_failed | key_mismatch | db_error | chain_error | network_error`) to user-facing strings. Admin callers toast this BEFORE the wallet-sign fallback so the streamer sees WHICH failure caused the popup.
- `/api/solana/delegates/settle-beam` 502 responses carry `casiError` (parsed Anchor variant via `parseCasiError`) and a prefixed `message` — the toast names the on-chain revert (`NotActive`, `Unauthorized`, `DelegateExpired`, etc.) instead of a bare opaque string.
- `no_cranker` (503) means `loadCrankerKeypair` returned null — env var unset / empty / wrong length / base58-decode failure. NOT a balance issue; the server never tries to submit when cranker can't load. If the env var IS set on Vercel but the route still returns `no_cranker`, the value is malformed (extra whitespace, wrong format, truncated paste).

## Migration workflow

- Timestamp filename: `YYYYMMDDHHMMSS_description.sql`.
- Apply via Supabase Dashboard → SQL Editor → New Query → paste → Run. Migrations are **not** auto-applied from the repo.
- Hobby plan can't use `CREATE INDEX CONCURRENTLY` inside a transaction — use plain `CREATE INDEX IF NOT EXISTS`. Locks are milliseconds at current scale.
- When testing RLS/GRANT changes, the Supabase SQL Editor runs as `service_role` and **bypasses grants**. Test from the client side with `curl` + the anon key:
  ```
  curl https://<ref>.supabase.co/rest/v1/<table>?select=<col>&limit=1 \
    -H "apikey: <anon-key>"
  ```

## Common gotchas

- **Don't hardcode `$` or `€` symbols in viewer-facing UI**. Use `fiatSymbol(streamerCurrency)` / `formatFiat(streamerCurrency, amount)` from `src/lib/currency.ts`. `streamerCurrency` comes from `profile.settlement_currency` (mirror of Stripe Connect's `account.default_currency`); fall back to `null` for graceful USD-style rendering. A streamer with a GBP Connect account whose viewer sees `$5/min` and is charged £5 has a UX bug — and pre-fix, was being charged USD with FX loss.
- **`calcAmountCents(value, unit, minutes, currency)` is currency-aware**. JPY is zero-decimal; calling it without the 4th arg means USD-style `* 100`, which over-charges JPY by 100×. Always pass the streamer's `account.default_currency` in routes that hit Stripe.
- **PostgREST returns NUMERIC columns as strings**. Always `Number(booking.duration_minutes)` before math.
- **Server routes need `export const dynamic = 'force-dynamic'`** (or a similar opt-out) whenever they read headers/cookies — or you'll get a build error about dynamic server usage.
- **Stripe Connect application fees** are set on the PaymentIntent at creation; can't be changed on capture. Plan the split up front.
- **Solana cluster mismatch**: `WALLET_ADAPTER_CLUSTER` + `EXPLORER_CLUSTER_QUERY` must match. Devnet wallet on mainnet endpoint = silent failure.
- **`file_type: 'video'`** means use `<video autoPlay loop muted playsInline>`. `SlotMedia` does this — don't `<img>` a video URL.
- **`profile_id` vs `auth.uid()`**: `profiles.id` = user id = `auth.uid()` for authenticated streamers. `bookings.profile_id` points at the streamer (who *receives*), not the viewer.
- **Numeric vs string `booking_id`**: PostgREST returns `bookings.id` as a JS number, but older server routes rejected `typeof booking_id !== 'string'`. Always accept either — `typeof x === 'number' ? x : String(x)` — or the viewer's client will silently 400. Affects `/api/bookings/viewer-deny`, `/api/bookings/attach-solana-tx`, `/api/bookings/expire-and-advance`.
- **`NEXT_PUBLIC_CASI_PROGRAM_ID` unset**: `CasiEscrowClient` throws a loud error in its constructor. Without this guard, unset env → client falls back to `SystemProgram.programId` and signs txs that look fine to the wallet but land on the wrong program.
- **Session key as fee payer**: neither `start_beam_delegated` nor `settle_beam_delegated` can be signed with the session key as fee payer — Solana returns `"Attempt to debit an account but found no record of a prior credit"` because the ephemeral key has never received SOL. Always pay fees with the cranker; co-sign with the session key. `loadCrankerKeypair` in `src/lib/cranker-keypair.ts` is the shared loader.
- **Cranker balance drift**: the cranker is the silent single point of failure for the delegated approve/kick flow. Monitor its SOL balance; if it hits 0, every approve AND every kick starts popping a wallet prompt again (routes return 503, admin falls back). Steady-state cost is ~10k lamports per start OR settle (base fee × 2 sigs); a one-time ~0.00204 SOL ATA rent is added the FIRST time a fresh streamer or viewer ATA is created. For a streamer with repeat viewers, subsequent operations are just the base fee — not 0.01 SOL each. The daily `cranker-monitor` cron warns/errors at 0.005 / 0.001 SOL thresholds via `ERROR_WEBHOOK_URL`.
- **Stripe denied-chip window**: the viewer overlay surfaces "✕ Denied — refund on the way" for Stripe denials within `STRIPE_DENIED_WINDOW_MS = 10 min` of `created_at`. Anchor on `created_at` because there's no `denied_at` column. The old 30s window meant a streamer denying after 30s + a viewer reload = no chip ever showed; 10 min covers realistic moderation latency.
- **`playNow` queue safety**: `kickBeam(current, { skipAutoAdvance: true })` is mandatory in `playNow`. Without the flag, `expireBooking` auto-promotes the queue's FIRST `approved_queued` row, then `playNow` ALSO promotes the booking the streamer clicked — both end up `active` on the same `element_id`, both vesting clocks tick, the overlay shows whichever `image_url` won the race.
- **`useSearchParams()` needs Suspense**: Next 16's static-export pass refuses to traverse pages that read search params without a `<Suspense>` boundary above. `/studio/page.tsx` splits into a thin default export wrapping the inner component in `<Suspense>` for this reason. Build error: `useSearchParams() should be wrapped in a suspense boundary at page "/studio"`.
- **Float precision in countdown timers**: `formatRemaining(secs)` floors `secs` first — `duration_minutes` can be fractional (e.g. 0.5min for tests), so `durationSecs - elapsed` is a float and `s = float % 60` produced `3:34.99999...` in the airing timer. Always floor before mod.
- **Vested vs total decimals must match**: `1 / 8.17 USDC` reads as a typo to a streamer; `1.42 / 8.17 USDC` reads as a running tally. Compute decimals once based on whether *either* side is fractional, then `toFixed(decimals)` both.
- **Approve must be payment-gated**: `isPaymentConfirmed(b) = !!(b.payment_intent_id || b.tx_signature || b.payment_method === 'free' || Number(b.price_value) === 0)`. Approving without payment lets the streamer flip `status='active'` on an unfunded escrow — Solana reverts at start_beam time, Stripe leaves a row that can never capture. Both /admin and /studio gate Approve; `studio/page.tsx::handleApprove` also rejects defensively in case realtime races present a stale UI.

## Observability

- `logError(scope, err, extra?)` and `logWarn(scope, msg, extra?)` from `src/lib/observability.ts` emit structured JSON to stdout. Vercel log drain picks them up automatically.
- Optional: set `ERROR_WEBHOOK_URL` env var to fan out to Slack/Discord/Better Stack. Payload shape: `{level, scope, message, stack, extra, ts}`.
- Client-side errors are captured by `ClientErrorReporter` and POSTed to `/api/log`. Dedupe window 10s, rate-limit 20/min/IP.

## Commands

- `npm run dev` — local dev server
- `npm run build` — production build (requires env vars; will fail in a bare sandbox, that's expected)
- `npx tsc --noEmit` — type check only
- `npm test` — 35 unit assertions, ~13ms
- `npm run lint` — ESLint

## When in doubt

- **Don't add a protocol fee on either rail.** 100% of every booking flows direct viewer→streamer. CASI's positioning depends on this (regulatory posture: software, not payments) and the grant story depends on it. If you think you need a take rate, you don't — talk to the founder first.
- **Don't broaden RLS or add table-level GRANTs.** Go column-level.
- **Don't touch `admin/page.tsx` without extracting the piece you added to `_components/`** if it's more than ~30 lines of JSX.
- **Don't put new moderation logic in `admin/page.tsx`.** The four core handlers live in `src/lib/streamer-moderation.ts` so /admin and /studio share one implementation. Admin's local handlers are thin adapters that translate `ModerationResult` to toasts + optimistic state. New logic goes in the lib.
- **Don't hardcode brand colors.** Use `var(--accent)` / `var(--accent2)` tokens; per-streamer overrides come from `profiles.theme_color` via the SkinProvider.
- **Don't add an OAuth provider in code without enabling it in the Supabase Dashboard** (Authentication → Providers + client id/secret). The button will throw on click.
- **Don't add every-minute cron on Hobby.** Deploy will fail.
- **Don't call `select('*')` on bookings.** Use the explicit column list already in `admin/page.tsx` / `overlay/page.tsx`.
- **Don't auto-promote Solana queue on expire.** Escrow program isn't wired for it.
- **Don't flip a Solana booking's DB status without reconciling the chain first.** DB status ≠ escrow status; acting on the DB alone leaves funds stuck or over-vested to the streamer. Use `settleOrClearSolanaEscrow` or equivalent probe-first logic.
- **Don't build a second booking surface.** `/overlay` is the canonical Stripe + Solana booking flow; `/s/[username]` is a marketing landing page that funnels into it. If you need richer in-page booking on /s/[username], wire it through `/api/stripe/authorize` + `CasiEscrowClient` — never a parallel implementation.
- **Don't refactor the Anchor program before the audit.** It's frozen pending external review. Bug fixes only, and only with a clear test demonstrating the bug.
- **Don't ship new Pro-tier streamer features pre-mainnet.** SaaS upsell is the planned monetization but it's premature — focus is shipping mainnet + onboarding the first cohort.

## Known compliance + product gaps (not bugs, but on the followup list)

- **No custom SMTP wired in code.** Verification + password-reset emails go through Supabase's default sender, which has terrible deliverability. Configure Resend/Postmark + SPF/DKIM/DMARC on `casi.gg` in the Supabase Dashboard before mainnet.
- **No onboarding email drip.** Streamer signs up → verification email → silence. Activation is going to suffer post-mainnet without at minimum a Day-0 welcome + Day-2 "set up your slot canvas" + Day-7 "first earnings" sequence (Loops / Customer.io / Resend).
- **No imprint + cookie banner on landing.** Founder is in Netherlands; Dutch law + GDPR require both. `/legal/privacy` exists but lists only email contacts (no company name / KvK / address). Auth uses cookies — even essential-only requires a disclosure.
- **No demo video / screenshot on the landing page.** `LandingSplitDoor` is interactive but text-only. Single highest-leverage marketing fix when product is polished enough for it.
- **Per-IP rate limit only on booking-creation routes.** Sophisticated abuse from a proxy pool bypasses. Add per-`profile_id` rate limit alongside per-IP — one column on `free_flash_rate_limits` table.
- **SOL as a third bookable rail (post-audit).** Currently CASI prices in USDC only — the Anchor program transfers USDC tokens between SPL accounts and has no native-SOL transfer path on `start_beam` / `settle_beam` / `cancel_escrow`. A streamer wanting to accept native SOL tips would need (a) program changes (~200 LOC + tests for SOL-branched instructions, separate `EscrowState` accounting field), (b) audit re-scope (current Sec3 / OtterSec / Neodyme quotes are sized for ~1.2k LOC USDC-only), (c) cranker rebalance — current cranker holds ~0.05 SOL, can't underwrite SOL escrows. Frozen until post-mainnet. Don't add SOL pricing rows to `BeamCtrlPanel` / Settings / dashboard tiles before the program supports it; UI saying "SOL" while the booking flow ignores it is worse than no SOL at all.

## Competitive context (for orientation, not strategy)

Closest mechanical competitors are **Streamlabs Media Share** + **StreamElements Media Share** + **Tangia** + **Blerp** — all let viewers tip to play YouTube/TikTok clips on stream, default ~10¢/sec. Different mechanic from CASI: clip-only (no upload), all-or-nothing, no time-vested escrow, traditional Stripe-with-take-rate. Solana-native overlap: **stream.gift** (donation-only), **StreamerCoin** (token-based), **Blurt** (Dialect blinks for Twitch). **Sollinked** ($30k Hyperdrive winner) is the closest on-chain pattern — paid email/calendar with USDC escrow, but async + binary-settle. CASI's defensible niche is high-stakes paid takeovers (own image/video on stream for N paid minutes with prorated time-vesting) + open-source primitive, not generic tipping. None of the competitors I checked are open source under a permissive license.
