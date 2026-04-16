# CASI Escrow

A trust-minimized USDC escrow program for real-time streaming payments on Solana. Written in Anchor 0.30.1.

Two payment primitives:

- **Flash** — one-shot tip. Viewer locks USDC; streamer either approves (95% to streamer, 5% to treasury) or denies (full refund). Viewer may self-cancel before the streamer acts.
- **Beam** — time-based tip that vests linearly. Viewer locks USDC and streamer signs `start_beam` to begin the clock. Either party may end the stream early; anyone may crank settlement after the duration elapses.

The 5% platform fee is enforced on-chain by a hardcoded treasury address constraint — the fee cannot be redirected by a malicious client or relayer.

---

## Design choices

The program is structured to be easy to audit.

- Derived from the [solana-developers/program-examples tokens/escrow/anchor](https://github.com/solana-developers/program-examples/tree/main/tokens/escrow/anchor) template and keeps the same account layout conventions: `token_interface` for Token-2022 compatibility, `transfer_checked` (with mint + decimals) for every SPL transfer, `InterfaceAccount` for token accounts and mints, and `has_one` constraints for every relationship check.
- PDA-owned vault ATAs (`associated_token::authority = escrow_state`) so only the program can move escrowed USDC.
- `u128` intermediate arithmetic and `checked_sub` on all fee / refund math to eliminate overflow and underflow classes.
- Linear vesting cap on `settle_beam`: `vested = total × min(elapsed, duration) / duration`. Early-settle caller check restricts pre-duration settlement to the two parties that consented to the escrow (anti-grief).
- Hardcoded fee wallet: `#[account(address = fee_wallet::ID)]` — replace with the production treasury pubkey before mainnet deploy.
- Every settled state change emits a typed event (`EscrowInitialized`, `FlashSettled`, `BeamSettled`) for off-chain indexers.

---

## Instructions

| Instruction         | Signer            | Status transition        | Notes                                                      |
|---------------------|-------------------|--------------------------|------------------------------------------------------------|
| `initialize_escrow` | viewer            | — → Pending              | Locks USDC in PDA-owned vault. `escrow_type_val`: 0=Flash, 1=Beam. |
| `approve_flash`     | streamer          | Pending → Settled        | 95/5 split. Flash only.                                    |
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
| 6007 | `InvalidFeeWallet`  | Fee wallet address does not match the hardcoded treasury.      |
| 6008 | `MathOverflow`      | Arithmetic overflow or underflow (should be unreachable).      |

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

**Flash**: 95/5 split on approve; fee rounds to zero at 1 micro-USDC (no underflow); full refund on deny; full refund on viewer self-cancel; `Unauthorized` rejects approve by non-streamer; double-approve impossible; `WrongEscrowType` on flash-approve of a Beam; `InvalidAmount` on amount=0; `InvalidFeeWallet` on spoofed treasury.

**Beam**: `InvalidDuration` on duration=0; `NotActive` before `start_beam`; `AlreadySettled` on `cancel_escrow` after start; full refund on cancel while Pending; full vest at t ≥ duration; partial-vest conservation (streamer + viewer + fee == total, fee is exactly 5% of vested); double-settle impossible; **pre-duration third-party settle rejected (anti-grief)**; **viewer may settle early**; **post-duration crank by any signer succeeds**.

---

## Audit scope

An auditor should review these in order:

1. **Account contexts** (lines 450–715). Every instruction uses `has_one` to bind the signer to the stored party, `seeds + bump` for PDA derivation, and explicit `close` targets. The fee-wallet address constraint (`address = fee_wallet::ID`) is the sole defense against fee redirection.

2. **Fee + vesting math** in `approve_flash` (lines 120–126) and `settle_beam` (lines 308–322). All products use `u128` intermediates; all subtractions use `checked_sub`. The `vested_ticks = elapsed.min(duration)` clamp is the vesting invariant.

3. **State machine**. Status transitions only in the `Pending → {Settled, Cancelled, Active}` and `Active → Settled` directions. Every guard is a `require!` at the top of the instruction body, before any CPI.

4. **CPI surface**. Only two programs are called: `token_interface` (`transfer_checked`, `close_account`) and the associated-token-program (via `init_if_needed`). No arbitrary CPI, no user-supplied program IDs.

5. **Anti-grief**. `settle_beam` before `duration` elapses requires the caller to be either the streamer or the viewer. After `duration`, anyone may crank — this is a deliberate liveness choice.

---

## Known tradeoffs

- **Rent forfeiture on settle.** The viewer pays rent for the `EscrowState` and vault ATAs on `initialize_escrow`. On `approve_flash` / `settle_beam` the rent returns to the streamer (via `close = streamer`); on `deny_flash` / `cancel_escrow` it returns to the viewer. Treating rent as a cost-of-doing-business on successful settlement is intentional.
- **Fee-wallet ATA created on first use.** `approve_flash` and `settle_beam` use `init_if_needed` to create the treasury's USDC ATA on first call. The caller pays the ~0.002 SOL rent; subsequent calls are cheaper.
- **Beam liveness.** If the streamer never calls `start_beam`, the viewer can reclaim via `cancel_escrow`. Once `start_beam` has been called, the escrow can no longer be cancelled — settlement is the only exit, but it becomes permissionless after `duration` elapses so neither party can lock funds indefinitely.

---

## License

Apache-2.0. See [`LICENSE`](../../LICENSE).
