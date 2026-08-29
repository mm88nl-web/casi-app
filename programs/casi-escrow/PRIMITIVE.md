# CASI Escrow as a general time-boxed payment primitive

CASI ships a consumer product — viewers pay to put media on stream — but the
Anchor program underneath is a general-purpose primitive that solves a
recurring problem in pay-per-minute markets:

> Two parties want to exchange USDC for a bounded period of service.
> Neither fully trusts the other, neither wants to babysit a timer,
> and any refund/vesting math must be verifiable on-chain.

The program enforces the economics; everything else (UI, scheduling,
matchmaking, notifications) is application code. This document explains
the primitive, the optional server-side "cranker" we use for UX, and the
set of usecases it generalizes to beyond CASI.

---

## What the program guarantees

For every escrow the chain enforces:

1. **Funds are locked in a program-owned PDA vault** from the moment the
   buyer (we call them "viewer") deposits until a settlement instruction
   runs. No off-chain party can move the USDC.
2. **Linear vesting, capped by duration**:
   `vested = total × min(elapsed, duration) / duration`.
   Overflow-safe (`u128` intermediates, `checked_sub`).
3. **Bounded liveness**. If the service provider ("streamer") never
   starts, the buyer can reclaim at any time. If the provider starts but
   neither side calls settlement, **anyone** can crank settlement after
   `duration` elapses. Funds cannot be locked forever by either party.
4. **Anti-grief on early settle**. Before `duration` elapses, only the
   two original parties may settle. Random third parties cannot force an
   early exit. After `duration`, the crank is permissionless.
5. **Stale-pending recovery**. If the provider never approves, any
   signer can close the escrow and refund the buyer after
   `PENDING_TIMEOUT_SECS` (7 days). No buyer ever loses access to funds
   because they closed a tab.
6. **Versioned state**. Every account carries a layout version; every
   handler checks it. Program upgrades that change layout reject legacy
   accounts explicitly rather than silently mis-decoding them.

---

## Instruction × caller matrix

Who can call what. **Corrected 2026-08-10** — this table claimed to be "the
entire surface area" while missing 5 of 16 instructions (the whole config
system, plus the Flash delegated twins). Re-derive from `src/lib.rs`
(`grep -n "    pub fn " src/lib.rs`) if it drifts again.

| Instruction              | Caller(s)                               | Purpose                                                           |
|--------------------------|-----------------------------------------|-------------------------------------------------------------------|
| `initialize_config`      | deployer (must be upgrade authority)    | One-time. Sets accepted mint, admin, per-escrow cap/floor.        |
| `update_config`          | admin                                   | Adjusts `paused` / `max_escrow_amount` / `min_escrow_amount`.     |
| `transfer_admin`         | admin                                   | Rotates the admin key.                                            |
| `register_streamer`      | provider                                | One-time opt-in. Required before `initialize_escrow` will accept this provider as a target — see below. |
| `unregister_streamer`    | provider                                | Reverses registration for new escrows; existing ones are unaffected. |
| `initialize_escrow`      | buyer                                   | Deposits USDC, creates PDA + vault, records duration. Also pre-funds a small SOL buffer — see "ATA-rent buffer" below. |
| `cancel_escrow`          | buyer (only while Pending)              | Buyer self-refund, 100%.                                          |
| `approve_flash`          | provider                                | Flash (one-shot tip) → 100% to provider.                          |
| `deny_flash`             | provider                                | One-shot denial, 100% refund.                                     |
| `approve_flash_delegated`| provider's pre-registered session key   | Same as `approve_flash`, signed by a scoped ephemeral key.        |
| `deny_flash_delegated`   | provider's pre-registered session key   | Same as `deny_flash`, signed by a scoped ephemeral key.           |
| `start_beam`             | provider                                | Starts the vesting clock.                                         |
| `start_beam_delegated`   | provider's pre-registered session key   | Same as `start_beam`, signed by a scoped ephemeral key.           |
| `settle_beam`            | buyer OR provider OR (anyone post-dur.) | Settles at current `vested`. Permissionless after duration.       |
| `settle_beam_delegated`  | provider's pre-registered session key   | Same effect as `settle_beam`, signed by the scoped ephemeral key. |
| `set_delegate`           | provider                                | Registers a session key allowed to call the delegated twins.      |
| `revoke_delegate`        | provider                                | Invalidates the registered session key.                           |
| `cancel_stale_pending`   | **anyone**, but only past 7-day stale   | Refunds buyer when provider abandoned a Pending escrow. Beam only. |

The permissionless paths (`settle_beam` post-duration,
`cancel_stale_pending`) and the session-key twins (`start_beam_delegated`,
`settle_beam_delegated`) are the places the program deliberately opens
liveness to the public or to a narrowly-scoped ephemeral key. Everything
else is `has_one` constrained to the buyer or provider.

---

## The cranker is an optional UX knob, not a dependency

