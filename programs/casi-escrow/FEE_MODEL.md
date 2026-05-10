# Per-escrow platform fee split — phase-4 design note

> **Status**: design only. Not implemented. Do not ship until the triggers
> in the "When to build" section below are hit.

The escrow program today routes 100% of vested funds to the streamer on
`settle_beam` / `settle_beam_delegated` / `approve_flash`. `PRIMITIVE.md`
advertises this as a property: *"Zero platform fee on-chain. The program
itself takes nothing."* That claim exists because hardcoding a
CASI-specific fee would make the primitive opinionated and useless to
anyone forking it for their own usecase (consulting, compute rentals,
tutoring, etc.).

This note describes how to add an **opt-in, per-escrow, caller-supplied**
fee split that preserves the neutral-primitive framing while giving CASI
(and any other product built on this program) a revenue rail.

---

## Design

The viewer's `initialize_escrow` call accepts two new optional
parameters:

- `fee_bps: u16` — basis points of each settlement that routes to a fee
  recipient instead of the streamer. `0` means no fee (current
  behavior). Hard-capped at `MAX_FEE_BPS = 2_000` (20%) to prevent a
  malicious frontend from proposing a 100% fee that funnels everything
  to itself.
- `fee_recipient: Pubkey` — the wallet whose ATA receives the fee cut.
  Validated to have an associated token account for the same
  `usdc_mint` as the vault.

Both values are **stored on the `EscrowState` PDA** at init time and
cannot be changed afterward. Once a viewer has deposited, the fee split
they agreed to is frozen — the streamer can't later rug them by pointing
the fee recipient at a different wallet, and the platform can't
retroactively change the take rate.

Settlement instructions (`settle_beam`, `settle_beam_delegated`,
`approve_flash`) compute:

```
fee_amount     = vested × fee_bps / 10_000
streamer_cut   = vested − fee_amount
viewer_refund  = total − vested     // unchanged
```

Three `transfer_checked` CPIs fire in one tx: vault → streamer_ata,
vault → fee_recipient_ata, vault → viewer_ata (if any). The second CPI
is skipped when `fee_bps == 0`, so existing zero-fee escrows save one
CPI + one account.

The `fee_recipient_ata` account is added to each settlement accounts
struct as `init_if_needed` so the platform doesn't have to pre-create
treasury ATAs for every mint / chain. The viewer's initialize tx doesn't
pay for this — only the party initiating settle (streamer or cranker)
does.

---

## Why this preserves the neutral-primitive framing

The primitive's "neutral" claim rests on two properties:

1. **The program has no opinion about business model.** A fork for a
   tutoring platform doesn't inherit CASI's take rate. With per-escrow
   caller-supplied fees, this remains true — the tutoring app's
   frontend passes `fee_bps = 0` (or its own value) on every
   `initialize_escrow`. The program is a mechanism, not a policy.
2. **The chain decides where funds go, not the platform.** Same as
   today. The viewer's `initialize_escrow` tx commits the fee split to
   the account; every subsequent settle reads it back. No off-chain
   discretion, no platform wallet in the middle.

What changes:

- PRIMITIVE.md's "zero platform fee on-chain" claim softens to "zero
  **default** platform fee; fee split is caller-configured per escrow,
  capped at 20%." That's a strictly more generalizable primitive. The
  grant pitch actually strengthens: the primitive now supports
  **opinionated applications** without being opinionated itself.

---

## Program changes (`programs/casi-escrow/src/lib.rs`)

1. **State layout bump**. Add `fee_bps: u16` and `fee_recipient:
   Pubkey` to `EscrowState`. Version-bump `ESCROW_STATE_VERSION` from
   whatever it currently is to +1. Legacy accounts (version N) decode
   cleanly with `fee_bps = 0` and `fee_recipient = Pubkey::default()`
   to preserve backward compatibility — the settle handlers check
   `fee_bps > 0` before reading the recipient.

2. **`initialize_escrow` signature**. Add two args:
   ```rust
   pub fn initialize_escrow(
       ctx: Context<InitializeEscrow>,
       escrow_id: [u8; 32],
       total_amount: u64,
       duration_secs: u64,
       escrow_type: u8,
       fee_bps: u16,              // NEW
       fee_recipient: Pubkey,     // NEW
   ) -> Result<()>
   ```
   Validate `fee_bps <= MAX_FEE_BPS`. Reject with new
   `CasiError::FeeBpsExceedsMax`. If `fee_bps == 0`, `fee_recipient` is
   ignored (can be `Pubkey::default()`); otherwise the frontend must
   supply a real key.

