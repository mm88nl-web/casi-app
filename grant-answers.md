# Solana Foundation Grant — `casi-escrow` primitive

Working draft for the grant application. The grant would fund the `casi-escrow`
Anchor program (audit + SDK + public-good deliverables); CASI the consumer
product is the reference integration that motivates and stress-tests it.

---

## Funding posture (May 2026, post-Sec3 reply)

**Treat this grant as a shot, not the funding plan.** Jack Tsai at Sec3 (a
multi-year Solana ecosystem participant who has worked with the Foundation
in multiple capacities) responded to the audit-quote outreach with two
substantive pieces of advice worth recording here so this doc isn't read
as financial planning:

1. **Solana Foundation grants are extremely difficult to land at this
   stage.** His direct words: *"i really would not count on that as a source
   of funding."* Coming from someone with insider visibility into the
   foundation's pipeline, that's data, not pessimism.
2. **Don't audit before product-market fit.** Sec3's rate is **~$18 per
   line of code excluding comments and tests** — for `casi-escrow`'s
   ~1.2k LOC that's roughly **$22k for the audit alone**, on top of the
   ~$3k remediation contractor. His standard advice to early-stage builders
   is "ship to mainnet with restrictions/limits to contain exposure, prove
   PMF, then audit when there's traction (and ideally revenue) to pay for
   it."

**Adjusted plan, in order of probability:**

| Path | Likelihood | Notes |
|---|---|---|
| **Pro-tier SaaS MRR funds the audit** | Highest | 100 streamers × $19/mo × 12mo ≈ $22.8k → covers Sec3 quote. Requires capped-mainnet launch first to acquire the streamers. See `capped-mainnet-plan.md` for the cap design and `pro-tier-plan.md` for the SaaS feature menu. |
| **Colosseum hackathon prize** (Renaissance / Radar) | Medium | $50k+ top prizes, foundation/VC visibility; submission re-uses existing repo + write-ups. Worth doing regardless of grant outcome. |
| **Superteam (NL / Europe) bounties + intros** | Medium | Local builder community, mentorship pipeline, sometimes pre-seed intros. Direct path Jack named. |
| **This grant** | Lower than initially assumed | Still apply — application is mostly written, marginal cost is low — but don't restructure the runway around it landing. |
| **Angel / pre-seed** | Lowest near-term | Pre-PMF, pre-audit, solo non-technical founder. Possible but slow. |

