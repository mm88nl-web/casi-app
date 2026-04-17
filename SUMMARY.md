# CASI — Project Summary

Snapshot for picking up across chat sessions. Reflects the repo at branch
`claude/continue-casi-work-PvzRm` (HEAD = `c09b252` at time of writing).

> ⚠️ **READ THIS FIRST** — every branch mistake in the 2026-04-17 session
> came from assuming the working copy matched the remote. Before doing
> ANYTHING else in a new chat:
> ```
> cd ~/casi-app
> git fetch origin
> git checkout claude/continue-casi-work-PvzRm
> git pull
> git branch --show-current    # MUST print claude/continue-casi-work-PvzRm
> git log --oneline -3          # top commit should be c09b252 or later
> grep -c 'pub mod fee_wallet' programs/casi-escrow/src/lib.rs   # must be 0
> grep cluster Anchor.toml      # must say "Localnet"
> ```
> If any of those don't match, stop and fix before writing or deploying.

## Current state (2026-04-17)

- **Anchor program deployed to devnet**: `Dkai2s6Rwreyh51bajqLYMJdfHE6Gonwz9vFw6joUfRd`
  (no-fee, 100% viewer→streamer payout)
- **Dead program IDs on devnet** (do not redeploy to these — permanently retired via `solana program close`):
  - `78bw5wjc3hdLYxf5kcMX1eSAvbtPyjvcYo2GZsJyzvYo` (deployed from wrong branch with fee code)
  - `DqpeEBpVpPpEVNStq3iUgS6a4jFSsGpkusxYf1rrxTkC` (same)
- **Deploy wallet**: `8TzUa1U5EEcWHBwbTDhNutyMj2NmTh2gsfcuvVYnGQUv` (upgrade authority)
- **Production URL**: `https://www.casi.gg` (apex `casi.gg` → 307 redirects; always use the `www.` form in server-to-server calls)
- **Admin header refactored**: utility bar (wallet pill + save status) above main nav (logo + tabs + Go Live + action buttons). No more horizontal overflow.
- **Stripe Janitor GHA fixed**: GitHub `APP_URL` secret pointing at `https://www.casi.gg`, `CRON_SECRET` rotated + synced with Vercel Production env. Currently green, runs every 5 min.

## What it is

Streamer monetisation platform with three earn-surfaces, each on three rails:

| Surface     | Stripe                         | Solana                          | Free                   |
|-------------|--------------------------------|---------------------------------|------------------------|
| **Flash**   | Checkout → manual capture      | `casi-escrow.initialize_flash`  | Direct insert, 1/min   |
| **Beam**    | Checkout + proration           | `casi-escrow.initialize_beam`   | `price_value = 0` slot |
| **Backdrop**| Checkout + proration           | `casi-escrow.initialize_beam`   | `price_value = 0` slot |

(Backdrops are beams with `is_background = true` — same on-chain primitive.)

Streamers approve/deny flashes and prorate-end beams in a dashboard. All
Solana payments go through the in-house Anchor program `casi-escrow` — see
`programs/casi-escrow/README.md` for the on-chain design, audit scope, and
test coverage.

## Stack

- Next.js 16.2.2 (App Router), React 19.2.4, TypeScript 5, Tailwind 4
- Supabase (Postgres + RLS + Realtime + Storage)
- Stripe (Connect + manual-capture PaymentIntents) — EUR
- Solana web3.js + Wallet Adapter + Anchor 0.31.1, `casi-escrow` on-chain program, Helius webhooks — devnet USDC
- Vercel hosting; cron via GitHub Actions (Hobby tier killed Vercel cron)

`AGENTS.md` warning: this Next.js version has breaking changes vs older docs —
read `node_modules/next/dist/docs/` before touching framework APIs.

## Routes

### Pages (`src/app/`)
- `/` — landing + inline streamer search (`page.tsx`)
- `/login` — combined sign-in / multi-step sign-up
- `/signup`, `/search` — redirects
- `/admin` — streamer dashboard, ~1.9k LOC, react-rnd canvas + booking queue
- `/overlay?s={username}` — viewer booking UI, ~1.5k LOC; `?mode=obs` strips chrome
- `/obs?s={username}&layer=beams|backdrop` — transparent OBS browser source with realtime sync + 30s watchdog reload
- `/profile/edit` — display name, bio, theme color, Stripe Connect, Solana wallet
- `/s/[username]` — redirects to `/overlay`
- `/v`, `/setup`, `/join` — legacy / orphaned, not linked from main flow

