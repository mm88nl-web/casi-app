# CASI Escrow

A trust-minimized USDC escrow program for real-time streaming payments on Solana. Written in Anchor 0.30.1.

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

| Instruction         | Signer            | Status transition        | Notes                                                      |
|---------------------|-------------------|--------------------------|------------------------------------------------------------|
| `initialize_escrow` | viewer            | — → Pending              | Locks USDC in PDA-owned vault. `escrow_type_val`: 0=Flash, 1=Beam. |
| `approve_flash`     | streamer          | Pending → Settled        | 100% to streamer. Flash only.                              |
| `deny_flash`        | streamer          | Pending → Cancelled      | Full refund. Works for either type, by convention used for Flash. |
| `cancel_escrow`     | viewer            | Pending → Cancelled      | Viewer self-refund. Only while Pending.                    |
| `start_beam`        | streamer          | Pending → Active         | Records `start_timestamp`. Beam only.                      |
| `settle_beam`       | party or cranker  | Active → Settled         | Pro-rata split. Pre-duration: streamer or viewer only. Post-duration: permissionless. |

---

## Error codes

| Code | Name                | Meaning                                                        |
|------|---------------------|----------------------------------------------------------------|
| 6000 | `InvalidAmount`     | `amount` must be > 0 on initialize.                            |
| 6001 | `InvalidDuration`   | `duration_secs` must be > 0 for Beam.                          |
| 6002 | `InvalidEscrowType` | `escrow_type_val` must be 0 (Flash) or 1 (Beam).              |
| 6003 | `Unauthorized`      | Signer is not the authorized party for this action.            |
| 6004 | `AlreadySettled`    | Escrow is not in Pending status.                               |
| 6005 | `NotActive`         | Escrow is not in Active status.                                |
| 6006 | `WrongEscrowType`   | Instruction called with the wrong escrow type.                 |
| 6007 | `MathOverflow`      | Arithmetic overflow or underflow (should be unreachable).      |

---

## Build, test, deploy

Requires: Solana CLI, Anchor 0.30.1, Rust 1.75+, Node 20+.

```bash
# Fresh clone: sync the declare_id! in lib.rs with the auto-generated keypair
anchor build
node scripts/sync-program-id.mjs
anchor build                          # rebuild with correct program ID

# Run the test suite against a local validator (15 integration cases)
anchor test

# Deploy to devnet
anchor deploy --provider.cluster devnet
node scripts/sync-program-id.mjs      # sync program ID to .env.local + frontend IDL
```

The frontend loads the IDL from `src/idl/casi_escrow.json`. After deploy, the sync script copies the canonical IDL from `target/idl/casi_escrow.json`, updates `NEXT_PUBLIC_CASI_PROGRAM_ID` in `.env.local`, and prints the Vercel env-var checklist.

---

## Test coverage

`tests/casi-escrow.ts` covers 18 cases across the two suites:

**Flash**: 100% to streamer on approve; 1 micro-USDC lands intact (no rounding loss); full refund on deny; full refund on viewer self-cancel; `Unauthorized` rejects approve by non-streamer; double-approve impossible; `WrongEscrowType` on flash-approve of a Beam; `InvalidAmount` on amount=0.

**Beam**: `InvalidDuration` on duration=0; `NotActive` before `start_beam`; `AlreadySettled` on `cancel_escrow` after start; full refund on cancel while Pending; full vest at t ≥ duration; partial-vest conservation (streamer + viewer == total); double-settle impossible; **pre-duration third-party settle rejected (anti-grief)**; **viewer may settle early**; **post-duration crank by any signer succeeds**.

---

## Audit scope

An auditor should review these in order:

1. **Account contexts**. Every instruction uses `has_one` to bind the signer to the stored party, `seeds + bump` for PDA derivation, and explicit `close` targets.

2. **Vesting math** in `settle_beam`. All products use `u128` intermediates; all subtractions use `checked_sub`. The `vested_ticks = elapsed.min(duration)` clamp is the vesting invariant.

3. **State machine**. Status transitions only in the `Pending → {Settled, Cancelled, Active}` and `Active → Settled` directions. Every guard is a `require!` at the top of the instruction body, before any CPI.

4. **CPI surface**. Only two programs are called: `token_interface` (`transfer_checked`, `close_account`) and the associated-token-program (via `init_if_needed`). No arbitrary CPI, no user-supplied program IDs.

5. **Anti-grief**. `settle_beam` before `duration` elapses requires the caller to be either the streamer or the viewer. After `duration`, anyone may crank — this is a deliberate liveness choice.

---

## Known tradeoffs

- **Rent forfeiture on settle.** The viewer pays rent for the `EscrowState` and vault ATAs on `initialize_escrow`. On `approve_flash` / `settle_beam` the rent returns to the streamer (via `close = streamer`); on `deny_flash` / `cancel_escrow` it returns to the viewer. Treating rent as a cost-of-doing-business on successful settlement is intentional.
- **Beam liveness.** If the streamer never calls `start_beam`, the viewer can reclaim via `cancel_escrow`. Once `start_beam` has been called, the escrow can no longer be cancelled — settlement is the only exit, but it becomes permissionless after `duration` elapses so neither party can lock funds indefinitely.

---

## License

Apache-2.0. See [`LICENSE`](../../LICENSE).
