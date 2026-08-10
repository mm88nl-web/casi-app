# CASI Escrow

A trust-minimized USDC escrow program for real-time streaming payments on Solana. Written in Anchor 0.31.1.

Two payment primitives:

- **Flash** — one-shot tip. Viewer locks USDC; streamer either approves (100% to streamer) or denies (full refund). Viewer may self-cancel before the streamer acts.
- **Beam** — time-based tip that vests linearly. Viewer locks USDC and streamer signs `start_beam` to begin the clock. Either party may end the stream early; anyone may crank settlement after the duration elapses.

No platform fee is deducted on-chain — the streamer receives the full settled amount and the viewer receives the refund of any unvested portion.

> **For reviewers and grant evaluators**: [`PRIMITIVE.md`](./PRIMITIVE.md)
> frames this program as a general time-boxed payment primitive
> (consulting / tutoring / compute rentals / content windows — CASI is
> one consumer of it) and explains why the server-side cranker is a UX
> choice, not a protocol dependency.

---

## Design choices

The program is structured to be easy to audit.

- Derived from the [solana-developers/program-examples tokens/escrow/anchor](https://github.com/solana-developers/program-examples/tree/main/tokens/escrow/anchor) template and keeps the same account layout conventions: `token_interface` for Token-2022 compatibility, `transfer_checked` (with mint + decimals) for every SPL transfer, `InterfaceAccount` for token accounts and mints, and `has_one` constraints for every relationship check.
- PDA-owned vault ATAs (`associated_token::authority = escrow_state`) so only the program can move escrowed USDC.
- `u128` intermediate arithmetic and `checked_sub` on all vesting / refund math to eliminate overflow and underflow classes.
- Linear vesting cap on `settle_beam`: `vested = total × min(elapsed, duration) / duration`. Early-settle caller check restricts pre-duration settlement to the two parties that consented to the escrow (anti-grief).
- Every settled state change emits a typed event (`EscrowInitialized`, `FlashSettled`, `BeamSettled`) for off-chain indexers.

---

## Instructions

**Corrected 2026-08-10** — this table covered only the phase-1/2 surface (6 of
16 instructions) and had drifted from the actual program; re-derived directly
from `src/lib.rs` (`grep -n "    pub fn " src/lib.rs` is the fastest way to
re-check this yourself rather than trusting a table that can go stale again).

| Instruction | Signer | Status transition | Notes |
|---|---|---|---|
| `initialize_config` | deployer (must be upgrade authority) | — | One-time. Sets accepted mint, admin, cap/floor. |
| `update_config` | admin | — | Adjust `paused` / `max_escrow_amount` / `min_escrow_amount`. |
| `transfer_admin` | admin | — | Rotate the admin key. Rejects zero address and off-curve (PDA) addresses. |
| `initialize_escrow` | viewer | — → Pending | Locks USDC in PDA-owned vault. `escrow_type_val`: 0=Flash, 1=Beam. |
| `approve_flash` | streamer | Pending → Settled | 100% to streamer. **Flash only** (rejects Beam with `WrongEscrowType`). |
| `deny_flash` | streamer | Pending → Cancelled | Full refund. **Flash only** — same type check as `approve_flash`, despite the name suggesting otherwise. |
| `cancel_escrow` | viewer | Pending → Cancelled | Viewer self-refund. Either type. Only while Pending. |
| `start_beam` | streamer | Pending → Active | Records `start_timestamp`. Beam only. |
| `start_beam_delegated` | session key | Pending → Active | Same effect as `start_beam`, signed by a registered delegate; cranker pays fees. |
| `settle_beam` | party or cranker | Active → Settled | Pro-rata split. Pre-duration: streamer or viewer only. Post-duration: permissionless. |
| `settle_beam_delegated` | session key + cranker | Active → Settled | Same vesting math as `settle_beam`, session-key signed. |
| `approve_flash_delegated` | session key + cranker | Pending → Settled | Delegated twin of `approve_flash`. |
| `deny_flash_delegated` | session key + cranker | Pending → Cancelled | Delegated twin of `deny_flash`. |
| `set_delegate` | streamer | — | Installs or rotates a session-key delegate (`init_if_needed`). |
| `revoke_delegate` | streamer | — | Closes the delegate PDA; rent returns to streamer. |
| `cancel_stale_pending` | anyone (permissionless) | Pending → Cancelled | Refunds viewer after `PENDING_TIMEOUT_SECS` (7 days). **Beam only** — Flash viewers already have self-cancel via `cancel_escrow` at any time. |

See "Phase 3 — session-key delegation" in the root `AGENTS.md` for the delegate/cranker trust model in more depth.

---

## Error codes

**Corrected 2026-08-10** — was missing 12 of the 20 codes (everything from
the config/delegate/versioning additions). Re-derive from the `#[error_code]
pub enum CasiError` block in `src/lib.rs` if this drifts again — Anchor
assigns codes sequentially from 6000 in declaration order, so a reordered or
inserted variant shifts every code after it.

| Code | Name | Meaning |
|---|---|---|
| 6000 | `InvalidAmount` | `amount` must be > 0 on initialize. |
| 6001 | `InvalidDuration` | `duration_secs` must be > 0 for Beam. |
| 6002 | `FlashMustHaveZeroDuration` | `duration_secs` must be 0 for Flash. |
| 6003 | `InvalidEscrowType` | `escrow_type_val` must be 0 (Flash) or 1 (Beam). |
| 6004 | `Unauthorized` | Signer is not the authorized party for this action. |
| 6005 | `AlreadySettled` | Escrow is not in Pending status. |
| 6006 | `NotActive` | Escrow is not in Active status. |
| 6007 | `WrongEscrowType` | Instruction called with the wrong escrow type. |
| 6008 | `MathOverflow` | Arithmetic overflow or underflow (should be unreachable). |
| 6009 | `UnsupportedVersion` | Account layout version isn't supported by this program build. |
| 6010 | `InvalidExpiry` | Delegate `expires_at` must be in the future. |
| 6011 | `DelegateLifetimeExceedsMax` | Delegate expiry exceeds `MAX_DELEGATE_LIFETIME_SECS` (180 days). |
| 6012 | `DelegateExpired` | Delegate has expired — streamer must re-install. |
| 6013 | `PendingNotStale` | `cancel_stale_pending` called before `PENDING_TIMEOUT_SECS` has elapsed. |
| 6014 | `ProtocolPaused` | `initialize_escrow` blocked while `GlobalConfig.paused`. |
| 6015 | `InvalidMint` | Token mint doesn't match `GlobalConfig.accepted_mint`. |
| 6016 | `AmountExceedsCap` | `amount` exceeds `GlobalConfig.max_escrow_amount` (0 = no cap). |
| 6017 | `InvalidAdmin` | Rejects transferring admin to the zero address or an off-curve (PDA) address. |
| 6018 | `TransferHookNotAllowed` | `accepted_mint` has a Token-2022 TransferHook extension configured. |
| 6019 | `AmountBelowMin` | `amount` is below `GlobalConfig.min_escrow_amount` (0 = no floor; the live deployment sets this non-zero specifically to make ATA-rent griefing uneconomical — see the doc comment on `GlobalConfig.min_escrow_amount` in `src/lib.rs`). |

---

## Build, test, deploy

Requires: Solana CLI, Anchor 0.31.1, Rust 1.75+, Node 20+.

```bash
# Fresh clone: sync the declare_id! in lib.rs with the auto-generated keypair
anchor build
node scripts/sync-program-id.mjs
anchor build                          # rebuild with correct program ID

# Run the test suite against a local validator
anchor test

# Deploy to devnet
anchor deploy --provider.cluster devnet
node scripts/sync-program-id.mjs      # sync program ID to .env.local + frontend IDL
```

**`anchor test` does not currently pass cleanly** (last measured 2026-08-10:
96 passing / 33 failing, all failures `AccountNotInitialized` on `config`
inside `initialize_escrow`). This is a test-harness bug, not a program bug —
`solana-test-validator`'s genesis `--bpf-program` loading (which is what
plain `anchor test` uses) reports the deployed program's upgrade authority as
`Some(11111111111111111111111111111111)` (the System Program's all-zero
address) instead of `None`, and `initialize_config`'s authority check has no
branch for "`Some` but unsignable" — so `initialize_config` can never
succeed under that harness, and `tests/casi-escrow.ts` never calls it
(likely why nobody noticed). Confirmed by deploying normally via
`solana program deploy` to a fresh local validator instead — the identical
bytecode then reads its authority correctly and every test passes. Full
detail in `docs/fable-security-review-2026-08-10.md`, Finding 2. Fix this
harness gap before treating a green `anchor test` run as real signal.

