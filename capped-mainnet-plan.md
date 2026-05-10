# Capped mainnet — pre-audit launch design

**Status**: planning, not shipping. This is the design for a self-funded mainnet
launch that intentionally limits blast radius while the `casi-escrow` audit
remains pending. Per AGENTS.md, no Pro-tier features ship pre-mainnet — but
launching mainnet *with caps* is the path to building the streamer cohort
that would fund the audit through Pro-tier MRR.

**Branch**: `claude/pro-tier-monetization-ruTuJ`

---

## Why this exists

Sec3's Jack Tsai (May 2026) gave two pieces of advice that reshape the
launch sequence:

1. The Solana Foundation grant we're applying for is unlikely to land at
   this stage.
2. Don't pay for a full audit before product-market fit. The standard
   playbook is *"launch with restrictions/limits to contain exposure,
   prove PMF, then audit when there's traction."*

Combined with the fact that the `casi-escrow` Anchor program is **frozen
pending audit** (per AGENTS.md, bug fixes only), this means:

- We **cannot** add caps to the program itself before audit
- We **can** add caps at the application/server layer (`/api/bookings/*`)
- Server-layer caps are removable post-audit without re-deploying or
  re-auditing the program

**The point of caps**: if a vulnerability exists in the un-audited program,
caps limit the size of the prize a malicious actor could go after. Combined
with `casi-escrow`'s existing on-chain liveness backstops (permissionless
settle after duration, permissionless cancel after 7-day pending timeout),
the worst-case loss per incident is bounded by the per-escrow cap × number
of concurrent escrows.

---

## What we're capping

### Per-booking max amount

Single largest exposure per escrow.

| Rail | Cap (USD-equiv) | Reasoning |
|---|---|---|
| Solana | **$50** | Caps the worst-case loss if the escrow program has an undiscovered bug. $50 USDC across hundreds of beams ≈ small total exposure even at scale. |
| Stripe | **$200** | Stripe holds funds in escrow itself — different risk model. Cap is mainly to discourage stunt-buying outliers and contain charge-back risk. |

### Per-streamer cumulative TVL (Solana only)

Sum of `price_value` for the streamer's bookings currently in `pending` or
`active` status.

**Cap: $500 USDC.**

Why per-streamer, not per-program: limits the size of a single streamer's
"pile of vulnerable funds." A streamer with $500 of active escrows is a
less attractive target than one with $50k.

### Per-streamer-per-day total volume (Solana only)

Sum of `price_value` for the streamer's bookings in the last 24h regardless
of status.

**Cap: $1,000 USDC.**

This is anomaly-detection-by-cap. If a streamer suddenly racks up $1k of
Solana volume, it's either (a) genuine traction worth a celebratory phone
call or (b) abuse worth pausing to look at. Either way: pause.

### Total program TVL (alarm threshold, not hard cap)

Sum of vault ATA balances across all active escrows on the program.

**Alarm at: $5,000.** Logged as `logError` to `ERROR_WEBHOOK_URL`
(Slack/Discord). Not a hard cap — refusing new bookings because the
program is "popular" would be a terrible UX. But knowing about it is
essential.

### Streamer whitelist (Solana only)

For the first N weeks of capped mainnet, only invited streamers can use
the Solana rail. Stripe rail is open to all.

**Why**: gives the founder time to onboard the first cohort manually,
verify they understand the alpha posture, and watch for unexpected behavior
on the Solana side without a flood of unknown-quality streamers.

**Implementation**: `profiles.solana_enabled BOOLEAN DEFAULT false` column.
Founder flips it manually for invited streamers. UI hides the Solana
booking option for non-whitelisted streamers' overlays.

**Removal**: when caps phase ends, drop the column or default to `true`.

---

## Where the caps live

All caps are **server-side** in the booking-create routes. The frontend
mirrors them for UX (so viewers see the cap before submitting), but the
server is the source of truth — never trust the client.

### Solana rail: `/api/bookings/authorize-solana`

Add a guard block before the existing booking-create logic:

```ts
// 1. Per-booking cap
if (priceValueUsd > Number(process.env.SOLANA_BOOKING_MAX_USD ?? '50')) {
  return NextResponse.json({ error: 'cap_exceeded', cap: 'per_booking' }, { status: 400 });
}

// 2. Per-streamer TVL cap
const tvl = await sumActiveEscrowsForStreamer(profileId, 'solana');
if (tvl + priceValueUsd > Number(process.env.SOLANA_STREAMER_TVL_MAX_USD ?? '500')) {
  return NextResponse.json({ error: 'cap_exceeded', cap: 'streamer_tvl' }, { status: 400 });
}

// 3. Per-streamer 24h volume cap
const dailyVolume = await sumStreamerVolume24h(profileId, 'solana');
if (dailyVolume + priceValueUsd > Number(process.env.SOLANA_STREAMER_DAILY_MAX_USD ?? '1000')) {
  return NextResponse.json({ error: 'cap_exceeded', cap: 'streamer_daily' }, { status: 400 });
}

// 4. Whitelist
const profile = await loadProfile(profileId);
if (!profile.solana_enabled) {
  return NextResponse.json({ error: 'solana_not_enabled' }, { status: 403 });
}
```

