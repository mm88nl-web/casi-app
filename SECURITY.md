# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in CASI — particularly in the
[`casi-escrow`](./programs/casi-escrow) Anchor program, the
[Stripe Connect integration](./src/app/api/stripe), or the
[booking flow](./src/app/api/bookings) — please report it privately.

**Do not open a public GitHub issue for security findings.**

Email: `security@casi.gg`

Please include:

- A description of the issue and the impact (what an attacker could do).
- Steps to reproduce, ideally with a minimal proof-of-concept transaction or
  request.
- Whether the issue is on devnet, mainnet (when live), or both.
- Whether you'd like to be credited in the eventual disclosure note.

## Scope

In scope:

- The on-chain `casi-escrow` Anchor program (program source under
  [`programs/casi-escrow/`](./programs/casi-escrow)).
- The web app's server routes that read or write financial state
  (`src/app/api/bookings`, `src/app/api/stripe`, `src/app/api/solana`,
  `src/app/api/flashes`, and the cron jobs under `src/app/api/cron`).
- The session-key delegation flow (`src/app/api/solana/delegates/*` and the
  `streamer_delegates` storage).
- Authentication, RLS, and column-level grants on the Supabase schema.

Out of scope:

- Findings that require physical access to a streamer's machine, OBS, or
  wallet.
- Issues in third-party dependencies that have already been disclosed and
  patched upstream — please report those directly to the upstream project.
- UI cosmetics or rate-limit abuse without a financial impact.

## Response expectations

- Acknowledgement within 72 hours.
- Initial triage within 7 days.
- Coordinated disclosure once a fix has been deployed and (where relevant)
  the audit firm has reviewed it.

## Audit status

The `casi-escrow` Anchor program runs on Solana **devnet** with test USDC.
Mainnet launch on the Solana rail is gated on a clean external audit.
Audit-firm outreach is in progress; the program is frozen (bug fixes only)
until the audit completes.

The **Stripe rail is live on mainnet** (EUR/USD/GBP and more) as of May 2026
and has been exercised with real payments. Stripe Connect Direct Charges and
manual-capture PaymentIntent logic were security-reviewed before cutover.