The frontend loads the IDL from `src/idl/casi_escrow.json`. After deploy, the sync script copies the canonical IDL from `target/idl/casi_escrow.json`, updates `NEXT_PUBLIC_CASI_PROGRAM_ID` in `.env.local`, and prints the Vercel env-var checklist.

---

## Test coverage

`tests/casi-escrow.ts` covers the phase-1/2 surface across two suites
(**Flash**, **Beam**) plus the phase-3 additions across four more
(**SessionDelegate**, **CancelStalePending**, **VersionedState**,
**Invariants (randomized)**) — don't trust a hardcoded case count here, it
was wrong twice already (this section previously said 18, the section above
it said 15); run `grep -c "  it(" tests/casi-escrow.ts` for the current
number, and see the harness-bug note above before assuming a failing run
means a program regression.

Representative coverage, by suite:

**Flash**: 100% to streamer on approve; 1 micro-USDC lands intact (no rounding loss); full refund on deny; full refund on viewer self-cancel; `Unauthorized` rejects approve by non-streamer; double-approve impossible; `WrongEscrowType` on flash-approve of a Beam; `InvalidAmount` on amount=0.

**Beam**: `InvalidDuration` on duration=0; `NotActive` before `start_beam`; `AlreadySettled` on `cancel_escrow` after start; full refund on cancel while Pending; full vest at t ≥ duration; partial-vest conservation (streamer + viewer == total); double-settle impossible; **pre-duration third-party settle rejected (anti-grief)**; **viewer may settle early**; **post-duration crank by any signer succeeds**.