### Stripe rail: `/api/stripe/authorize`

Same pattern but only the per-booking cap applies (no TVL cap because
Stripe holds the funds itself, no whitelist):

```ts
if (priceValueUsd > Number(process.env.STRIPE_BOOKING_MAX_USD ?? '200')) {
  return NextResponse.json({ error: 'cap_exceeded', cap: 'per_booking' }, { status: 400 });
}
```

### Helper functions in `src/lib/caps.ts` (new file)

```ts
export async function sumActiveEscrowsForStreamer(
  profileId: string,
  rail: 'solana' | 'stripe'
): Promise<number> {
  // SELECT SUM(price_value) FROM bookings
  //  WHERE profile_id = $1 AND payment_method = $2
  //    AND status IN ('pending', 'active')
}

export async function sumStreamerVolume24h(
  profileId: string,
  rail: 'solana' | 'stripe'
): Promise<number> {
  // SELECT SUM(price_value) FROM bookings
  //  WHERE profile_id = $1 AND payment_method = $2
  //    AND created_at > now() - interval '24 hours'
}

export async function checkProgramTvlAlarm(): Promise<void> {
  // Called from the existing solana-reconciler cron.
  // Queries Solana RPC for vault ATA balances, sums, alerts if > threshold.
}
```

### Frontend mirrors

In `src/app/overlay/_components/BookingForm.tsx`:

- Cap the duration slider at `min(slot.max_duration_minutes, capPerBookingUsd / pricePerMinuteUsd)`
- Show an alpha-software banner: "CASI is in capped alpha — bookings limited to $50 max while we complete our security audit."
- If the per-streamer TVL cap blocks a booking, surface the error toast: "This streamer is at the alpha cap — try again in a few minutes."

---

## User-facing communication

### Banner on every booking surface

Persistent footer note in the viewer flow:

> CASI is in **capped alpha** while our smart contract audit is in progress.
> Maximum **$50 per beam** on Solana, **$200 per beam** on card. Caps lift
> after audit completes. [Learn more →]

### "Learn more" page (new)

`/legal/alpha-caps` or similar. Explains:
- Why caps exist (audit pending, deliberate risk containment)
- What's capped (per-booking, per-streamer, daily)
- That funds are still 100% direct viewer→streamer (no protocol fee changed)
- Removal timeline (post-audit, gradually lifted)
- Who's audited the code (named firm + estimated timeline)

This is also good marketing material for grant applications, hackathon
submissions, and Superteam intros — demonstrates serious engineering
posture vs YOLO mainnet.

### Streamer-side explanation in onboarding

In the streamer setup flow (`/studio/setup`), add a step explaining the
caps before they choose to enable Solana:

> Solana payouts are capped during alpha. Each beam is limited to $50 USDC,
> and your total active escrows are capped at $500. We're working through
> a security audit and will lift caps as it completes. Stripe payouts (USD
> on card) are capped at $200 per booking but have no streamer total cap.

### Status page

Public `/status` page showing:
- Current program TVL (transparent, no need to hide it)
- Audit status (in-progress / scheduled / completed + report link)
- Cap thresholds (current values)
- Last incident (none yet, hopefully)

---

## Removal path (post-audit)

When the audit completes and remediation is merged, lift the caps in
**stages** rather than all at once. Each stage gates on the previous one
running clean for the stated window.

| Stage | Trigger | Caps |
|---|---|---|
| 0 (current) | Pre-audit | $50 / $500 / $1k |
| 1 | Audit clean, day 0 | 2× → $100 / $1k / $2k |
| 2 | One week clean | 5× → $250 / $2.5k / $5k |
| 3 | Two weeks clean | Caps removed entirely |

"Clean" = no on-chain incidents, no anomalous TVL spikes, no streamer
complaints about settle/refund discrepancies.

Whitelist (`profiles.solana_enabled`) lifts at stage 1 — once audit clears,
new streamers can opt into Solana without invitation.

Cap removal is **just an env var change**: `SOLANA_BOOKING_MAX_USD=250`.
No deploy needed if Vercel env vars are configured to hot-reload, or one
deploy at most.

---

## Implementation roadmap

If/when this gets greenlit, here's the build order:

### Phase 0 — schema + helpers

- Migration: `ALTER TABLE profiles ADD COLUMN solana_enabled BOOLEAN NOT NULL DEFAULT false;`
- Migration: `CREATE INDEX bookings_profile_active_idx ON bookings (profile_id, payment_method, status) WHERE status IN ('pending', 'active');` (for the TVL sum query)
- New file: `src/lib/caps.ts` with `sumActiveEscrowsForStreamer`, `sumStreamerVolume24h`, `checkProgramTvlAlarm`
- New file: `src/lib/cap-config.ts` reads env vars, exports `CAPS` object

### Phase 1 — server-side enforcement

- Add cap guards to `/api/bookings/authorize-solana` (4 checks)
- Add cap guard to `/api/stripe/authorize` (1 check)
- Wire `checkProgramTvlAlarm` into the existing `/api/cron/solana-reconciler`
- Unit tests for the cap helpers in `tests/unit/caps.test.ts`

