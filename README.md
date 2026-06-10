# casi

Streamer monetisation platform. Viewers pay to put their image, video, or message on a live stream as an overlay — for a fixed duration, with a guaranteed refund if anything goes wrong.

[![CI](https://github.com/mm88nl-web/casi-app/actions/workflows/ci.yml/badge.svg)](https://github.com/mm88nl-web/casi-app/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE)

**Live at [casi.gg](https://www.casi.gg)** — Stripe rail on mainnet (EUR/USD/GBP/+), Solana USDC on devnet pending audit.

---

## What it does

Streamers run OBS with a CASI browser-source URL. Viewers book a slot on the streamer's overlay, upload media, and pay. The streamer approves; the content appears on stream for the booked duration; payment settles pro-rata when the timer ends. 100% of every booking flows direct viewer → streamer — CASI takes no cut.

**Three earn surfaces:**

| Surface | Duration | Use case |
|---------|----------|----------|
| **Flash** | One-shot | Tips, shoutouts, fan messages |
| **Beam** | 1–60 min, prorated | Sponsored banners, ad placements |
| **Backdrop** | 1–60 min, prorated | Full-frame branded backgrounds |

**Two payment rails:**

- **Stripe Connect** — credit / debit card. Direct Charges land on the streamer's connected account. Multi-currency (EUR, USD, GBP, AUD, CAD, BRL, JPY, SGD).
- **Solana USDC** — on-chain escrow via `casi-escrow` (Apache-2.0 Anchor program). Viewer locks USDC in a PDA vault; either party can settle early with pro-rata split; permissionless liveness cranks after duration.

---

## Tech stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind
- **Backend**: Next.js Route Handlers, Supabase (Postgres + RLS + Realtime + Storage), Vercel
- **Payments**: Stripe Connect (manual-capture PaymentIntents) + Solana Wallet Adapter + `casi-escrow` Anchor program
- **Webhooks**: Helius (Solana on-chain events), Stripe Connect + platform webhooks
- **Tests**: `ts-mocha` — `npm test`

---

## Running locally

```bash
# Install deps
npm install

# Copy and fill in environment variables
cp .env.example .env.local   # or set them directly

# Start dev server
npm run dev

# Type check
npx tsc --noEmit

# Run tests
npm test

# Lint
npm run lint
```

**Required env vars**: see `AGENTS.md → Environment variables` for the full list. At minimum you need `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, and `NEXT_PUBLIC_CASI_PROGRAM_ID`.

---

## Repo layout

```
src/app/
  overlay/          OBS browser-source + viewer booking flow
  studio/           Streamer dashboard (earnings, queue, live canvas)
  admin/            Legacy streamer dashboard
  s/[username]/     Public streamer landing page
  login/            Auth — email + 4 OAuth providers
  api/              Route Handlers (bookings, stripe, solana, flashes, cron)
src/lib/
  casi-escrow.ts    Anchor client wrapper
  streamer-moderation.ts  Single source of truth for approve/deny/settle
  currency.ts       Fiat config (symbols, decimals, Stripe min amounts)
  payment-math.ts   Pro-rata capture math
programs/casi-escrow/   Anchor program source (Rust)
supabase/migrations/    SQL migrations
tests/unit/             Unit tests
```

---

## On-chain program

`casi-escrow` is an Apache-2.0 Anchor program for time-vested USDC escrow. It's designed to be reusable beyond CASI — any use case that needs "pay now, time-based service, fair pro-rata on early exit, guaranteed liveness" can integrate it.

- Program source: [`programs/casi-escrow/`](./programs/casi-escrow/)
- Program README: [`programs/casi-escrow/README.md`](./programs/casi-escrow/README.md)
- Current deploy: Solana **devnet**, pending external audit before mainnet

---

## Security

Found a vulnerability? See [SECURITY.md](./SECURITY.md) — please report privately, do not open a public issue.

---

## License

[Apache 2.0](./LICENSE)
