# CASI — Investor Brief

*Last updated May 2026.*

## One-liner

CASI is a streamer monetisation platform where viewers pay to place things
on-stream — text flashes, branded beams, or full-frame backdrops — via credit
card, USDC, or a free tier the streamer controls.

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

- **Stripe Connect** — credit / debit card, multi-currency (EUR, USD, GBP, AUD, CAD, BRL, JPY, SGD). Live on mainnet as of May 2026.
- **Solana USDC** — on-chain escrow via `casi-escrow` (Apache-2.0 Anchor program). Currently on devnet pending external audit.
- **Free** — rate-limited; streamer approves all.

Revenue split is **100% streamer / 0% platform** on all paid surfaces: Stripe
uses Connect Direct Charges with zero `application_fee`, and the Anchor program
pays the streamer the full vested amount on settlement.

## Why it's defensible

1. **On-chain trust primitive.** `casi-escrow` is an Apache-2.0 Anchor program
   that enforces linear vesting on beams and anti-grief rules (liveness
   guaranteed — anyone can crank settlement after the duration; viewer can
   cancel before activation for 100% refund). Reusable by any Solana project
   that needs trust-minimised time-based payments.
2. **Three-rail payment architecture.** Most competitors pick a tribe
   (Streamlabs = Stripe, Streamflow = Solana). CASI serves both, which means
   streamers don't alienate viewers on either side.
3. **OBS-native.** Bookings appear as transparent browser-source overlays with
   realtime sync + 30-second watchdog auto-reload. Streamers add one URL to
   OBS and never touch it again.
4. **Streamer dashboard UX.** Drag/resize overlay canvas, booking queue, Stripe
   Connect onboarding, Solana wallet linking, session-key delegation (no wallet
   popup on every approve) — all in one dashboard.

## Current state (May 2026)

- **Stripe rail**: live on mainnet. Multi-currency, manual-capture PaymentIntents
  on streamers' connected accounts, end-to-end tested with real payments.
- **Solana rail**: devnet with test USDC, full escrow + session-key delegation
  + daily reconciler cron deployed and running. Mainnet gated on external audit.
- **Operator**: casi (Netherlands).
- **Legal**: imprint + privacy policy (GDPR) + terms of service live at `/legal/*`.
- **Deploy**: Vercel. Domain: `www.casi.gg`.
- **Tech**: Next.js 16 (App Router), React 19, Supabase, Vercel, Stripe Connect,
  Solana wallet-adapter, Anchor 0.31.1.

## Monetization

**Planned: streamer SaaS subscription tier (~$19/mo Pro).** 100% of every
booking flows direct viewer → streamer — CASI never holds or skims funds.
Revenue is planned from a Pro tier unlocking: unlimited slots, custom shapes,
auto-approve rules engine, analytics, custom branding, outbound webhooks, OBS
widgets. Same model as Streamlabs Ultra.

The math: 100 Pro streamers × $19/mo = $1,900/mo → audit funded in ~13 months.
Not yet shipped. Ships after mainnet + first cohort onboarding.

## Adjacent markets (primitive licensing)

The `casi-escrow` Anchor program is general-purpose for any use case that needs
"pay now, time-based service, fair pro-rata on early exit, guaranteed liveness":
live tutoring, pay-per-minute voice/video, GPU/compute rental, freelance
milestone payments, subscription trials with refund fairness.

## Roadmap

1. **Capped mainnet (Solana)** — server-layer caps ($50/beam, $500 per-streamer TVL)
   while audit is pending. Invites-only cohort. See `capped-mainnet-plan.md`.
2. **External audit** — `casi-escrow` scoped with Sec3 / OtterSec / Neodyme.
   Audit budget: ~$25k (Sec3 stated ~$18/LOC for ~1.2k LOC program).
3. **Pro tier** — after first 50–100 onboarded mainnet streamers. See `pro-tier-plan.md`.
4. **`@casi/escrow-sdk`** — extract program client into a typed npm package.

## Risk factors

- **Solana network risk**: outages pause crypto settlement (Stripe unaffected).
  Mitigated by fallback to Stripe / free rails per streamer.
- **Regulatory**: non-custodial crypto rail (viewer → PDA vault → streamer,
  CASI never takes custody) and zero on-chain platform fee sidestep most VASP
  classification triggers. Monetization via SaaS subscription, not per-transaction
  fees, keeps CASI positioned as a software company.
- **Competition**: Streamlabs, StreamElements, Tangia, Blerp — clip-only, no
  upload, no time-vested escrow, traditional Stripe-with-take-rate. CASI's angle
  is the paid-placement UX + on-chain trust combo + 0% take rate. None of the
  direct competitors are open source under a permissive license.
- **Platform dependency**: Stripe Connect onboarding is per-streamer. If Stripe
  de-platforms, the Solana rail remains functional independently.

## Links

- Public repo: [github.com/mm88nl-web/casi-app](https://github.com/mm88nl-web/casi-app) (Apache-2.0)
- Live product: [casi.gg](https://www.casi.gg)
- Anchor program: `programs/casi-escrow/` — `programs/casi-escrow/README.md`
- Grant draft: `grant-answers.md`
