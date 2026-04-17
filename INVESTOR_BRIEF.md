# CASI — Investor Brief

*Last updated 2026-04-17.*

## One-liner

CASI is a streamer monetization platform where viewers pay to place things
on-stream — text flashes, branded beams, or full-frame backdrops — via credit
card, crypto, or a free tier the streamer controls.

## The problem

Streamers on Twitch, Kick, and YouTube Live rely on **tips** (one-way, no
confirmation) and **donations** (same, with a message). Paid overlays —
sponsored banners, branded backgrounds, time-limited promos — are handled
ad-hoc through Discord DMs, PayPal invoices, and manual overlay edits. The
streamer has to:

1. Trust a stranger to pay after the overlay goes up (no escrow).
2. Screenshot / refund manually if anything goes wrong.
3. Take 100% of the fraud risk (chargebacks, wrong amounts, disputes).

There is no integrated product that offers **in-stream paid placement** with
**programmatic escrow + approval**, across both fiat and crypto.

## What CASI is

**Three earn-surfaces, three payment rails, one dashboard.**

|              | **Flash**                    | **Beam**                       | **Backdrop**                      |
|--------------|------------------------------|--------------------------------|-----------------------------------|
| What it is   | Paid chat message + image    | Time-rented overlay slot       | Full-frame branded background     |
| Duration     | One-shot (streamer approves) | 1–60 min, prorated on exit     | 1–60 min, prorated on exit        |
| Use case     | Tips, shoutouts, fan messages| Sponsored banner, ad placement | Branded backgrounds, promos       |

Each surface is payable via:

- **Stripe** — credit card, manual-capture + Connect transfer, EUR.
- **Solana USDC** — on-chain escrow via the in-house `casi-escrow` Anchor program.
- **Free** — rate-limited; streamer approves all.

Streamers approve/deny flashes and prorate-end beams from a single dashboard.
Revenue split is **95% streamer / 5% platform** on all paid surfaces — enforced
on-chain for crypto, via Stripe `application_fee` for cards.

## Why it's defensible

1. **On-chain trust primitive.** `casi-escrow` is an Apache-2.0 Anchor program
   that enforces the 95/5 split, linear vesting on beams, and anti-grief rules
   (only the two consenting parties can early-settle; after the beam duration
   anyone can "crank" settlement, guaranteeing liveness). Reusable by any
   Solana project that needs trust-minimised time-based payments.
2. **Three-rail payment architecture.** Most competitors pick a tribe
   (Streamlabs = Stripe, Streamflow = Solana). CASI serves both, which means
   streamers don't alienate viewers on either side.
3. **OBS-native.** Bookings appear as transparent browser-source overlays with
   realtime sync + 30-second watchdog auto-reload. Streamers add one URL to
   OBS and never touch it again.
4. **Streamer dashboard UX.** Drag/resize overlay canvas (react-rnd), booking
   queue, Stripe Connect onboarding, Solana wallet linking — all in one page.

## Current state (technical)

- **Frontend**: Next.js 16 App Router + React 19 + Supabase + Stripe Connect +
  Solana Wallet Adapter. Deployed on Vercel.
- **Solana program**: `casi-escrow` (Apache-2.0, 700 lines Rust, Anchor 0.31.1).
  **19/19 integration tests passing** against local validator. Covers audit-
  sensitive surface: fee math, vesting cap, state machine transitions,
  has_one / address constraints, anti-grief rules.
- **Test suite**: `programs/casi-escrow/README.md` documents the audit scope
  and error codes. Every settled state change emits a typed event for off-
  chain indexers.
- **Deploy pipeline**: `scripts/setup-devnet.sh` — one-shot Ubuntu bootstrap
  that installs Rust + Solana CLI + Anchor, builds the program, runs tests,
  and deploys to devnet.
- **Payment webhooks**: Helius (Solana) + Stripe, both with signed event
  validation.
- **Cron**: GitHub Actions `stripe-janitor` handles overdue captures,
  queue advancement, storage cleanup.

## Traction / status

- **Product**: complete. Both payment rails work end-to-end in local tests.
- **Deploy**: blocked on Solana devnet faucet (temporary — all public faucets
  dry as of 2026-04-17). Once SOL available, devnet deploy is a one-command
  script. Mainnet deploy is a config flip + fresh program keypair.
- **Users**: pre-launch. Target first 10 streamers for closed beta once
  mainnet is live.

## Roadmap

### Next 2 weeks (pre-launch)
- [ ] Devnet deploy (blocked on faucet recovery) — `./scripts/setup-devnet.sh`
- [ ] End-to-end smoke: real devnet wallet books flash + beam from `/overlay`,
      streamer approves from `/admin`, OBS source renders correctly.
- [ ] Box large account contexts to fix stack-frame warnings in `ApproveFlash`
      + `SettleBeam` (known fix, ~30 LOC).
- [ ] Replace `fee_wallet::ID` placeholder in `lib.rs:39` with real treasury
      pubkey (Gnosis-safe-equivalent multisig recommended).

