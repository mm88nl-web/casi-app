# CASI

[![CI](https://github.com/mm88nl-web/casi-app/actions/workflows/ci.yml/badge.svg)](https://github.com/mm88nl-web/casi-app/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)

Pay-per-minute streamer overlays on Solana. Viewers pay to place an image,
video, or banner on a streamer's broadcast for N minutes. Payment is held in
on-chain USDC escrow that vests in real time, so if the streamer ends a beam
early the unvested portion auto-refunds to the viewer. The protocol takes
zero. 100% goes to the streamer.

Three booking surfaces, all rendering through one OBS browser source:

- **Beams** — time-rented shaped slots (hex, circle, rect, banner). Viewers
  pay per minute, the streamer approves once, the slot lights up on stream.
- **Flashes** — 15-second paid pop-ups. Like a paid superchat that lives on
  the stream itself, not under it.
- **Backdrops** — full-bleed sponsor skin. The most premium surface.

Two payment rails:

- **Stripe Connect Direct Charges** for fiat. 100% lands on the streamer's
  connected account. No application fee.
- **Solana USDC** for crypto. The
  [`casi-escrow`](./programs/casi-escrow/README.md) Anchor program is the
  reusable building block: 4 user-facing instructions, time-vested
  settlement, permissionless liveness backstops. Apache-2.0. Fork it.

## Quick links

- Live (devnet): https://casi.gg
- Builders / primitive story: https://casi.gg/builders
- Anchor program: [`programs/casi-escrow/`](./programs/casi-escrow/) (design
  notes in [`PRIMITIVE.md`](./programs/casi-escrow/PRIMITIVE.md) and
  [`FEE_MODEL.md`](./programs/casi-escrow/FEE_MODEL.md))
- License: [`Apache-2.0`](./LICENSE)

## Tech stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind, Supabase (Postgres
+ RLS + Realtime), Stripe Connect, Anchor 0.30, Solana web3.js, Helius
webhooks, Cloudflare Turnstile, Vercel.

## Repo layout

```
src/app/                 Next.js routes
  /                      landing
  /builders              primitive story for technical visitors
  /studio                streamer dashboard + canvas editor
  /overlay               viewer booking surface
  /obs                   chrome-less OBS browser source (transparent)
  /s/[username]          public streamer landing
  /search                browse live streamers
  /login                 auth + 3-step signup (email + 4 OAuth providers)
src/app/api/             route handlers (bookings, stripe, solana, cron)
src/lib/                 shared modules (escrow client, moderation, observability)
programs/casi-escrow/    Anchor program (Rust, Apache-2.0)
supabase/migrations/     Postgres schema + RLS migrations
tests/unit/              ts-mocha unit tests
```

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 58 unit assertions, ~13ms
npm run lint
npx tsc --noEmit
```

Anchor program:

```bash
cd programs/casi-escrow
anchor build
anchor test
```

See [`.env.example`](./.env.example) for the env vars you'll need locally.
Most flows degrade gracefully on missing config (e.g. unset
`TURNSTILE_SECRET_KEY` skips CAPTCHA verification in dev).

## Status

Solana devnet. The web app is live at https://casi.gg. The `casi-escrow`
program is feature-complete with comprehensive integration tests. External
audit is being scoped with Sec3, OtterSec, and Neodyme. Mainnet launch is
planned via a capped-launch design that bounds blast radius while audit and
remediation complete. See
[`capped-mainnet-plan.md`](./capped-mainnet-plan.md).

## Building this

CASI is built by [Matthew Melendez](https://github.com/mm88nl-web) (NL),
solo, non-technical, shipping the entire stack with Claude Code as a coding
pair. Started mid-April 2026. Issues and PRs welcome. See
[`AGENTS.md`](./AGENTS.md) for the codebase orientation that any new
contributor (human or AI) should read first.

## License

Apache-2.0. See [`LICENSE`](./LICENSE). The Anchor program, the SDK, and
the web app are all under the same permissive license. Fork freely.