3. **Settlement handlers**. `settle_beam`, `settle_beam_delegated`,
   `approve_flash` each:
   - Compute `fee_amount` via `u128` intermediates (same overflow-safe
     pattern as the existing `vested` math).
   - `transfer_checked` from vault → streamer_ata for
     `vested − fee_amount`.
   - If `fee_bps > 0`: second `transfer_checked` from vault →
     `fee_recipient_ata` for `fee_amount`.
   - (settle_beam only) third `transfer_checked` from vault → viewer_ata
     for `total − vested` if non-zero — unchanged from today.

4. **Accounts struct changes**. `Settle`, `SettleBeamDelegated`,
   `ApproveFlash` each gain:
   ```rust
   #[account(
       init_if_needed,
       payer = <streamer | cranker>,  // matches existing init_if_needed payer
       associated_token::mint      = usdc_mint,
       associated_token::authority = fee_recipient,
       associated_token::token_program = token_program,
   )]
   pub fee_recipient_ata: InterfaceAccount<'info, TokenAccount>,

   /// CHECK: validated via fee_recipient_ata::authority
   pub fee_recipient: AccountInfo<'info>,
   ```
   Constraint: `fee_recipient.key() == escrow_state.fee_recipient`.
   When `fee_bps == 0` the ATA is still init'd-if-needed for
   consistency, but the transfer is skipped.

5. **New error variants**:
   - `FeeBpsExceedsMax` — initialize with bps > MAX_FEE_BPS
   - `FeeRecipientMismatch` — settle called with a fee_recipient_ata
     whose authority differs from `escrow_state.fee_recipient`
   - `FeeRecipientMintMismatch` — ATA's mint differs from vault's mint

---

## App changes

**`src/lib/casi-escrow.ts`**:
- Extend `InitializeEscrowParams` with optional `feeBps` + `feeRecipient`.
- Update `buildInitializeEscrowIx` to pass them through.
- Extend `SettleBeamIxParams` / `SettleBeamDelegatedIxParams` /
  `ApproveFlashParams` with `feeRecipient` (derived back from the
  `EscrowState` via `fetchEscrowState` if the caller doesn't already
  have it). Add the `fee_recipient_ata` account derivation.

**`src/app/api/bookings/create-solana/route.ts`**:
- Read `PLATFORM_FEE_BPS` (e.g., `250` = 2.5%) and
  `PLATFORM_TREASURY_WALLET` from env.
- Pass them into the initialize instruction returned to the client.
- Reject misconfigured envs loudly (don't silently initialize at
  `fee_bps = 0` when the platform meant to charge).

**`src/lib/solana-network.ts`**:
- Add `platformTreasuryWallet()` and `platformTreasuryAta(mint)`
  helpers.
- Validate at module load that `PLATFORM_TREASURY_WALLET` is set when
  `PLATFORM_FEE_BPS > 0`.

**`src/app/admin/page.tsx`**:
- `settleBeam` / `settleBeamDelegated` / kick / deny paths: fetch the
  `EscrowState` to get `fee_recipient`, pass it through to the client
  builder. Or cache on the booking row at create time for fewer RPCs.

**`src/app/api/solana/delegates/start-beam/route.ts`**: no change —
start_beam doesn't touch fees.

**`src/app/api/solana/delegates/settle-beam/route.ts`**: load
`fee_recipient` from `escrow_state` before building the ix.

**Helius webhook** (`src/app/api/webhooks/solana/route.ts`): no change —
DB status flip is identical whether or not a fee was taken. If you want
platform revenue reporting, add a `fee_amount_lamports` column on
`bookings` and parse it from the inner transfer in the webhook parser,
but that's optional and non-blocking.

**Decoder** (`src/lib/casi-escrow-decoder.ts`): no change.
Discriminators are unchanged; only the account list + data layout
shifts, and neither is parsed by the decoder.

---

## Test plan

New tests in `tests/casi-escrow.ts`:

1. **Zero-fee parity**. Initialize with `fee_bps = 0`, settle, verify
   streamer receives full vested amount — identical to existing tests.
2. **2.5% fee, full duration**. Initialize with `fee_bps = 250`, wait
   until `t >= duration`, crank settle, verify streamer gets 97.5% of
   total, treasury gets 2.5%, viewer gets 0. Conservation check.
3. **2.5% fee, pro-rata settle**. Same but settle at `t = duration/2`.
   Verify split: streamer gets 97.5% of half, treasury gets 2.5% of
   half, viewer gets half.
