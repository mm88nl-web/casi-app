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

Who can call what. This is the entire surface area — the rest of the
program is accounts and math.

| Instruction              | Caller(s)                               | Purpose                                                           |
|--------------------------|-----------------------------------------|-------------------------------------------------------------------|
| `initialize_escrow`      | buyer                                   | Deposits USDC, creates PDA + vault, records duration.             |
| `cancel_escrow`          | buyer (only while Pending)              | Buyer self-refund, 100%.                                          |
| `approve_flash`          | provider                                | Flash (one-shot tip) → 100% to provider.                          |
| `deny_flash`             | provider                                | One-shot denial, 100% refund.                                     |
| `start_beam`             | provider                                | Starts the vesting clock.                                         |
| `start_beam_delegated`   | provider's pre-registered session key   | Same as `start_beam`, signed by a scoped ephemeral key.           |
| `settle_beam`            | buyer OR provider OR (anyone post-dur.) | Settles at current `vested`. Permissionless after duration.       |
| `set_delegate`           | provider                                | Registers a session key allowed to call `start_beam_delegated`.   |
| `revoke_delegate`        | provider                                | Invalidates the registered session key.                           |
| `cancel_stale_pending`   | **anyone**, but only past 7-day stale   | Refunds buyer when provider abandoned a Pending escrow.           |

The three permissionless paths (`settle_beam` post-duration,
`cancel_stale_pending`, and the `set_delegate`-scoped `start_beam_delegated`)
are the three places the program deliberately opens liveness to the public.
Everything else is `has_one` constrained to the buyer or provider.

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
`start_beam_delegated` and nothing else. It cannot withdraw funds, cannot
cancel pending escrows, cannot change the delegate registration.
Compromise of the session key costs the provider at most a griefed start
call; it never costs the funds. Providers can revoke at any time with
`revoke_delegate`.

CASI's production setup uses mode 2 with a platform-owned cranker
funded with ~0.05 SOL. Forks that don't want to operate a cranker can
ship mode 1 and get a popup-per-action product. Forks that want
truly gasless interactions can plug in a paymaster relayer without
modifying the program.

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
   pubkey and expiry under a PDA keyed by the provider. The only
   instruction that honors it is `start_beam_delegated`, and that
   instruction does not move funds — it only flips status + stamps
   `start_timestamp`.
5. **CPI surface is two programs.** `token_interface` (`transfer_checked`,
   `close_account`) and the associated-token-program. No user-supplied
   program IDs, no arbitrary CPI.

---

## License

Apache-2.0. Fork it, plug it into your own product, tell us what
breaks.