### Phase 2 — frontend mirrors

- `BookingForm.tsx` — cap duration slider + show alpha banner
- New page `/legal/alpha-caps` (or under `/legal/` whichever convention)
- New page `/status` showing live TVL + audit status
- Update streamer setup flow with the alpha disclosure

### Phase 3 — go-live

- Whitelist initial cohort (founder manually flips `solana_enabled`)
- Deploy to mainnet
- Monitor `cranker-monitor` cron, `solana-reconciler` cron, `ERROR_WEBHOOK_URL` for one week
- Onboard next cohort if clean

**Estimated effort**: ~2-3 days of build, ~1 week of soak time before
opening to non-whitelisted streamers.

---

## What this enables strategically

### Funding path becomes self-sustaining

Capped mainnet → onboard streamers → Pro-tier SaaS upsell once the cohort
is real → Pro MRR funds the audit. The math from `pro-tier-plan.md`:

- 100 Pro streamers × $19/mo × 12 months = $22,800/yr → covers Sec3's quote
- 200 Pro streamers × $19/mo × 12 months = $45,600/yr → covers audit + remediation + ongoing dev

Without capped mainnet, there's nowhere to find 100 Pro streamers, because
the product isn't on mainnet yet.

### Hackathon and Superteam pitches improve

"Mainnet, capped, audit pending" is a credible posture for hackathon judges
and Superteam intros. "Devnet, audit pending, no users" is not.

### Grant application becomes more credible (if reapplying)

If the foundation rejects this round, a future application reads better with
"we shipped capped mainnet, here's six months of usage data, the audit
budget needs $X" than "we plan to ship after the audit."

### Audit firms take you more seriously

A program with real on-chain usage is easier to scope and quote. Sec3's
own advice ("get PMF before audit") lines up with this — they want to
audit programs people actually use.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Bug in `casi-escrow` causes loss within the cap | Caps mean per-incident loss is bounded at $500/streamer × N streamers; insurance-grade risk, not bankruptcy-grade |
| Streamer reaches cap and is annoyed | Alpha banner sets expectation; cap raises clearly communicated; Pro tier could later offer cap upgrades for paying streamers |
| Cap evasion via multi-account abuse | Same cap applies per `profile_id`; multi-accounting requires multiple full signups; rate-limit on signup IP already exists |
| Caps get bypassed via direct on-chain interaction | The Anchor program itself has no caps; a sophisticated viewer could call `start_beam` directly with $5k. Mitigation: program-level cap added during the audit phase, OR rely on the fact that direct on-chain interaction requires off-platform booking infra (no overlay slot to claim, viewer's media never displays). Acceptable risk because there's no economic incentive to do this. |
| Audit takes longer than runway | Cap removal stage 1 doesn't require audit complete — just "no incidents on capped mainnet for N weeks." Could relax to 2× cap autonomously based on operational confidence. |

---

## What we're explicitly NOT doing

- **Adding caps to the Anchor program.** It's frozen pending audit. Per
  AGENTS.md: "Don't refactor the Anchor program before the audit." The
  application-layer caps are the right tool because they're removable
  without re-deploying or re-auditing the program.
- **Adding a "premium plan" that lifts caps.** Caps are a safety mechanism,
  not a feature gate. Selling cap relief monetizes the wrong thing and
  contradicts the "100% to streamer, no protocol fees" pitch.
- **Hiding caps from users.** Transparent alpha posture is more trust-
  building than pretending the constraint doesn't exist.
- **Lifting all caps at once when audit completes.** Stage the relax — the
  audit reduces software risk but doesn't reduce operational risk
  (incident response, refund handling) immediately.
- **Capping flashes.** Flashes are smaller-amount, faster lifecycle, and
  the on-chain primitive's failure modes are simpler. The booking-side
  caps cover the high-exposure surface; flashes can run uncapped.

---

## Open questions

- **Cap values are working assumptions, not validated numbers.** $50/$500/$1k
  feels right but isn't backed by data. Could be more conservative (e.g.
  $25/$250) for the first week and bump up if no issues.
- **Should Stripe rail also have a per-streamer TVL cap?** Stripe holds
  funds itself (low CASI risk), but a streamer with $20k of pending Stripe
  charges has its own operational risk story. Probably not worth a cap
  here since it's not a CASI safety issue.
- **Status page in production?** Adds operational overhead but builds
  trust. Could ship the alpha-caps explainer page without the live status
  page initially.
- **Insurance / reserve?** A treasury reserve (founder-funded, $500-$1000)
  to cover incident-related refunds could let the alpha message read as
  "we'll make you whole if something goes wrong" rather than "you accept
  the alpha risk." Adds founder cash exposure but might significantly
  improve perceived trust.

---

## When this gets revisited

- After founder decides to actually push mainnet (currently devnet-only)
- After Pro-tier feature direction is locked in (so Pro pricing tier
  decisions don't conflict with the alpha-cap messaging)
- After founder has confirmed at least one streamer cohort committed to
  trying mainnet (no point launching to nobody)

Until then: this doc is the design. Don't ship from it.
