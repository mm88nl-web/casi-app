# StakeCall brainstorm — handoff notes

This is a handoff doc so I can continue the conversation in a fresh chat (ChatGPT / Claude web / etc.). Paste the whole thing as the first message; the assistant will have full context.

---

## Context for the assistant

I'm the operator of **CASI** (casi-app) — a Next.js + Supabase web app where livestream viewers pay to put images/video/messages on a streamer's OBS overlay for a fixed duration.

Two payment rails:

- **Stripe Connect (fiat)** — manual-capture PaymentIntents on streamers' connected accounts. Daily cron janitor sweeps abandoned auths.
- **Solana escrow (crypto)** — Anchor program at `6utjMbb5ovFHUdMcMWaGc5ovmVhLryVRLEzYPWzeBosg`. Viewer stakes USDC into a PDA vault. State machine: `Pending → Active → Settled/Cancelled`. Pro-rata settle on early end, 100% refund on cancel-before-approval, permissionless `cancel_stale_pending` crank after 7 days. Phase-3 added session-key delegation so streamers don't sign a wallet popup on every approve/kick — a "cranker" keypair pays fees for the delegated twins.

**Key property:** the escrow + cranker is a genuine primitive, not CASI-specific. It's "time-bound prepayment with third-party-cranked settlement":
- Viewer stakes funds upfront, can fully reclaim before activation.
- Provider activates a vesting timer; funds vest linearly by wall-clock.
- Either party can settle early (pro-rata); anyone can settle post-duration.
- A session key lets the provider automate activations/settles without wallet popups.
- A permissionless cranker handles stale refunds.

I want to ship a sibling app on top of this primitive to prove it's reusable. The chosen app is **StakeCall** — paid 1:1 calls with experts, with on-chain refund guarantees.

---

## Conversation so far

### 1. Use cases for the escrow + cranker besides CASI

All fit without program changes:

1. **Paid 1:1 video calls / consultations.** Stake for a 30-min slot; provider no-shows → viewer cancels for full refund; early hangup → pro-rata split.
2. **Rented compute / GPU time.** Renter stakes; provider starts the VM (session key, no popup); renter kills early → unused minutes refund.
3. **AI inference credits w/ SLA.** Stake for N minutes of dedicated model access; endpoint dies → viewer settles and reclaims remainder.
4. **Pay-per-view livestreams** (paywalled, not tip-overlay). Same shape as CASI beams but the "slot" is stream access.
5. **Short-term rentals / bookings** (game servers, storage lockers, coworking rooms). Check-in = `start_beam`; check-out = `settle_beam`.
6. **Bounty / contract work escrow.** Client can release early, contractor can't drain beyond vested. Session key lets a CI bot auto-settle on merge.
7. **Event tickets with cancellation guarantees.** Organizer cancels (never calls start_beam) → crank refunds after timeout.
8. **Subscription trials on-chain.** Duration = trial length; early cancel = partial refund without provider signing.

Cranker specifically unlocks: anything where the provider shouldn't have to be online to activate/close. Doesn't fit: non-linear vesting (cliffs/milestones), multi-party splits beyond viewer/streamer/platform-fee, dynamic duration.

### 2. Two vibe-code-sized candidates

- **StakeCall** (paid office hours / 1:1 consults) — expert economy angle.
- **DropIn** (pay-per-view mini-livestream for small creators) — creator economy angle.

They look like different products but use identical escrow flow → that's what proves the primitive. Chose StakeCall to build first.

### 3. Realistic vibe-code plan for StakeCall

**Reused verbatim from CASI:**
- `programs/casi-escrow/` — no program changes. "Duration" is generic.
- `src/lib/casi-escrow.ts`, `cranker-keypair.ts`, `solana-network.ts`, `casi-errors.ts`
- All `/api/solana/delegates/*` routes + webhook handler
- `DelegateKeyCard.tsx` + install UX contract
- `settleOrClearSolanaEscrow` discriminated helper
- `reclaimSolanaEscrow` viewer recovery
- `cancel_stale_pending` cron
- Helius webhook setup (point at new deployment URL)
- Supabase column-level RLS + `cancel_token` mechanic

**Rewritten (small):**
- Schema: drop `overlay_elements`, `flashes`. Keep `profiles` + `bookings`. Add `price_per_minute`, `min_minutes`, `max_minutes` on profile.
- Drop Stripe entirely — USDC only. Delete `/api/stripe/*` and janitor's Stripe half.
- Replace `overlay/page.tsx` (OBS browser source) with `call/[id]/page.tsx` (video room).
- Replace `admin/page.tsx` canvas/queue with a "today's stakes" list + "Join call" button per row.
- Booking page becomes a slot picker or "online now" toggle (see UX variants below).

**Genuinely new (one thing): video layer.**
Use Daily.co free tier (10k min/month) or LiveKit Cloud free tier. One API call → room URL + participant token. Embed their React component (~50 LOC). Expert's "Join" button fires `start_beam_delegated` + creates Daily room in parallel. "End call" fires `settle_beam_delegated`.