CASI's deploy docs require `SOLANA_CRANKER_KEYPAIR`. Reviewers should
understand **this is a UX choice, not a protocol requirement**. The
program does not know the cranker exists.

### Three operating modes

| Mode                       | Who pays fees              | Who signs                  | What the user experiences                           |
|----------------------------|----------------------------|----------------------------|-----------------------------------------------------|
| **Fully wallet-signed**    | each party (own wallet)    | buyer / provider wallets   | Wallet popup for every action. Works today with zero server-side signing infrastructure. |
| **Delegated provider**     | shared server fee-payer    | provider signs once per ~30d to register delegate; server co-signs per action | Provider approves in-product without a popup. Buyer still signs own deposits. |
| **Fully gasless**          | relayer / paymaster        | relayer co-signs           | Future work. Protocol already supports it — any caller that can pay fees + co-sign the session key works. |

The delegation model is scoped: the session key can call
`start_beam_delegated`, `settle_beam_delegated`, `approve_flash_delegated`,
and `deny_flash_delegated` — nothing else. It cannot withdraw funds outside
the vesting schedule, cannot cancel pending escrows, cannot change the
delegate registration. Both delegated calls
run the same vesting math as their wallet-signed twins; a compromised
session key can at worst force an early settle at the current `vested`
point (funds split per the schedule, no theft). Providers can revoke at
any time with `revoke_delegate`.

CASI's production setup uses mode 2 with a platform-owned cranker
funded with ~0.05 SOL. Forks that don't want to operate a cranker can
ship mode 1 and get a popup-per-action product. Forks that want
truly gasless interactions can plug in a paymaster relayer without
modifying the program.

---

## Provider registration — required before anyone can target you

`initialize_escrow`'s `streamer` account is an unchecked, unsigned pubkey
chosen entirely by the buyer — by design, since the provider only needs to
act *later* (`start_beam`/`approve_flash`), not at deposit time. Without any
further check, that means a stranger could open a Pending escrow "against"
any pubkey at all, including one that never opted into this program.
`register_streamer` closes that: `initialize_escrow` requires a
`StreamerRegistry` account to already exist for whatever `streamer` pubkey
is targeted.

This is a **one-time opt-in, not a per-booking requirement** — it doesn't
reintroduce "the provider must be present at booking time." A provider
registers once (during onboarding/wallet-connect, in whatever app is built
on top), and every booking after that still needs zero live participation
from them until they choose to act. `unregister_streamer` reverses it for
*future* escrows only; anything already open against a provider settles
normally regardless of registration status, the same non-retroactive spirit
as `update_config`'s pause flag.

## ATA-rent buffer — who pays for a fresh counterparty's token account

Several instructions (`settle_beam`, the delegated Flash/Beam twins,
`cancel_stale_pending`) use `init_if_needed` to create the counterparty's
USDC associated-token-account if it doesn't exist yet — a real SOL cost
(~0.002 SOL, the ATA rent-exemption minimum) that has nothing to do with the
escrow's own size. Left unaddressed, whoever processes someone else's
escrow (a shared cranker, or any permissionless post-duration caller) eats
that cost personally, regardless of whether the escrow moved $0.0001 or
$1,000 — a real problem to fix if you fork this and don't want to bleed SOL
running a cranker.

The fix: `initialize_escrow` pre-collects a SOL buffer from the buyer (1x
ATA-rent for Flash, 2x for Beam — sized for `settle_beam`'s worst case of
both counterparty ATAs needing creation in the same call) into the escrow's
own PDA balance. Every settle-shaped instruction then reimburses whoever
actually processes it — `reimburse_ata_rent` in `lib.rs` — out of that
buffer, capped at what's actually there. Any portion never spent (the
common case: most counterparties already have an ATA after their first
payment) returns to the buyer along with the rest of the escrow's rent when
it closes, exactly as before this existed.