**SessionDelegate / CancelStalePending / VersionedState / Invariants**: delegate install/rotate/revoke, expiry-in-the-past and expiry-beyond-max-lifetime rejection, cross-streamer and mismatched-session-key rejection on the delegated instructions, stale-pending permissionless refund timing, account-version gating, and randomized vesting-math conservation checks.

`tests/security-findings.ts` (added 2026-08-10) is a separate, deliberately adversarial suite — not general coverage, but actual attack attempts against a local deployment. See `docs/fable-security-review-2026-08-10.md` for what it found.

---

## Audit scope

An auditor should review these in order:

1. **Account contexts**. Every instruction uses `has_one` to bind the signer to the stored party, `seeds + bump` for PDA derivation, and explicit `close` targets.

2. **Vesting math** in `settle_beam`. All products use `u128` intermediates; all subtractions use `checked_sub`. The `vested_ticks = elapsed.min(duration)` clamp is the vesting invariant.

3. **State machine**. Status transitions only in the `Pending → {Settled, Cancelled, Active}` and `Active → Settled` directions. Every guard is a `require!` at the top of the instruction body, before any CPI.

4. **CPI surface**. Only two programs are called: `token_interface` (`transfer_checked`, `close_account`) and the associated-token-program (via `init_if_needed`). No arbitrary CPI, no user-supplied program IDs.

5. **Anti-grief**. `settle_beam` before `duration` elapses requires the caller to be either the streamer or the viewer. After `duration`, anyone may crank — this is a deliberate liveness choice.

6. **Session-key delegation** (added since this list was first written — was missing entirely until 2026-08-10). `set_delegate`/`revoke_delegate`/`start_beam_delegated`/`settle_beam_delegated`/`approve_flash_delegated`/`deny_flash_delegated` let a streamer authorize a narrow session key so the app doesn't need a wallet popup per action. Check: the delegated instructions bind their payout targets to the *escrow's* stored `streamer`/`viewer` via `has_one`, not to any caller-suppliable account, so a compromised session key can force an early/unfavorable settle but never redirect funds. Also check `MAX_DELEGATE_LIFETIME_SECS` is actually enforced on both install and every delegated call.

7. **Cost asymmetry on `init_if_needed` ATAs**. `SettleBeam`, `SettleBeamDelegated`, `ApproveFlashDelegated`, `DenyFlashDelegated`, and `CancelStalePending` all let the caller/cranker pay for a fresh counterparty ATA regardless of the escrow's own value — proven exploitable as a cheap way to drain the shared cranker (Finding 3, `docs/fable-security-review-2026-08-10.md`). Mitigated at the config layer (`min_escrow_amount` floor) rather than the account-constraint layer; worth an auditor's opinion on whether that's sufficient.

---

## Known tradeoffs

- **Rent forfeiture on settle.** The viewer pays rent for the `EscrowState` and vault ATAs on `initialize_escrow`. On `approve_flash` / `settle_beam` the rent returns to the streamer (via `close = streamer`); on `deny_flash` / `cancel_escrow` it returns to the viewer. Treating rent as a cost-of-doing-business on successful settlement is intentional.
- **Beam liveness.** If the streamer never calls `start_beam`, the viewer can reclaim via `cancel_escrow`. Once `start_beam` has been called, the escrow can no longer be cancelled — settlement is the only exit, but it becomes permissionless after `duration` elapses so neither party can lock funds indefinitely.

---

## License

Apache-2.0. See [`LICENSE`](../../LICENSE).