### API (`src/app/api/`)
- `flashes/create` — create Flash row (Stripe: returns Checkout URL; Solana: returns `solana_wallet`; Free: rate-limited insert)
- `flashes/attach-escrow` — after `initialize_flash` tx, viewer posts `escrow_pda + tx_signature + viewer_wallet`
- `flashes/moderate` — streamer approves/denies: Stripe captures/refunds; Solana verifies on-chain `approve_flash`/`deny_flash` tx and flips status
- `stripe/authorize` — create Checkout session on streamer's connected account (Direct Charges, manual capture, zero `application_fee_amount`)
- `stripe/webhook` — persist `payment_intent_id` on `checkout.session.completed` (handles Connect-mode `account` header)
- `stripe/cancel` — void if `requires_capture`, refund if `succeeded`
- `stripe/connect` — Express onboarding link
- `stripe/end-early` — proration capture (auth-checked: caller must own profile)
- `stripe/approve-queue` — checkout for queued bookings
- `cron/stripe-janitor` — bearer-auth'd: capture overdue actives, advance queue, delete storage files
- `solana/sync-webhook` — register streamer wallet with Helius webhook account list
- `webhooks/solana` — Helius-auth'd: match CASI escrow program tx → log confirmation (does not auto-approve — client is source of truth)
- `webhooks/pumpfun` — observational logging only

## Domain model

Three core tables (see `supabase/migrations/`):

- **profiles** — `id`, `username`, `display_name`, `bio`, `avatar_url`, `theme_color`, `skin`, `is_live`, `stripe_account_id`, `solana_wallet`, `preview_background_url`, `template_url` (legacy)
- **overlay_elements** — `profile_id`, percent-based `pos_x/y/width/height`, `price_value`, `price_unit` (`min`|`hr`), `max_duration_minutes`, `is_background`, `image_url`, `locked`
- **bookings** — `profile_id`, `element_id`, `viewer_name`, `status` (`pending`|`approved_queued`|`active`|`expired`|`denied`), `image_url`, `storage_path`, `file_type`, `message`, `duration_minutes` (numeric), `price_value`, `price_unit`, `payment_method` (`stripe`|`solana`), `payment_intent_id`, `original_amount_cents`, `tx_signature`, `stream_id`, `started_at`, `approved_at`, `is_queued`, `queue_position`

RLS (migration `20260414…`, hardened in `20260415…`, tightened in `20260418100000…`):
- profiles: only owner can write (prevents `solana_wallet` hijack)
- overlay_elements: owner-only writes, public reads
- bookings INSERT (anon): `status='pending'` + server-managed columns (`payment_intent_id`, `original_amount_cents`, `started_at`, `approved_at`, `tx_signature`, `escrow_pda`) must all be NULL + `element_id` must resolve to an element owned by the claimed `profile_id`
- bookings UPDATE: split — `authenticated` owner (via `auth.uid() = profile_id`) can mutate anything; `anon` role restricted to legitimate viewer transitions (USING `status IN (pending, active, approved_queued)` / WITH CHECK `status IN (pending, denied, active, expired)`)
- Server routes use `SUPABASE_SERVICE_ROLE_KEY` and bypass RLS entirely