This is a deliberately simple, **unconditional** flat reimbursement rather
than trying to detect precisely which ATA(s) were freshly created this
call — Anchor's account-constraint processing happens before your handler
body runs, so there's no clean signal to check that without abandoning
`init_if_needed`'s declarative sugar for manual CPI. The tradeoff: whoever
processes a `settle_beam` on an escrow where the counterparty ATAs happened
to already exist gets a small windfall (up to one ATA-rent's worth) instead
of the buyer getting 100% of the unused buffer back. We consider this a
feature, not a bug, for a permissionless primitive — it's a genuine
(self-funded, bounded, never drawn from anyone but that escrow's own buyer)
incentive for third-party cranks to exist independent of any one
platform's own infrastructure, which is exactly the kind of resilience a
"generic reusable primitive" should want. Fork and change this if your
usecase wants the stricter behavior instead.

---

## What this generalizes to

The primitive is "buyer locks funds for a bounded duration of a
service, provider starts a clock, vesting is linear, post-duration
settle is permissionless." That shape recurs across many Solana
usecases:

### Pay-per-minute consulting / coaching

- Buyer books a 30-minute session at X USDC.
- Consultant calls `start_beam` when the call begins.
- If consultant drops after 10 minutes, either party calls
  `settle_beam` → consultant paid for 10 minutes, buyer refunded for 20.
- If the session runs the full duration, anyone cranks at t+30 min.

### Tutoring marketplaces

- Same shape as consulting. Vesting cap prevents a tutor from "running
  the clock" past an agreed end; permissionless settle prevents a
  buyer from stalling payment after the session.

### Compute / GPU rentals

- Renter locks funds for a 1-hour slot.
- Provider starts the VM and calls `start_beam`.
- If the VM dies partway, renter settles to reclaim unvested time.
- Post-duration, billing happens permissionlessly with no ops team in
  the loop.

### Content access windows

- Buyer pays to unlock premium content for N hours.
- The provider calls `start_beam` when access is granted (authenticated
  URL issued, download link generated, etc.).
- Post-duration settle runs automatically — the same crank can be
  called by any indexer / cron / script, including one the buyer runs
  themselves.

### Livestream tipping with on-stream guarantees (CASI's own usecase)

- Viewer pays for 5 minutes of screen time.
- Streamer calls `start_beam` when the overlay goes live.
- Kick-early settles pro-rata, no-show refunds via
  `cancel_stale_pending`.

In each case the **product UX layer changes completely** — different
frontends, different matchmaking, different notifications — but the
economic primitive is identical. The program ships as an Anchor
workspace; anyone can plug it into their own product.

---

## Properties that differentiate this from a generic "escrow"

- **Time-bounded, not transaction-bounded.** Most on-chain escrows
  settle on a single signal (a trade, an arbiter vote). This one
  settles on a duration. That turns it into a primitive for services,
  not just trades.
- **Linear vesting with permissionless post-duration crank.** The
  combination means neither party can extort the other by refusing to
  sign settlement. Either settles early by mutual consent; time forces
  the issue otherwise.
- **Scoped session keys baked into the program.** Most dApps that
  want gasless UX bolt a relayer on top. Here, `set_delegate` /
  `start_beam_delegated` live in the program itself with a narrow
  authority scope. Session keys can't do anything except start beams
  for the specific provider that registered them.
- **Versioned state from day one.** Future upgrades can introduce new
  layouts without silently corrupting old accounts.
- **Zero platform fee on-chain.** The program itself takes nothing. Any
  fee model is an application-layer concern (swap the destination ATA,
  or split in a second instruction).

---

## Audit surface (same as the main README, restated for the primitive claim)

An auditor evaluating "is this safe to use as a payment primitive in a
product that is not CASI?" should verify:

1. **The state machine cannot be bypassed.** Every transition is guarded
   by an explicit `require!` on `status` + `version`.
2. **Vesting math saturates cleanly at the bounds.** `elapsed.min(duration)`
   prevents over-vesting; `total.checked_sub(vested)` prevents underflow.
3. **Permissionless paths do exactly what they claim.** `settle_beam`
   after duration splits 100% to the provider; `cancel_stale_pending`
   after 7 days refunds 100% to the buyer. Neither can be called
   earlier, neither can drain to the caller.
4. **Delegate authority does not leak.** `set_delegate` stores a session
   pubkey and expiry under a PDA keyed by the provider. Only
   `start_beam_delegated` and `settle_beam_delegated` honor it. Neither
   can move funds outside the vesting schedule — start only flips status
   + stamps `start_timestamp`, settle runs the same `vested =
   total × min(elapsed, duration) / duration` formula as wallet-signed
   settle. The session key never controls the refund destination.
5. **CPI surface is two programs.** `token_interface` (`transfer_checked`,
   `close_account`) and the associated-token-program. No user-supplied
   program IDs, no arbitrary CPI.
6. **TransferHook is checked once, at deploy time — this is a real
   TOCTOU gap if your mint isn't classic SPL Token.** `initialize_config`
   rejects a Token-2022 mint that already has a TransferHook extension
   configured (a hook executes arbitrary code during every
   `transfer_checked` CPI this program makes — approve, deny, settle,
   cancel). It does **not** re-check later. If your `accepted_mint` is a
   Token-2022 mint with a *retained* extension-update authority, that
   authority could attach a hook after this check passes, and the program
   has no mechanism to notice or react. **This doesn't affect CASI's own
   deployment** — CASI's `accepted_mint` is real USDC, a classic SPL Token
   mint, which cannot grow extensions at all, ever, regardless of anyone's
   intent. If you fork this with a Token-2022 stablecoin, either use a mint
   whose update authority has been permanently renounced, or add your own
   periodic re-verification — this program doesn't do it for you.

---

## License

Apache-2.0. Fork it, plug it into your own product, tell us what
breaks.
