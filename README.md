# CASI

A streamer monetization platform with three earn-surfaces — **flashes** (paid
chat), **beams** (time-rented slot overlays), and **backdrops** (full-frame
rentals) — each payable via Stripe (manual-capture + prorated refund), Solana
USDC (via the in-house [casi-escrow](./programs/casi-escrow/README.md) Anchor
program), or a free tier gated by the streamer.

The Anchor program is Apache-2.0 and designed to be reusable by any Solana
project that needs trust-minimised escrow with linear vesting and anti-grief
settlement guarantees. See
[`programs/casi-escrow/README.md`](./programs/casi-escrow/README.md) for the
on-chain design, audit scope, test coverage, and error codes.

## Quick links

- Live (devnet): https://casi.gg
- Anchor program: [`programs/casi-escrow/`](./programs/casi-escrow/) — design notes in [`PRIMITIVE.md`](./programs/casi-escrow/PRIMITIVE.md) and [`FEE_MODEL.md`](./programs/casi-escrow/FEE_MODEL.md)
- License: [`Apache-2.0`](./LICENSE)

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind · Supabase (Postgres + RLS + Realtime) · Stripe Connect · Anchor 0.30 · Solana web3.js · Helius webhooks · Vercel.

## Repo layout

```
src/app/                 Next.js routes (overlay, admin, studio, s/[username])
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
npm test             # unit tests (ts-mocha)
npm run lint
npx tsc --noEmit
```

Anchor program:

```bash
cd programs/casi-escrow
anchor build
anchor test
```

## Status

The web app and Anchor program are running on Solana devnet. Mainnet launch is gated on an external audit currently being scoped.

## License

Apache-2.0. See [`LICENSE`](./LICENSE).