Storage: `beams` bucket, public read, anon insert, 5MB cap, image/* + video/{mp4,webm,quicktime}.

## Payment flows

**Stripe:** viewer → `authorize` → Checkout **on streamer's connected account** (Direct Charges, manual capture, zero platform fee) → webhook stores PI (passes `stripeAccount` on retrieve so Connect events resolve) → streamer approves → cron captures at natural end OR `end-early` prorates (beams/backdrops only). Cancel = void or refund based on PI status. Server re-reads authoritative price from `overlay_elements` before creating the session — viewer cannot tamper `amount`.

**Solana:** viewer connects wallet → preflight (SOL ≥ 0.01, USDC ≥ total) →
`initialize_flash` or `initialize_beam` on the casi-escrow program → full
amount locked in PDA-owned vault → attach `escrow_pda + tx_signature +
viewer_wallet` to DB → streamer calls `approve_flash` / `deny_flash`
(flashes) or viewer / streamer calls `settle_beam` (beams) → on-chain integer
proration pays the streamer 100% of the vested portion and refunds the
viewer the remainder. No platform fee is deducted on-chain. Post-duration
beam settlement is permissionless (liveness guarantee).

**Free:** viewer sends with `payment_method: 'free'` (flashes rate-limited
1/min via `free_flash_rate_limits` table) or books a slot whose
`price_value = 0`. No payment path; admin still approves.

## Environment variables

Public: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_CASI_PROGRAM_ID`

Server: `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `HELIUS_API_KEY`, `HELIUS_WEBHOOK_ID`, `HELIUS_WEBHOOK_SECRET`, `CRON_SECRET`

## Skins

`src/lib/skins.ts`: 6 presets (`casi-dark`, `void`, `neon`, `twitch`, `terminal`, `ember`, `chrome`) injected as CSS custom properties via `SkinProvider`. Streamer can override accent with custom hex.

## Recent commits (top of branch `claude/continue-casi-work-PvzRm`)

```
c09b252 ui(admin): split header into utility bar + main nav
e7d6e18 fix(anchor): default provider to Localnet, not Devnet
900071b chore: gitignore rust build artifacts (target/, Cargo.lock)
46fa5ab refactor(escrow): strip 5% platform fee — 100% viewer→streamer
44ac5ba docs: refresh SUMMARY handoff with security-audit commits
14d0e59 fix(security): tighten bookings RLS — lock INSERT columns, split UPDATE
480021e chore(web): update homepage platform-fee stat to 0%
c72b806 fix(security): timing-safe compare on Helius webhook secret
16df4bf refactor(stripe): switch to Connect Direct Charges with zero platform fee
bfedf96 fix(payments): close amount-tampering hole in booking checkout
```

Active themes: web-tier security audit hardening + on-chain fee stripped +
program live on devnet + admin header refactor + cron wired up. Fee-removal
fully shipped: `fee_wallet` account, `FEE_BPS` constant, `InvalidFeeWallet`
error all gone from `programs/casi-escrow/src/lib.rs`. Tests assert 100%
payout. Program `Dkai2s6Rwreyh51bajqLYMJdfHE6Gonwz9vFw6joUfRd` deployed to
devnet 2026-04-17; upgrade authority = `8TzUa1U5EEcWHBwbTDhNutyMj2NmTh2gsfcuvVYnGQUv`.

## Known gaps / loose ends

- **Stack-frame warnings** — `ApproveFlash` + `SettleBeam` context structs exceed BPF's 4KB stack by ~800–1000 bytes. Builds succeed, tests pass, but edge-case UB possible. Fix: `Box<InterfaceAccount<...>>` around the biggest fields.
- Solana defaults to **devnet** via `src/lib/solana-network.ts:NETWORK`. Flip to `'mainnet'` to switch USDC mint, wallet-adapter cluster, and Solscan cluster query in one line. Program must be re-deployed to mainnet (new program ID).
- Stripe currency hardcoded **EUR** (`stripe/authorize/route.ts`)
- `expire-bookings` and `auto-expire` Edge Functions exist but are not the active cron path (GitHub Actions `stripe-janitor` is)
- `/v`, `/setup`, `/join` pages orphaned; `bonk-ui-source/` checked in but unused (Privy remnants)
- Admin canvas (drag/resize) not optimised for touch
- Helius webhook uses single shared secret, no per-event signature
- Flash end-early proration not wired (flashes are one-shot tips by design; beams + backdrops have proration via `stripe/end-early`)

## Handoff to next session

Project state as of `c09b252` (2026-04-17, branch `claude/continue-casi-work-PvzRm`):
- Anchor program builds + tests pass on local validator.
- Program deployed to devnet at `Dkai2s6Rwreyh51bajqLYMJdfHE6Gonwz9vFw6joUfRd` (no-fee, 100% payout). Upgrade authority: `8TzUa1U5EEcWHBwbTDhNutyMj2NmTh2gsfcuvVYnGQUv`.
- `Anchor.toml` [provider] cluster is now `Localnet` — keeps `anchor test` off real devnet. ALWAYS verify this is `Localnet` before running tests.
- Stripe Janitor GHA green, runs every 5 min, pings `https://www.casi.gg/api/cron/stripe-janitor` with bearer token.
- Admin header split into utility bar (wallet pill + save status) + main nav — no overflow on narrow viewports.

### Next task: onboarding UX polish (roadmap item 2)

Audit surfaced 6 gaps in the streamer-signup-through-first-tip path. All changes are copy + small UI, no schema/migration work:

1. **"Your viewer link" card** at the top of `/admin` — show `https://www.casi.gg/overlay?s={username}` with one-click copy. Reduces "where do I send my viewers?" friction.
   - File: `src/app/admin/page.tsx` (add card just under the `.util-bar`)

2. **"Send test Flash" button** — free-tier self-send so streamers see the overlay animation before any viewer arrives. Hits existing `POST /api/flashes/create` with `payment_method: 'free'`.
   - File: `src/app/admin/page.tsx` (button next to the new viewer-link card)

3. **Terminology sweep** — "rent your slots" is opaque. Replace with "let viewers tip to display an image/video in this slot" in hover tooltips + empty-states on the admin canvas.
   - Files: `src/app/admin/page.tsx`, `src/app/overlay/page.tsx`

4. **OBS help panel** — collapsible `<details>` in admin Settings tab with the exact browser-source URL (`https://www.casi.gg/obs?s={username}&layer=beams`), recommended dimensions (1920×1080), and "refresh cache" note. Currently streamers have to guess.
   - File: `src/app/admin/page.tsx` (Settings tab area)

5. **Payment method hints** on `/profile/edit` — two lines next to each payment section:
   - Stripe: "Accept card tips (EUR). Stripe takes ~2.9% + €0.25 per tip — CASI takes 0%."
   - Solana: "Accept USDC tips on Solana. Near-zero fees, paid out on-chain instantly. CASI takes 0%."
   - File: `src/app/profile/edit/page.tsx`

6. **Beam-vs-Flash explainer** — inline banner on first admin load explaining the three surfaces (Flash = one-shot popup, Beam = timed display, Backdrop = background takeover). Dismissable via `localStorage`.
   - File: `src/app/admin/page.tsx` (top banner, conditional on `!localStorage.getItem('casi-onboarding-seen')`)

Scope is intentionally copy/UI only — no new routes, no schema changes, no payment-flow edits. Estimate: one focused session.

### Common pitfalls we hit (don't repeat):
1. **Branch drift is the #1 footgun.** User's deploy box pulled from a stale branch twice this session, deploying fee code to devnet and burning ~2.5 SOL. ALWAYS run the verification block at the top of this file before deploying.
2. **`anchor test` reads `[provider] cluster` from `Anchor.toml`.** If set to `Devnet`, tests burn real SOL. Current value is `Localnet` — leave it that way. Use `--provider.cluster devnet` as an explicit CLI override only for actual deploys.
3. **`scripts/sync-program-id.mjs` mutates `Anchor.toml` and `lib.rs`.** Re-run after every pull that touches those files. `git checkout -- <file>` reverts local edits before pulling.
4. **Apex `casi.gg` 307-redirects to `www.casi.gg`.** Server-to-server callers (GitHub Actions, webhooks) MUST use the `www.` form — `curl -L` strips `Authorization` across the host change. GitHub `APP_URL` secret = `https://www.casi.gg`.
5. **`CRON_SECRET` must match between GitHub Secrets and Vercel env (all three scopes: Production/Preview/Development).** A mismatch returns 401 and the janitor workflow goes red.
6. **Anchor 0.30.1 incompatible with Rust ≥1.87** (`proc_macro2::Span::source_file()` removed). Stay on 0.31.1. Do NOT pin Rust to 1.79 — dependency tree now needs edition2024 (1.85+).
7. **Placeholder pubkeys** in `Anchor.toml`/`lib.rs` must be valid base58 (exclude `0`, `O`, `I`, `l`). Canonical dev placeholder is `11111111111111111111111111111111` (System Program).
8. **`@coral-xyz/anchor` is CJS.** Under ts-mocha ESM loader, named imports (`import { BN }`) fail. Use `import BN from "bn.js"` directly.
9. **Dead program IDs** (closed via `solana program close`, cannot redeploy): `78bw5wjc3hdLYxf5kcMX1eSAvbtPyjvcYo2GZsJyzvYo`, `DqpeEBpVpPpEVNStq3iUgS6a4jFSsGpkusxYf1rrxTkC`. Current live: `Dkai2s6Rwreyh51bajqLYMJdfHE6Gonwz9vFw6joUfRd`.

## Useful file paths

| Purpose | Path |
|---|---|
| Streamer dashboard | `src/app/admin/page.tsx` |
| Viewer booking UI | `src/app/overlay/page.tsx` |
| OBS source | `src/app/obs/page.tsx` |
| Stripe lib | `src/lib/stripe.ts` |
| Helius lib | `src/lib/helius.ts` |
| Skins | `src/lib/skins.ts` |
| Cron workflow | `.github/workflows/stripe-janitor.yml` |
| CSP headers | `next.config.ts` |
| Anchor program | `programs/casi-escrow/src/lib.rs` |
| TS escrow client | `src/lib/casi-escrow.ts` |
| Payment abstraction | `src/lib/payment-manager.ts` |
| Network switch | `src/lib/solana-network.ts` |
| Anchor tests | `tests/casi-escrow.ts` |
| Program README | `programs/casi-escrow/README.md` |
| Resurrection plan | `ESCROW_PLAN.md` (phase tracker) |
| SIWS notes | `docs/solana_identity.txt` |
| Helius notes | `docs/helius_webhooks.txt` |