**Scope:**
- Day 1 (4–6h): fork, strip Stripe + overlay + flashes + canvas, fresh Supabase project, single new migration.
- Day 2 (4–6h): booking form, expert dashboard, wire Daily into `call/[id]`.
- Day 3 (2–4h): webhook rewire, cron, deploy, devnet smoke test.

**Vibe-code shortcuts:**
- Share the same deployed program ID + cranker wallet across CASI and StakeCall. Isolated by PDA seeds (booking id). One cranker at 0.1 SOL covers both apps for months.
- Skip availability calendar v1 — see "online now" variant below.
- Skip multi-expert marketplace v1. One expert, one slug, one landing page.

**One thing that will bite:** Daily rooms are independent of escrow. If the video drops but `start_beam_delegated` already fired, the timer keeps vesting. v1 solution: expert hits "End" manually on reconnect fail. v2: room heartbeat → auto-settle on 2-min gap.

### 4. Payment rails — should StakeCall add more than Stripe + Solana?

**Recommendation: keep it at two.** Adding rails is a tax, not a feature.

**Criteria for a rail fitting this primitive:**
1. Authorize-now / capture-later (or escrow-equivalent).
2. Pro-rata refund on early settle.
3. Direct-split to provider (not money-transmitter risk).
4. Webhook-driven state.

Very few rails hit all four.

**Worth considering:**
- **Base / Arbitrum USDC (EVM)** — the only rail with meaningfully non-overlapping audience (EVM wallets ≫ Solana wallets). Fits perfectly *but* requires porting Anchor program to Solidity (~300 LOC), swapping wallet-adapter for wagmi/viem, swapping Helius for Alchemy/Quicknode webhooks, adding decoder lib + reconciler cron. 60–70% of the work I already did for Solana.
- **PayPal (auth/capture + Payouts API)** — closest to "just webhooks + site". 29-day auth hold, Payouts handles splits. ~2–3 days. Overlaps Stripe in US, matters for EU/DE audiences.

**Skip:**
- Coinbase Commerce — pay-and-done, no escrow primitive.
- ACH / SEPA direct debit — 3–5 day settlement kills the "cancel in 10 min" UX.
- BNPL (Klarna/Affirm) — wrong product shape.
- Lightning — HTLCs are time-bound differently; pro-rata doesn't translate.
- Apple/Google Pay — not a rail, just Stripe payment methods.
- Crossmint/Helio/Sphere — Solana checkout wrappers; layer on top, don't replace.

**"Is it just webhooks + website?":** PayPal mostly yes. EVM chain no — you re-own the escrow state machine on a new chain.

### 5. Competitive landscape + UX direction

**Closest existing analogs:**
- **Intro.co** — book 15/30-min call with expert/celeb. Stripe, Calendly-ish booking, Zoom link delivered.
- **Topmate.io** — huge in India, LinkedIn creators. Same shape: bio → price → slot → call.
- **Clarity.fm** — older, business-advisor, per-minute pricing.
- **Superpeer** — died 2023, was exactly this.
- **MentorCruise** — mostly recurring/async, mentor matching.
- **BetterHelp / Talkspace** — therapy subscription (wrong shape).
- **Cameo** — async personalized videos (wrong shape — not live).

**Wedge vs. all of these:** on-chain refund guarantee. Every one of them holds your money and "promises" to refund via support ticket. StakeCall settles automatically.

**Visual shape:** Not WhatsApp, not Zoom. Closer to **Calendly + Daily iframe** glued together.

Two core surfaces:
1. **Expert profile page** — bio, price/min, availability, single "Book" button. Think Intro.co's page.
2. **Call room page** — Daily.co iframe + timer + "End call" button. ~80 LOC.

**UX variants:**

- **Variant A — "Intro.co lite"** (scheduled): weekly availability, timezones, calendar invites. Familiar but adds scheduling complexity.
- **Variant B — "Knock on the door"** (live, no scheduler): expert toggles 🟢 Online. Viewer clicks → stakes → expert gets browser ping, accepts/declines in 60s → both drop into call room. `cancel_stale_pending` crank auto-refunds if expert doesn't accept.

**Recommended: Variant B.** Reasons:
- Deletes the entire scheduling layer (biggest UX surface in every competitor).
- Maps cleanly onto `cancel_stale_pending` primitive.
- Novel UX — no one in the category does this; everyone is calendar-based.
- Vibe is closer to Clubhouse rooms or knocking on a Discord DM than Zoom. Warmer, more spontaneous.
- Fewer screens. Expert dashboard = a toggle + incoming-call modal.

Variant A is additive later if demand appears. Zero program changes required.

**Visual references to crib:**
- Intro.co's expert profile layout (clean, price front-and-center, single CTA).
- Discord's "call incoming" modal for accept/decline.
- Daily.co's default prebuilt UI for the call room.

---

## Where I want to go next

Open questions I haven't answered yet:
- Do I want to build StakeCall as a fork of CASI, a sibling package in a monorepo, or a fresh repo sharing a `@casi/escrow` npm package?
- How do I market a single-expert StakeCall v1 — who's the first expert, how do they find viewers?
- What's the right pricing floor? USDC minimums, Solana fee overhead, cranker cost per settle.
- Should I even ship StakeCall, or is DropIn (pay-per-view mini-livestream) a better first demo of the primitive?

Pick up anywhere from here.