**Implication for the grant application body**: keep the pitch strong (it's
still a credible primitive worth public funding even if it's a long shot),
but the founder-facing narrative is "we are designing for self-funded launch
with deliberate caps; the grant accelerates the audit if it lands, but
doesn't gate the product."

**Sec3 written-quote status**: not formally requested yet. The $18/LOC rate
is stated in Jack's reply — sufficient context to fill in the budget below.
A formal quote PDF can be requested if/when the grant or revenue path
indicates we're actually going to engage Sec3.

---

## 1. Identity

| Field | Value |
|---|---|
| Project name | CASI |
| Website URL | https://casi.gg |
| Country | Netherlands |
| First name | Matthew |
| Last name | Melendez |
| Email | mm88nl@gmail.com |
| Funding category | Developer Tooling |

---

## 2. Your project / idea

> **`casi-escrow`: a time-vested USDC escrow primitive for Solana.**
>
> Most on-chain escrows are binary — funds are either fully paid or fully refunded. Real-world commercial agreements aren't binary; they're time-bounded services where value vests as time passes (rentals, paid sessions, content windows, SLAs). Today, Solana teams that need this re-implement it from scratch every time, without an audit, with custom anti-grief and liveness logic that nobody has reviewed.
>
> `casi-escrow` is a single, audited Anchor program that solves this once. It supports:
>
> - **Linear vesting over a booked duration.** Either party can settle early and split funds pro-rata trustlessly.
> - **Permissionless liveness.** After the duration, anyone can crank settlement; after 7 days of inactivity, anyone can refund a stuck pending escrow. Funds cannot be locked by either party refusing to sign.
> - **Scoped session-key delegation.** A pattern that lets a server sign approve / settle on a user's behalf for UX latency, with the key's authority enforced **on-chain**, not by the server. A leaked session key can at worst force-settle at the current vested point — it cannot drain or redirect funds.
> - **A fee-paying cranker design.** The session key never holds SOL; an unrelated cranker keypair pays fees. Documented operator playbook so others can replicate the pattern.
>
> The grant funds the audit, SDK, public cranker, and documentation. All deliverables are Apache-2.0. Any team building tutoring marketplaces, GPU rentals, paid content windows, time-bounded freelance escrows, or — like us — pay-per-minute viewer-facing media can `npm install` the SDK and inherit the audit, vesting math, anti-grief rules, and liveness backstop.
>
> The reference integration is **CASI** (https://casi.gg), a livestream tipping product where viewers pay in USDC to put media on a streamer's overlay for a fixed duration. CASI exercises every code path in the program — flashes, beams, vesting, delegation, cancel, refund — so the primitive ships with a real-world stress test, not just synthetic unit tests. CASI itself is not what this grant funds; CASI sustains itself separately through standard streamer-tool SaaS (the same model as Streamlabs Ultra), with no protocol fee on the program.
>
> Repo: https://github.com/mm88nl-web/casi-app · Program: `programs/casi-escrow/` · License: Apache-2.0

---

## 3. Funding amount

`$32,000 USD`

(Below the Foundation's stated $40k benchmark. Sized to cover Sec3's stated
audit rate against the program's actual LOC count, plus contractor work for
remediation, SDK, and public-good deliverables.)

---

## 4. Budget proposal

> **Total: $32,000.** All deliverables Apache-2.0 and public.
>
> **Milestone 1 — $25,000 — External audit + remediation** *(est. 6 weeks)*
> - Audit firm: **Sec3** (Jack Tsai), with **OtterSec** and **Neodyme** as alternates if Sec3's timeline doesn't fit the milestone window. Sec3 stated rate is **$18 per line of code excluding comments and tests**; against `casi-escrow`'s ~1,200 LOC of program code, that's approximately **$22,000** for the audit. Formal written quote available on request once funding is conditionally awarded.
> - Remediation contractor (sourced via Superteam Earn or audit-firm referral): $3,000, applies firm's findings to the program.
> - Audit report and remediation diff published in the repo.
> - Tag `casi-escrow` v1.0.0 and deploy to mainnet-beta.
> - **Acceptance:** audit report committed; high/critical findings closed; mainnet program ID announced.
>
> **Milestone 2 — $5,000 — `@casi/escrow-sdk` + tutorial** *(est. 4 weeks)*
> - Documentation contractor extracts the program client (currently `src/lib/casi-escrow.ts`) into a typed npm package, publishes to npm, writes a long-form tutorial covering the state machine, vesting math, liveness design, and the session-key delegation pattern, and ships a sample app.
> - **Acceptance:** `@casi/escrow-sdk` on npm with passing CI; tutorial published; sample app repo public.
>
> **Milestone 3 — $2,000 — Public cranker + design note** *(est. 2 weeks)*
> - Run a free public service that calls `cancel_stale_pending` on any abandoned escrow on the program after 7 days. Publish operator playbook so others can run their own.
> - Publish a design note on the scoped-session-key + cranker pattern.
> - **Acceptance:** public cranker live with monitoring; design note merged.

---

## 5. Relevant metrics

> Because the grant deliverables are infrastructure (audit, SDK, docs, public cranker), the relevant metrics measure ecosystem reach, not consumer adoption:
>
> - Audit findings count + severity distribution (M1).
> - npm weekly downloads of `@casi/escrow-sdk` (M2 onward).
> - GitHub stars / forks on the program repo.
> - Number of independent integrations referencing the program ID on mainnet (verifiable on-chain).
> - On-chain volume settled through the program (mainnet, all integrations, not just CASI).
> - Number of stale-pending escrows rescued by the public cranker.
> - Tutorial / design-note views and any third-party derivative writeups.
>
> CASI's own usage will be reported separately as a sanity check on the primitive, not as a grant deliverable.

---

## 6. Why You?  *(≥100 words)*

> I'm Matthew Melendez, the solo founder of CASI. I'll be honest with the Foundation up front: I'm not a career Solana developer, and I'm not pretending to be one. I'm a non-technical builder who saw a gap — streamers want to monetize their on-stream real estate, not just take chat tips, and there's no on-chain primitive that handles the time-vested "rent this slot for N minutes" pattern. I built CASI and the `casi-escrow` Anchor program over the last few weeks using modern AI-assisted tooling, working from the official `solana-developers/program-examples` escrow template and applying conventional Anchor patterns: PDA-owned vault ATAs, `token_interface` for Token-2022 compatibility, `transfer_checked` with mint + decimals on every SPL transfer, `u128` intermediate arithmetic with `checked_sub`, and `has_one` constraints on every relationship.
>
> The result is on Solana devnet at https://casi.gg today. The program is ~1.2k LOC of Rust, ships with an 18-test integration suite covering vesting math, anti-grief, and conservation invariants, and has been exercised continuously by the consumer product across all four primitives (flashes, beams, backdrops, delegated session-key approve/settle). The design decisions worth flagging are the ones that limit the blast radius of mistakes: settlement is liveness-safe by construction (anyone can crank after the duration; anyone can refund after the 7-day pending timeout, so neither party can lock the other's funds), and the session-key delegation scope is enforced **on-chain** (a leaked session key cannot redirect funds outside the program's declared destinations). All material is published in `programs/casi-escrow/PRIMITIVE.md` and `FEE_MODEL.md` — reviewers can read the program directly and form their own view in 30 minutes.
>
> The grant funds the part I can't do credibly alone: external review by a recognized Solana audit firm, remediation by a contractor sourced via the audit firm or Superteam Earn, and a documentation contractor for the SDK + tutorial + public-cranker operator playbook. I'm the project lead and accountable party for milestone delivery; the technical work goes to specialists. The structure is deliberate — every grant dollar goes to named external work, not to my personal runway, because I think that's the most defensible way for a non-traditional builder to ship a money-moving primitive responsibly. If the audit reveals a fundamental design flaw, the grant has paid for finding it before mainnet rather than after.

---

## 7. Competition  *(≥100 words)*

> The honest answer: **there is no widely-used reusable time-vested USDC escrow primitive on Solana today.** Every team that needs one re-implements it.
>
> **Adjacent primitives, and why they don't cover this use case:**
> - **Streamflow / Squads payment streaming** — designed for vesting employee compensation and DAO payouts. Continuous streaming model, not bounded duration; no permissionless cancel; no session-key delegation; no anti-grief liveness backstop.
> - **Solana Pay** — payment rail for a single transfer; no escrow, no vesting, no lifecycle.
> - **Helio / Sphere / Spherepay** — fiat-on-ramp + payment processing; no on-chain escrow primitive exposed.
> - **Generic OTC escrows on Solana** — binary release, not time-vested; require an arbiter or oracle.
>
> **What `casi-escrow` adds:**
> 1. **Time-vested settlement with pro-rata early exit.** Funds vest linearly; either party can call settle and the math is enforced on-chain.
> 2. **Permissionless liveness from both ends.** Permissionless settle-after-duration prevents the recipient side from locking funds; permissionless cancel-after-7-days prevents the funder side from being stuck. No arbiter, no oracle, no admin key.
> 3. **Scoped session-key delegation.** The program enforces the session key's scope on-chain — it can only call the four delegated approve/settle variants and cannot redirect funds. A reusable pattern for any consumer app that wants Web2 latency without taking custody.
> 4. **Apache-2.0 with an audit and an SDK**, so teams don't have to choose between rolling their own (risky) or using a closed-source service (custodial). The grant explicitly funds making this choice exist for the ecosystem.
>
> The realistic alternative for a developer today is "fork our repo or reinvent the wheel." This grant turns that into "`npm install` and read the docs."
>
> On the consumer-product side, the closest products are Blerp Media Share (paid third-party clips on stream — no viewer-uploaded media, no time-slot rental, no crypto rail), Tangia (cataloged paid interactions — no viewer media), Streamloots (streamer-curated card alerts — not viewer self-serve), and Loots.com (B2B brand sponsorships — not viewer-driven). None overlap with both the time-slot-rental UX and the on-chain trust-minimised settlement that CASI offers.

---

## 8. How does this benefit the broader Solana community, especially other developers?  *(≥100 words)*

> Every dollar of this grant produces an artifact that's free, open, and useful regardless of whether CASI succeeds:
>
> 1. **An audited, Apache-2.0 Anchor program** for time-vested USDC escrow with liveness guarantees. No equivalent exists publicly today.
> 2. **`@casi/escrow-sdk` on npm**, typed and documented, so any team can integrate the primitive with `npm install` instead of copy-pasting our `src/lib/casi-escrow.ts`.
> 3. **A long-form tutorial** explaining the state machine, vesting math, anti-grief invariants, and how to think about liveness in Solana programs. Useful as teaching material even for teams not using the primitive.
> 4. **A reusable design note on the scoped-session-key + cranker pattern**, addressing the most common UX gap in consumer Solana apps (wallet popups for every server-known action) without resorting to custodial wallets.
> 5. **A free public `cancel_stale_pending` cranker**, plus an operator playbook so others can run their own. Any escrow on the program — not just CASI's — is automatically rescued from accidental abandonment.
> 6. **The full integration test suite** as executable documentation of the program's intended behavior. Other teams reviewing the program for their own use have a worked example of vesting + delegation + anti-grief tests.
>
> The grant funds **infrastructure that any Solana developer can build on**: tutoring marketplaces, GPU rentals, paid content windows, freelance escrow, time-bounded SLAs. CASI happens to be the first product on top, but the program is deliberately business-model-agnostic. There is no protocol fee — funds always flow directly between viewer and streamer; CASI never holds or routes them. If CASI never finds product-market fit, the program, the SDK, the audit, the docs, and the public cranker still ship and still benefit the ecosystem.

---

## Submission checklist

Before submitting:

- [ ] Identity fields (name, country, email) filled in.
- [ ] Funding category confirmed against the actual form's dropdown options.
- [x] At least one audit-firm rate received and named in Milestone 1 (Sec3, $18/LOC, May 2026).
- [ ] Optional: request a formal written quote from Sec3 if/when grant is awarded conditionally.
- [ ] "Why You?" background paragraph filled in with 2–3 sentences of prior experience.
- [x] Repo is public (✅ as of 2026-04-29).
- [x] README has been polished (✅ as of 2026-04-29).
- [ ] `programs/casi-escrow/README.md` is accessible and explains the design.
- [x] `LICENSE` file exists at root with Apache-2.0 (✅).
- [x] `SECURITY.md` exists with a vuln-report contact email (✅ as of 2026-04-29).
- [x] CI is green (✅ as of 2026-04-29).
