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

**Updated 2026-08-10 — this section previously said mainnet launch is gated
on a clean external audit; that's no longer the actual plan and this was
left stale.**

The `casi-escrow` Anchor program runs on Solana **devnet** with test USDC.
A professional third-party audit is not yet funded (quotes obtained from
Sec3 — approx. $22k against the program's ~1.2k LOC — with OtterSec and
Neodyme as alternates); the plan is to launch mainnet **capped** rather than
wait indefinitely for that budget. See `capped-mainnet-plan.md` for the
design: per-booking ($50 on Solana), per-streamer TVL ($500), and
per-streamer-daily ($1,000) limits enforced at the application layer, sized
so a worst-case incident is bounded even against an unaudited program. The
on-chain program's own `max_escrow_amount`/`min_escrow_amount` config
(settable via `update_config`, no code change) should be set to match
before launch, closing the gap where a caller who bypasses the app entirely
could otherwise exceed the app-layer cap.

Separate from the professional audit, an internal AI-driven adversarial
review (Fable, 2026-08-10, `docs/fable-security-review-2026-08-10.md`) found
and proved two real issues with working exploit PoCs — both fixed at the
app/config layer without touching the program. Treat that review as a
supplement that raised confidence for a capped launch, not a substitute for
the professional audit; the two fixed issues are exactly the class of thing
the Sec3-caliber audit would also have caught.

The program remains frozen against refactoring pending the professional
audit (bug fixes only, and only with a test proving the bug — see
`AGENTS.md`).

The **Stripe rail is live on mainnet** (EUR/USD/GBP and more) as of May 2026
and has been exercised with real payments. Stripe Connect Direct Charges and
manual-capture PaymentIntent logic were security-reviewed before cutover.
