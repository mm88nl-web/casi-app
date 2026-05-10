# Escrow resurrection plan

Status doc for the multi-session effort to merge the custom Anchor escrow work
back into main and finish it properly. Updated as we go. If a future Claude
chat picks this up cold, start here.

## Goal

Replace / extend Streamflow with the custom `casi-escrow` Anchor program, so
that all three earn-surfaces (**flashes**, **beams**, **backdrops**) support:

| Rail      | Mechanism                                                      |
|-----------|----------------------------------------------------------------|
| Stripe    | Checkout → manual-capture PaymentIntent → prorated capture     |
| Solana    | `casi-escrow` Anchor program → USDC PDA → approve/settle/cancel |
| Free      | Skip payment entirely, create booking/flash with amount = 0    |

Secondary goal: keep the Anchor program open-source-friendly (clean, documented,
MIT/Apache-2.0 licensed, with tests) so it can be submitted for a Solana grant
or reused by the community.

## State of the repo (start of this effort)

- **main** (`bc89d6a`): ships Streamflow. Recent work: mobile sweep, CSP, custom
  durations, GitHub Actions cron. Does NOT contain escrow.
- **claude/casi-project-summary-zJfeU** (our working branch, `834a433`): main +
  SUMMARY.md + live chat + `src/lib/solana-network.ts` network switch.
- **claude/custom-anchor-escrow-VTbAu** (main + 59): full custom escrow —
  Anchor program, IDL, TS client, flash routes, migrations, tests, scripts.
- **claude/review-gemini-prompt-Ydoy4** (main + 50, diverges at `d32fc9d`):
  1 unique commit (`b4969b2`) adds `confirm-solana` + `settle-solana` flash
  routes. 9 commits behind VTbAu on the escrow itself.
- **claude/custom-anchor-escrow-iIsDi**: strict subset of VTbAu — redundant.
- Assorted older branches: superseded iteration artifacts, safe to delete.

See `SUMMARY.md` for the full project map.

## Plan

### Phase 1 — bring escrow work onto current branch (in-progress)

1. `git merge origin/claude/custom-anchor-escrow-VTbAu` (no squash — preserve
   history for grant / open source traceability).
2. Resolve conflicts. Expected hot spots:
   - `src/app/overlay/page.tsx` — both sides heavily modified
   - `src/app/admin/page.tsx` — both sides heavily modified
   - `src/app/api/webhooks/solana/route.ts` — both touched
   - `src/components/SolanaProvider.tsx`, `src/components/WalletNav.tsx` — we
     swapped hardcoded devnet for the `solana-network` config; VTbAu likely
     still hardcodes devnet
   - `src/lib/` — VTbAu adds `casi-escrow.ts`, `casi-errors.ts`,
     `payment-manager.ts`; we added `solana-network.ts`
3. Cherry-pick Ydoy4's `b4969b2`. Rename its migration file from
   `20260417000000_add_flash_solana_fields.sql` (collides with our chat
   migration) to `20260418000000_add_flash_solana_fields.sql`.
4. Make escrow code import from `src/lib/solana-network.ts` so the single
   network switch controls the Anchor cluster too.

### Phase 2 — make it compile + run

5. `npx tsc --noEmit` clean outside `bonk-ui-source/` (which is dead code).
6. `npm run lint` clean.
7. Boot the dev server, smoke-test the flows that aren't network-dependent.

### Phase 3 — product completeness

8. Confirm **flashes** work on all three rails (Stripe / Solana / free).
9. Confirm **beams** work on all three rails.
10. Confirm **backdrops** work on all three rails.
11. Confirm Stripe proration covers all three (currently works for beams —
    `src/app/api/stripe/end-early/route.ts`). May need extension for flashes
    if they have any duration, and for backdrops.
12. Verify free-tier migrations + UI: `20260416300000_free_tier.sql`,
    `20260416400000_drop_allow_free_beams.sql`.

### Phase 4 — open source / grant polish

13. Anchor program README at `programs/casi-escrow/README.md` — explain the
    PDA design, state transitions, anti-grief logic, how to build/test/deploy.
14. Confirm LICENSE (Apache-2.0 already on VTbAu).
15. Run Anchor tests (`tests/casi-escrow.ts`, 560 lines). Require Anchor CLI.
16. Clean up any inline TODO/FIXME in the Rust program.
17. Top-level README section linking the Anchor workspace.

### Phase 5 — clean up branches

18. After this branch lands and is verified, delete:
    - `claude/custom-anchor-escrow-iIsDi` (subset of VTbAu)
    - `claude/fix-solana-phantom-handshake-OGScN`, `*-update-bonk-ui-styling*`,
      `*-add-ui-skin-system*` (already in main)
    - `claude/test-wallet-integration-*`, `claude/add-overlay-rental-system-*`,
      `claude/add-solana-confirmation-screen-*` (iteration artifacts)
19. Archive-tag the source branches before deletion: `archive/escrow-VTbAu`,
    `archive/escrow-Ydoy4`.
20. Update `SUMMARY.md` to reflect the merged state.

## Key file inventory (post-merge expected)

- `programs/casi-escrow/src/lib.rs` — Anchor program (831 lines)
- `src/idl/casi_escrow.json` — IDL for the TS client
- `src/lib/casi-escrow.ts` — TS client wrapping the program (447 lines)
- `src/lib/casi-errors.ts` — error taxonomy
- `src/lib/payment-manager.ts` — abstracts Stripe vs Solana vs free (171 lines)
- `src/lib/solana-network.ts` — network switch (our addition)
- `src/app/api/flashes/*` — `create`, `moderate`, `attach-escrow`,
  `confirm-solana`, `settle-solana`
- `src/components/overlay/SendFlashSection.tsx` — flash compose UI (326 lines)
- `supabase/migrations/2026041[67]*` — flashes + escrow + free-tier schema
- `scripts/setup-devnet.sh`, `scripts/sync-program-id.mjs` — dev tooling
- `tests/casi-escrow.ts` — Anchor test suite (560 lines)

## Caveats / known unknowns

- VTbAu hardcodes devnet in multiple places. We need to plumb the network
  switch through it without breaking the Anchor program ID (it's cluster-
  specific).
- `b4969b2` from Ydoy4 was written against an earlier escrow revision
  (pre-`d32fc9d` audit refactor). It may not apply cleanly against VTbAu's
  current state — may need manual reconstruction.
- The existing Streamflow code on main shouldn't be ripped out immediately.
  Keep both paths until the escrow is fully tested, then remove Streamflow
  in a separate commit.
- The Anchor program ID on the branch is a placeholder (`4d3418a fix(escrow):
  use valid base58 placeholders + pre-generate keypair in setup`). Deploying
  will require generating a real keypair and patching `Anchor.toml` + the IDL.
