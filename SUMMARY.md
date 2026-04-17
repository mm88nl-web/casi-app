# CASI — Project Summary

Snapshot for picking up across chat sessions. Reflects the repo at branch
`claude/casi-project-summary-zJfeU` (merged `VTbAu` + cherry-picked `b4969b2`).

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
- `stripe/authorize` — create Checkout session (manual capture, 5% application_fee, transfer to Connect account)
- `stripe/webhook` — persist `payment_intent_id` on `checkout.session.completed`
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

RLS (migration `20260414…`, hardened in `20260415…`):
- profiles: only owner can write (prevents `solana_wallet` hijack)
- overlay_elements: owner-only writes, public reads
- bookings: anon INSERT must have `status='pending'`; UPDATE allowed if `auth.uid IS NULL OR auth.uid = profile_id` (so viewers can cancel their own)

Storage: `beams` bucket, public read, anon insert, 5MB cap, image/* + video/{mp4,webm,quicktime}.

## Payment flows

**Stripe:** viewer → `authorize` → Checkout (manual capture) → webhook stores PI → streamer approves → cron captures at natural end OR `end-early` prorates (beams/backdrops only). Cancel = void or refund based on PI status.

**Solana:** viewer connects wallet → preflight (SOL ≥ 0.01, USDC ≥ total) →
`initialize_flash` or `initialize_beam` on the casi-escrow program → full
amount locked in PDA-owned vault (5% fee deducted on-chain at settlement, no
separate fee transfer) → attach `escrow_pda + tx_signature + viewer_wallet`
to DB → streamer calls `approve_flash` / `deny_flash` (flashes) or viewer /
streamer calls `settle_beam` (beams) → on-chain integer proration pays the
streamer (95%) and refunds the viewer (5% to treasury). Post-duration beam
settlement is permissionless (liveness guarantee).

**Free:** viewer sends with `payment_method: 'free'` (flashes rate-limited
1/min via `free_flash_rate_limits` table) or books a slot whose
`price_value = 0`. No payment path; admin still approves.

## Environment variables

Public: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_CASI_FEE_WALLET`

Server: `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `HELIUS_API_KEY`, `HELIUS_WEBHOOK_ID`, `HELIUS_WEBHOOK_SECRET`, `CRON_SECRET`

## Skins

`src/lib/skins.ts`: 6 presets (`casi-dark`, `void`, `neon`, `twitch`, `terminal`, `ember`, `chrome`) injected as CSS custom properties via `SkinProvider`. Streamer can override accent with custom hex.

## Recent commits (top of branch)

```
d284786 fix(tests): import BN directly from bn.js
50f20fe fix(tests): use System Program ID for FEE_WALLET placeholder
c24bf04 fix(tests): use anchor.BN alias instead of named import
741a71f chore(escrow): upgrade anchor 0.30.1 → 0.31.1
50952c8 chore(escrow): bump rust pin to 1.86 — edition2024 needs 1.85+
1262c05 fix(escrow): add idl-build feature for anchor IDL generation
2b58fac fix(escrow): mark DenyFlash.streamer mutable (payer for init_if_needed)
a655ee8 fix(escrow): use token_2022 feature instead of nonexistent token_interface
35f8266 fix(escrow): valid-base58 placeholders so anchor build doesn't crash pre-sync
661d828 chore: purge residual Streamflow references
```

Active themes: Solana stabilisation (done — 19/19 tests passing), devnet deploy pending on faucet recovery, then end-to-end smoke test.

## Known gaps / loose ends

- **Devnet deploy pending** — `anchor test --provider.cluster localnet` passes 19/19, but devnet deploy is blocked on faucet availability (all public devnet faucets dry as of 2026-04-17). Once SOL is available: `./scripts/setup-devnet.sh` runs the full pipeline. Program keypair already generated at `target/deploy/casi_escrow-keypair.json` (pubkey `5WtNmRzjpoY5g1eTAgv6FuR3n6bdYmd6pKjbkRAYKCQs`).
- **Stack-frame warnings** — `ApproveFlash` + `SettleBeam` context structs exceed BPF's 4KB stack by ~800–1000 bytes. Builds succeed, tests pass, but edge-case UB possible. Fix: `Box<InterfaceAccount<...>>` around the biggest fields.
- Solana defaults to **devnet** via `src/lib/solana-network.ts:NETWORK`. Flip to `'mainnet'` to switch USDC mint, wallet-adapter cluster, and Solscan cluster query in one line. Program must be re-deployed to mainnet (new program ID); also replace `fee_wallet::ID` placeholder (`11111111111111111111111111111111`) with the real treasury pubkey in `lib.rs:39`.
- Stripe currency hardcoded **EUR** (`stripe/authorize/route.ts`)
- `expire-bookings` and `auto-expire` Edge Functions exist but are not the active cron path (GitHub Actions `stripe-janitor` is)
- `/v`, `/setup`, `/join` pages orphaned; `bonk-ui-source/` checked in but unused (Privy remnants)
- Admin canvas (drag/resize) not optimised for touch
- Helius webhook uses single shared secret, no per-event signature
- Flash end-early proration not wired (flashes are one-shot tips by design; beams + backdrops have proration via `stripe/end-early`)

## Handoff to next session

Project state as of `d284786` (2026-04-17):
- Anchor program builds + **all 19 tests pass** on local validator.
- Toolchain pinned: Rust 1.86 (`rust-toolchain.toml`), Anchor 0.31.1 (`Anchor.toml`, `scripts/setup-devnet.sh`).
- `scripts/setup-devnet.sh --skip-airdrop --skip-deploy` builds + tests end-to-end on a clean machine.
- **Next logical step: devnet deploy** once faucets recover, then end-to-end smoke test `/overlay` → `/admin` with a devnet wallet. After that: mainnet prep (see "Mainnet prep" below).
- Branch history is clean. 6 `archive/*` branches on the remote preserve every commit from the 10 pre-merge dead branches.

Common pitfalls we hit (don't repeat):
1. Anchor 0.30.1 is incompatible with Rust ≥1.87 (`proc_macro2::Span::source_file()` removed). Do NOT try to pin Rust to 1.79 — dependency tree now needs edition2024 (1.85+). Stay on 0.31.1.
2. `sync-program-id.mjs` mutates `Anchor.toml` and `lib.rs` — re-run after every pull that touches those files. `git checkout -- <file>` reverts the local edits before pulling.
3. Placeholder pubkeys in `Anchor.toml`/`lib.rs` must be valid base58 (exclude `0`, `O`, `I`, `l`). The canonical dev placeholder is `11111111111111111111111111111111` (System Program).
4. `anchor test` reads `[provider] cluster` — use `--provider.cluster localnet` override or tests try to deploy to devnet and fail.
5. `@coral-xyz/anchor` is CJS; under ts-mocha ESM loader, named imports (`import { BN }`) fail. Use `import BN from "bn.js"` directly.

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