### Month 1 — mainnet + closed beta
- [ ] Mainnet deploy: flip `src/lib/solana-network.ts:NETWORK` to `'mainnet'`,
      regenerate program keypair, buy Helius paid RPC (public mainnet RPC
      rate-limits hard), update Vercel env vars.
- [ ] Onboard 10 closed-beta streamers (warm outreach).
- [ ] Ship user docs: streamer onboarding guide, viewer flow explainer,
      OBS setup screencast.
- [ ] Monitor: Sentry for frontend, Helius webhook failure alerts, Stripe
      dispute rate.

### Month 2–3 — open beta
- [ ] Payout UI: streamers see settled earnings per rail, Stripe payout
      schedule, Solana wallet balance.
- [ ] Analytics for streamers: conversion funnel (overlay views → bookings),
      top viewers by spend, slot-level revenue attribution.
- [ ] Multi-currency: Stripe is currently EUR-hardcoded; add USD + GBP.
- [ ] Touch-optimised admin canvas (currently desktop-only).
- [ ] Per-event Helius webhook signatures (currently single shared secret).

### Month 4–6 — growth
- [ ] Integrations: Twitch chat bot that posts `!flash` commands mapping to
      CASI booking URLs.
- [ ] SDK: `@casi/widget` — embeddable overlay for non-OBS use cases (web
      embeds, custom streaming clients).
- [ ] Referral program: streamers earn 1% of fees from streamers they refer,
      for life. Pays out on-chain via a separate `casi-referral` program.
- [ ] Fiat off-ramp: auto-convert Solana USDC → EUR via Circle / Mural for
      streamers who don't want to manage crypto.

### Year 1 — primitive licensing
- [ ] Open up `casi-escrow` as a standalone SDK for other use cases (see
      "Adjacent markets" below). Apache-2.0 license is already in place.
- [ ] Documentation site: casi-escrow.dev (on-chain design, integration
      guides, audit report, error codes).

## Monetization

- **5% platform fee** on all paid surfaces, enforced on-chain for crypto and
  via Stripe `application_fee` for cards. Free-tier flashes take no fee.
- At scale: $1 ARPU/viewer × 1000 viewers/streamer × 100 streamers × 5% =
  $5k/month baseline. 10× streamers = $50k/mo. 10× ARPU (higher-end
  sponsorship beams) = $500k/mo.
- **Gross margin ~90%** — only material costs are Stripe (2.9% + €0.25
  passed through), Solana RPC (~$200/mo Helius paid), Vercel (~$100/mo),
  Supabase (~$100/mo). No inventory, no servers.

## Adjacent markets (primitive licensing)

The `casi-escrow` Anchor program is general-purpose. Any use case that wants
**"pay now, time-based service, fair pro-rata on early exit, guaranteed
settlement"** can integrate it. Candidates:

- **Live tutoring / consulting platforms** — prepaid sessions with fair refund
  if cut short.
- **Pay-per-minute voice/video** — therapy, legal, language learning.
- **Equipment / storage rental** — pay for 30 days, return early, get the
  difference back.
- **Freelance milestone payments** — client locks funds, freelancer starts
  work (beam.start), either side can end early.
- **SLA-backed vendor contracts** — prepaid service with downtime refunds
  via pro-rata settlement.
- **Subscription services with refund fairness** — cancel day 15 of 30,
  service keeps half, user refunded half — impossible in Web2, trivial here.

The novel bit isn't the streaming application. It's the **beam primitive**:
linear vesting + two-party anti-grief + permissionless post-duration crank.
That's a new building block.

## Team + ask

*(fill in based on actual team + raise target — this doc is a template)*

- Founder: full-stack, shipped the product + on-chain program.
- Raise: seed round to fund 12 months runway for 2 FTEs + audit + growth.
- Target audit cost: $30–60k (Neodyme, OtterSec, or Ackee).

## Risk factors

- **Solana network risk**: outages would pause crypto settlement (Stripe
  unaffected). Mitigated by fallback to free-tier / Stripe rails per streamer.
- **Regulatory**: 5% platform fee on crypto could be treated as a VASP
  activity in some jurisdictions. Incorporate in a crypto-friendly
  jurisdiction; consult counsel before scaling.
- **Competition**: Streamlabs, Streamflow, Super Chat. CASI's angle is the
  paid-placement UX + on-chain escrow combo. Single-rail competitors don't
  address the full surface.
- **Platform dependency**: Stripe Connect onboarding is manual for each
  streamer. If Stripe de-platforms the business, the Solana rail remains
  functional independently — which is a point in favor of having both.

## Links

- Public repo: `mm88nl-web/casi-app` (branch `claude/casi-project-summary-zJfeU`)
- Anchor program: `programs/casi-escrow/` (Apache-2.0)
- Program README: `programs/casi-escrow/README.md` (audit scope + test coverage)
- Technical summary: `SUMMARY.md`