4. **MAX_FEE_BPS boundary**. Initialize with `fee_bps = 2_000` →
   succeeds. Initialize with `fee_bps = 2_001` → rejected with
   `FeeBpsExceedsMax`.
5. **Fee recipient mismatch**. Initialize with recipient A, settle
   with ATA belonging to recipient B → rejected with
   `FeeRecipientMismatch`.
6. **Fee recipient mint mismatch**. ATA exists but for a different
   mint → rejected with `FeeRecipientMintMismatch`.
7. **Version migration**. Manually write a legacy `EscrowState` with
   the old version byte; verify settle decodes it with `fee_bps = 0`
   and pays 100% to streamer without reverting.
8. **Flash with fee**. `approve_flash` with 2.5% fee → streamer gets
   97.5%, treasury gets 2.5%, viewer gets 0. `deny_flash` → unchanged
   (full refund, fee is zero).
9. **Delegated settle with fee**. `settle_beam_delegated` honors the
   fee split identically to wallet-signed settle.

Every test that already exists for `settle_beam` etc. keeps passing
because they initialize with `fee_bps = 0` implicitly.

---

## Migration path

1. Deploy new program version to devnet. Run full test suite.
2. Deploy to mainnet as a **separate program** at a new address —
   don't upgrade in place. Why: the state-layout bump is technically
   backward-compatible at decode time, but the anchor macro doesn't
   guarantee that across a program upgrade if the account size
   changes. Cleanest path is deploy-new-program, flip the
   `NEXT_PUBLIC_CASI_PROGRAM_ID` env var, and let old escrows settle
   under the old program. New bookings land on the new one.
3. Coexistence window: ~2 weeks. Old program keeps running; no one
   creates new escrows on it. Once all in-flight escrows on the old
   program have settled or been cancel-stale-crank'd, retire it.
4. Update `CasiEscrowClient` to accept both program IDs and route
   based on the booking's `program_id` column (add this column to
   `bookings` as part of the migration).

---

## When to build

Triggers — don't start before any of these:

- **$10k cumulative volume** on mainnet. A 2.5% fee on that would be
  $250 — still barely covers the lawyer memo, but it's the point at
  which the cranker's $7.50/month starts to feel real per-streamer.
- **Grant awarded** and the grant narrative no longer depends on
  "zero fee" framing. (In practice this design strengthens the
  narrative, so this shouldn't be a blocker.)
- **First streamer asks to pay you**. Sounds joky but it happens —
  streamers on platforms they like often volunteer a tip or sub-fee
  to keep the ops alive. That's the strongest signal that a formal
  fee is welcome.
- **Incorporation + legal memo complete**. Don't turn on revenue
  until the entity collecting it exists and has a blessed opinion
  that the on-chain split model isn't MTL-triggering in your
  jurisdiction. $3–5k one-time cost; don't skip.

Until then: platform cranker eats the ~$7.50/month fee cost. It's
noise.

---

## Alternatives considered

- **Hardcoded fee in the program** (`PLATFORM_FEE_BPS = 250` as a
  compile-time constant). Rejected: kills the neutral-primitive
  framing; forks inherit CASI's take; can't be changed without a
  program upgrade.
- **Governance-settable fee via a PDA**. Too much machinery for a
  single-operator platform. Could add later if needed.
- **Off-chain fee collection** (platform sweeps streamer's USDC after
  settle). Rejected: this IS custody-adjacent. Forces a platform
  wallet in the money path, weakens the non-custodial story, and adds
  a second tx + streamer signature to every settle.
- **Fee on `initialize_escrow`** (viewer-paid platform fee at booking
  time instead of settlement). Equivalent economics but awkward: if
  the streamer denies, the platform already took its cut — now you
  owe a refund path the program doesn't have. Settlement-time fee is
  cleaner because it only fires on successful delivery.

---

## Open questions

- Does the fee apply on `cancel_escrow` or `cancel_stale_pending`?
  **Recommendation: no.** Fees are earned on delivery. A viewer who
  reclaimed an abandoned escrow gets 100% back; the platform
  shouldn't charge for a service that didn't happen.
- Does the fee apply on `deny_flash`? **Recommendation: no**, same
  logic. `approve_flash` yes, `deny_flash` no.
- Do we expose the fee split in the viewer-facing booking UI? **Yes,
  required under most consumer-protection regimes** (clear display of
  fees before purchase). Show it next to the total: "$5.00 beam
  (includes $0.13 platform fee)".
