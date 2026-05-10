# CASI — Project Summary

Snapshot for picking up across chat sessions. Reflects `origin/main` as of
2026-04-30 (with PR #59 still open against main). Working branch:
`claude/fix-ui-issues-G4Dnn` (PR #59 — studio dashboard polish).

> ⚠️ **READ THIS FIRST** — branch drift was the #1 footgun in earlier
> sessions (see Common Pitfalls below). Before doing anything else:
> ```
> cd ~/casi-app
> git fetch origin
> git checkout claude/fix-ui-issues-G4Dnn   # OR whatever branch is active
> git pull
> git branch --show-current    # confirm match
> grep -c 'pub mod fee_wallet' programs/casi-escrow/src/lib.rs   # must be 0
> grep cluster Anchor.toml      # must say "Localnet"
> ```
> If any of those don't match, stop and fix before writing or deploying.

## Current state (2026-04-29)

- **Repository visibility**: PUBLIC on GitHub, Apache-2.0 license set on the repo metadata. Founder: Matthew Melendez (`mm88nl@gmail.com`), Netherlands.
- **Anchor program deployed to devnet**: `Dkai2s6Rwreyh51bajqLYMJdfHE6Gonwz9vFw6joUfRd` (no-fee, 100% viewer→streamer payout). **Frozen pre-audit** — bug fixes only.
- **Dead program IDs on devnet** (do not redeploy to these — permanently retired via `solana program close`):
  - `78bw5wjc3hdLYxf5kcMX1eSAvbtPyjvcYo2GZsJyzvYo` (deployed from wrong branch with fee code)
  - `DqpeEBpVpPpEVNStq3iUgS6a4jFSsGpkusxYf1rrxTkC` (same)
- **Deploy wallet**: `8TzUa1U5EEcWHBwbTDhNutyMj2NmTh2gsfcuvVYnGQUv` (upgrade authority)
- **Production URL**: `https://www.casi.gg` (apex `casi.gg` → 307 redirects; always use the `www.` form in server-to-server calls). Live on Solana **devnet** with test USDC; banner in app reads "DEV PREVIEW · RUNNING ON SOLANA DEVNET · NO REAL FUNDS INVOLVED · SMART CONTRACT AUDIT IN PROGRESS."
- **v7 design system shipped** (Phases 0–7, commits `7c3a60f` through `59f96f5`). Default skin: Casi Dark, accent `#0DCFB0` (teal) + accent2 `#9945FF` (Solana purple). Old skins (Void, Neon, Terminal, Ember, Chrome) are gone. New 7 skins: `casi-dark`, `twitch`, `kick`, `youtube`, `cyber`, `mono`, `rose`.
- **Studio split**: `/studio` (dashboard) + `/studio/live` (canvas editor) since Phase 4. `/studio/settings` is now the canonical settings home.
- **Auth on `/login`**: email/password + four OAuth providers — **Google** (working), **Twitch / Discord / X** (code shipped commit `f52366f`, **need Supabase Dashboard configuration** with each provider's client id + secret before buttons succeed). Callback at `src/app/auth/callback/route.ts`.
- **Stripe Janitor GHA**: green, runs every 5 min, hits `https://www.casi.gg/api/cron/stripe-janitor`.
- **Cranker**: `SOLANA_CRANKER_KEYPAIR` env required for delegated approve/settle UX. Daily monitor at `/api/cron/cranker-monitor` warns at 0.005 SOL, errors at 0.001 SOL.

## Solana Foundation grant — IN FLIGHT

- **Working draft**: [`grant-answers.md`](./grant-answers.md) at repo root. All identity fields filled (Matthew Melendez, mm88nl@gmail.com, Netherlands). Honest non-technical-founder framing in the "Why You" section.
- **Two TODOs remain**, both blocked on audit-firm replies: the audit firm name and the quoted amount in Milestone 1.
- **Ask**: $25,000 USD, structured as audit + remediation contractor ($18k) + SDK contractor ($5k) + public cranker + design note ($2k). All deliverables Apache-2.0.
- **Framing**: the grant funds the `casi-escrow` Anchor program as a **reusable time-vested USDC escrow primitive** (developer tooling category). CASI the consumer product is the *reference integration*, not the deliverable. CASI sustains itself separately via streamer SaaS.
- **Audit firm outreach**: contacted **Sec3** (Jack Tsai replied with their process — 5-stage flow including code review + 2 auditors + recheck), **OtterSec**, and **Neodyme**. Awaiting written quotes (5–7 day turnaround typical). Realistic range for ~1.2k LOC Anchor program: $15–25k. Sec3 contact: `jack@sec3.dev` / Telegram `vibes8760`.
- **Next milestone for the grant**: when the first acceptable quote lands, fill the two TODOs in `grant-answers.md` and submit the Solana Foundation grant form.

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

`src/lib/skins.ts`: 7 v7 presets — `casi-dark` (default, teal `#0DCFB0` + Solana purple `#9945FF`), `twitch`, `kick`, `youtube`, `cyber`, `mono`, `rose`. Each declares `accent`, `accent2`, `bg`, `surface`, `border`, `text`, `textMuted` plus RGB-channel duplicates for `rgba()`. Injected as CSS custom properties via two providers:

- **`UserSkinProvider`** (`src/components/UserSkinProvider.tsx`) — the logged-in streamer's own pages (`/admin`, `/studio`).
- **`SkinProvider`** (`src/components/SkinProvider.tsx`) — viewer-facing pages scoped to a streamer (`/overlay?s=username`, `/s/username`).

Per-streamer overrides on `profiles`:
- `profiles.skin` → picks one of the 7 ids. Defaults to `casi-dark`.
- `profiles.theme_color` → optional custom accent hex that overrides the skin's accent. NULL = use the skin default.

Picker UI in `src/app/admin/settings/_components/AppearanceSection.tsx` (also surfaced from `/studio/settings`). Common confusion: when a streamer says "the colors look wrong," check `profiles.theme_color` first — they probably picked Gold or another preset.

## Recent commits

**On branch `claude/fix-ui-issues-G4Dnn` (PR #59, open against main):**

```
1b83317 Approval queue: payment-gate Approve + click-to-preview modal
f9cb8bf Airing row: fix float precision in timer + vested-amount decimals
d889d37 Show live vested-amount on each Airing row
7a85638 Wrap StudioPage in Suspense for useSearchParams build
5778de1 Studio dashboard: per-slot queue, currency setting, End Stream confirm
```

**`origin/main` head (as of 2026-04-30, before PR #59 lands):**

```
bd97cdd Merge pull request #58 (grant docs handoff)
ae4112c Fill in identity placeholders in grant draft
f52366f Add Twitch / Discord / X OAuth to /login
e7bce6f Merge PR #56 — share HTML file
8617a74 Studio + booking polish from streamshot review
59f96f5 Phase 7: auth — v7 token migration of /login
a083e5f Phase 6: viewer surfaces — /overlay restyle + /s/[username] v7 venue header
c0e3b77 Phase 5: /studio/settings + share section components
8a101e0 Phase 4: studio split — /studio (dashboard) + /studio/live (editor)
b22684a Phase 3: landing — v7 split-door hero, trust band, footer
46fa5ab refactor(escrow): strip 5% platform fee — 100% viewer→streamer
```

Active themes: v7 design system shipped; studio dashboard heavily polished in PR #59 (per-slot queue + Play Now, End Stream confirm + delegate-driven shutdown, payment-gate, click-to-preview, live vested-amount, currency picker); auth expanded to Google + Twitch + Discord + X (code shipped, dashboard config pending for non-Google providers); grant proposal in flight with audit-firm outreach open; repo public + Apache-2.0 + SECURITY.md + CI badge. Fee-removal stayed in: `fee_wallet` account, `FEE_BPS` constant, `InvalidFeeWallet` error all gone from `programs/casi-escrow/src/lib.rs`. Program `Dkai2s6Rwreyh51bajqLYMJdfHE6Gonwz9vFw6joUfRd` still on devnet pending external audit.

## Known gaps / loose ends

**Code-level:**
- **Stack-frame warnings** — `ApproveFlash` + `SettleBeam` context structs exceed BPF's 4KB stack by ~800–1000 bytes. Builds succeed, tests pass, but edge-case UB possible. Fix: `Box<InterfaceAccount<...>>` around the biggest fields.
- Solana defaults to **devnet** via `src/lib/solana-network.ts:NETWORK`. Flip to `'mainnet'` to switch USDC mint, wallet-adapter cluster, and Solscan cluster query in one line. Program must be re-deployed to mainnet (new program ID).
- Stripe currency hardcoded **EUR** (`stripe/authorize/route.ts`) — `profiles.display_currency` only affects dashboard tile rendering, not the charge currency.
- `expire-bookings` and `auto-expire` Edge Functions exist but are not the active cron path (GitHub Actions `stripe-janitor` is)
- `/v`, `/setup`, `/join` pages orphaned; `bonk-ui-source/` checked in but unused (Privy remnants)
- Admin canvas (drag/resize) not optimised for touch
- Helius webhook uses single shared secret, no per-event signature
- Flash end-early proration not wired (flashes are one-shot tips by design; beams + backdrops have proration via `stripe/end-early`)
- Per-IP rate-limit only on booking-creation routes — proxy pool bypasses. Add per-`profile_id` rate limit alongside per-IP.
- Slot-shape rendering asymmetry — editor clamps circle/hex slots to a pixel-square via `min(width%·W, height%·H)`; overlay uses straight `width%×height%`. New rows save in 9/16 ratio so they match, but legacy rows can drift. Diagnostic: `select id, shape, width, height, round(height::numeric * 9 / 16, 2) as expected from overlay_elements where shape in ('circle', 'hex') and abs(width - height * 9.0 / 16.0) > 0.5;`. If non-empty, normalize via `update overlay_elements set width = round(height::numeric * 9 / 16, 2) where shape in ('circle', 'hex');`.

**Compliance / product gaps (pre-mainnet checklist):**
- **No custom SMTP wired in code.** Verification + password-reset emails use Supabase's default sender; deliverability is poor. Configure Resend/Postmark + SPF/DKIM/DMARC on `casi.gg` in the Supabase Dashboard before mainnet.
- **No onboarding email drip.** Streamer signs up → verification → silence. Activation is going to suffer post-mainnet. Loops / Customer.io / Resend-with-Supabase-trigger all viable; 3-email sequence is the minimum (Day 0 / Day 2 / Day 7).
- **No imprint + cookie banner.** Founder is in Netherlands; Dutch law + GDPR require both. `/legal/privacy` exists but lists only email contacts (no company name / KvK / address). Auth uses cookies — even essential-only requires a disclosure.
- **No demo video / screenshot on landing.** `LandingSplitDoor` is interactive but text-only. Single highest-leverage marketing fix when the product is polished enough for it.

## Handoff to next session

Project state as of 2026-04-29:
- Anchor program builds + tests pass on local validator. Frozen pre-audit (bug fixes only).
- Program deployed to devnet at `Dkai2s6Rwreyh51bajqLYMJdfHE6Gonwz9vFw6joUfRd` (no-fee, 100% payout). Upgrade authority: `8TzUa1U5EEcWHBwbTDhNutyMj2NmTh2gsfcuvVYnGQUv`.
- `Anchor.toml` [provider] cluster is `Localnet` — keeps `anchor test` off real devnet. ALWAYS verify this is `Localnet` before running tests.
- Stripe Janitor GHA green.
- v7 design system shipped on main (Phases 0–7); studio split into dashboard + live; `/login` has Google + Twitch + Discord + X (Twitch/Discord/X buttons need provider config in Supabase Dashboard before they work).
- Repo public, Apache-2.0, SECURITY.md present, README cleaned up, CI badge in README.
- Solana Foundation grant draft in `grant-answers.md` with two TODOs left (audit firm name + quote $).

### Next task: merge PR #59, then wait on audit + ship compliance fixes

1. **Merge PR #59** ([github.com/mm88nl-web/casi-app/pull/59](https://github.com/mm88nl-web/casi-app/pull/59)). Branch `claude/fix-ui-issues-G4Dnn` is `mergeable_state: clean`, all 5 commits pushed. Migration `20260502000000_profile_display_currency.sql` already applied in Supabase Dashboard. Per repo convention (#56-58), use a merge commit not squash.
2. **Audit firms reply with quotes** (Sec3 / OtterSec / Neodyme — outreach sent, 5–7 day SLA typical). When the first acceptable quote lands, fill the two TODOs in `grant-answers.md` and submit the Solana Foundation grant form.
3. **Configure custom SMTP in Supabase Dashboard.** Auth → SMTP Settings → Resend or Postmark with verified `casi.gg` domain + SPF/DKIM/DMARC. Test with mail-tester.com. ~30 min, biggest deliverability lift.
4. **Configure Twitch / Discord / X OAuth in Supabase Dashboard** — the buttons exist on `/login` but currently throw "provider is not enabled" until each provider's client id + secret is pasted in. Rough flow: register an app on the provider dev portal → set OAuth callback URL to `https://<supabase-project-ref>.supabase.co/auth/v1/callback` → paste credentials into Supabase Dashboard → Authentication → Providers. **Note**: X/Twitter is the painful one; expect phone-number friction and possibly a paid tier requirement.
5. **Add imprint + cookie banner.** Dutch law + GDPR require both. Imprint on `/legal/imprint` or in the landing footer with company name (or sole-proprietorship), KvK/registration number if any, Netherlands address, contact email. Cookie banner can be minimal essential-only acknowledgement.
6. **Don't ship new product features pre-mainnet.** Pro-tier streamer SaaS is the planned monetization (custom branding, auto-approve rules, team accounts, analytics — Streamlabs Ultra-style $10–30/mo). Intentionally premature; first build the audited mainnet primitive + onboard a closed-beta cohort of streamers, then layer SaaS on top.

### Marketing posture (pre-mainnet)

**Post now (forgiving Solana audiences):** Solana Discord servers (Superteam, Foundation, Solana Mobile, Helius), r/solana, Indie Hackers, Solana-Twitter. Lead with the open-source escrow primitive + audit-pending + Apache-2.0; CASI-the-product is the reference integration.

**Wait for mainnet + audit + demo video:** Hacker News (Show HN), Product Hunt, r/Twitch, r/Streamers, r/CryptoCurrency. These crowds judge against polished SaaS + are unforgiving of devnet bugs.

### Competitive landscape (for context)

Closest mechanical: **Streamlabs Media Share** + **StreamElements Media Share** + **Tangia** — viewers tip to play YouTube/TikTok clips on stream, ~10¢/sec. Different mechanic (clip-only, no upload, no time-vested escrow). Closest crypto-native: **stream.gift** (Solana donations on Twitch), **StreamerCoin** (token model), **Blurt** (Dialect blinks). Closest pattern: **Sollinked** ($30k Hyperdrive winner, paid-email USDC escrow — proves the category is fundable; CASI extends it to live video with time-vesting). None of the competitors are open source under permissive licenses. CASI's defensible niche: high-stakes paid takeovers + open-source primitive + 0% take rate.

### What NOT to do (carried forward — earned the hard way)

- **Don't add a protocol fee on either rail.** 100% direct viewer→streamer is load-bearing for the regulatory posture (software, not payments) and the grant story. If you think a take rate makes sense, talk to the founder first — there are cleaner ways to monetize that don't require touching funds.
- **Don't refactor the Anchor program before the audit.** It's frozen. Bug fixes only, with a test demonstrating the bug.
- **Don't add an OAuth provider in code without enabling it in the Supabase Dashboard.** Buttons render but throw on click.
- **Don't hardcode brand colors.** Use the `var(--accent)` / `var(--accent2)` tokens; per-streamer overrides come from `profiles.theme_color`.

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

