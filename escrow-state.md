# CASI escrow + cranker — current state (agent handoff)

This file is a self-contained map of everything in `casi-app` that implements the Solana escrow primitive and the cranker/session-key layer on top. Paste into a fresh chat along with `stakecall-brainstorm.md` to bring a new agent fully up to speed.

---

## The primitive in one paragraph

An Anchor program holds USDC in a per-booking PDA vault. Viewer stakes funds → `Pending`. Streamer activates → `Active` (timer starts). Either party ends early → `settle_beam` splits pro-rata by wall-clock vesting. Viewer can cancel from `Pending` for 100% refund. After 7 days stuck in `Pending`, anyone can call `cancel_stale_pending` to refund the viewer. A session key (stored encrypted in Supabase) lets the streamer skip wallet popups on activate/settle; a shared "cranker" keypair pays fees for those session-signed calls.

---

## File map

### On-chain program (Rust, Anchor 0.31.1)

```
programs/casi-escrow/
├── Cargo.toml                 # Anchor deps
├── src/lib.rs                 # Program source — all instructions, state,
│                              # errors. EscrowState byte layout documented
│                              # inline for off-chain decoders.
├── README.md                  # Program overview + public surface
├── DEPLOY.md                  # Build + deploy recipe
├── PRIMITIVE.md               # Framing of the session-key / delegation layer
└── FEE_MODEL.md               # How platform-fee splits work
```

**Deployed program ID:** `6utjMbb5ovFHUdMcMWaGc5ovmVhLryVRLEzYPWzeBosg`

**Instructions exported:**
- `start_beam` — streamer wallet signs, flips `Pending → Active`, sets `start_timestamp`.
- `settle_beam` — viewer or streamer wallet signs; after `elapsed ≥ duration` anyone can sign.
- `cancel_escrow` — viewer only, `Pending` only, 100% refund.
- `set_delegate` — streamer registers a session pubkey + expiry (one row per streamer).
- `revoke_delegate` — streamer invalidates the delegate.
- `start_beam_delegated` — session key signs, cranker pays fees. Same effect as `start_beam`.
- `settle_beam_delegated` — session key signs, cranker pays fees + ATA rents. Same effect as `settle_beam`.
- `cancel_stale_pending` — permissionless, refunds viewer after 7 days (`PENDING_TIMEOUT_SECS`) in Pending.

**Scoping guarantee:** the session key can ONLY call the two `*_delegated` twins. It cannot touch funds outside the vesting schedule, cannot cancel, cannot re-delegate. Worst case with a compromised session key: an attacker can force an early `settle_beam_delegated` at the current vested point — funds still split per the on-chain schedule, no theft.

**EscrowState layout (for raw decoding without IDL):**
```
8   bytes  Anchor discriminator
32  bytes  escrow_id
32  bytes  viewer Pubkey
32  bytes  streamer Pubkey
32  bytes  usdc_mint Pubkey
8   bytes  total_amount (u64)
8   bytes  duration_secs (u64)
8   bytes  start_timestamp (i64)
1   byte   escrow_type (0=Flash, 1=Beam)
1   byte   status       (0=Pending, 1=Active)   ← offset 161
1   byte   bump
```
`Settled` / `Cancelled` close the account, so a non-null `getAccountInfo` implies status ∈ {0, 1}.

### Client library (TypeScript)

```
src/lib/
├── casi-escrow.ts             # `CasiEscrowClient` — wraps the IDL, exposes
│                              # builder methods for every instruction above.
│                              # Throws loud error in constructor if
│                              # NEXT_PUBLIC_CASI_PROGRAM_ID is unset.
├── casi-escrow-decoder.ts     # Raw byte-offset decoder for EscrowState.
│                              # Used in hot paths (webhook, reconciler,
│                              # viewer recovery) to skip IDL loading.
├── casi-errors.ts             # On-chain error names → user-readable strings.
├── cranker-keypair.ts         # Loads SOLANA_CRANKER_KEYPAIR from env (base58
│                              # or JSON array). Returns null on missing/
│                              # malformed — never throws. Callers branch on
│                              # null and either fall back or 503.
└── solana-network.ts          # Cluster + explorer URL helpers.
                               # WALLET_ADAPTER_CLUSTER and
                               # EXPLORER_CLUSTER_QUERY must match.
```

### Server routes

```
src/app/api/solana/
├── sync-webhook/route.ts          # Helius webhook. THE authoritative DB
│                                  # writer. Listens for every instruction
│                                  # discriminator and updates `bookings`
│                                  # status, escrow_pda, image_url etc.
│                                  # settle_beam_delegated must share the
│                                  # settle_beam handler branch.
└── delegates/
    ├── install/route.ts           # Streamer-auth. Generates session keypair,
    │                              # seals secret with AES-256-GCM using
    │                              # DELEGATE_ENCRYPTION_KEY, upserts to
    │                              # streamer_delegates table.
    ├── status/route.ts            # UI helper. Returns: not-installed |
    │                              # installed | expired | revoked.
    ├── revoke/route.ts            # Streamer-auth. Stamps revoked_at.
    │                              # Admin should also fire revoke_delegate
    │                              # on-chain.
    ├── start-beam/route.ts        # Signs start_beam_delegated with the
    │                              # decrypted session key. Cranker is fee
    │                              # payer. Returns 503 no_cranker if env
    │                              # unset → admin falls back to wallet sig.
    └── settle-beam/route.ts       # Signs settle_beam_delegated. Cranker
                                   # fee payer + ATA init funder. Same 503
                                   # fallback semantics.
```

```
src/app/api/cron/
└── solana-reconciler/route.ts     # Daily Vercel cron. Scans bookings,
                                   # cranks cancel_stale_pending for
                                   # Pending escrows > 7 days old, cleans
                                   # up drifted DB rows.
```

### UI

```
src/app/admin/
├── page.tsx                       # Streamer dashboard. Hosts:
│                                  #   - trySolanaSettleDelegated helper
│                                  #   - settleOrClearSolanaEscrow helper
│                                  #     (discriminated outcomes: settled |
│                                  #      closed | pending-chain | no-wallet
│                                  #      | error)
│                                  #   - approve/kick/deny handlers that try
│                                  #     delegated first, fall back to wallet
└── _components/
    └── DelegateKeyCard.tsx        # Install/rotate/revoke UX. Two-phase
                                   # write: DB row (install endpoint) +
                                   # on-chain set_delegate (streamer wallet).
                                   # needs-finalize state handles the case
                                   # where DB upsert succeeds but on-chain
                                   # tx fails — lets user retry the on-chain
                                   # step WITHOUT regenerating the session key.

src/app/overlay/page.tsx           # OBS browser source + viewer-side
                                   # reclaimSolanaEscrow recovery chip.
                                   # Probes PDA, cancels if Pending, tells
                                   # viewer "beam is live" if Active.
                                   # Scoped by viewer_name (same tab) OR
                                   # viewer_wallet (cross-device same-wallet).
```

### Database

```
supabase/migrations/
└── 20260425000000_streamer_delegates.sql    # Adds streamer_delegates table:
                                             # one row per streamer with
                                             # sealed_secret, session_pubkey,
                                             # expires_at, installed_at,
                                             # rotated_at, revoked_at.
```

Existing `bookings` table has the Solana-relevant columns: `escrow_pda`, `viewer_wallet`, `payment_method: 'solana'`, `start_timestamp`, `duration_minutes`, `status`, plus the per-booking `cancel_token` for viewer-initiated mutations.

---

## Environment variables

| Name | Purpose | Format |
|---|---|---|
| `NEXT_PUBLIC_CASI_PROGRAM_ID` | Anchor program ID | base58 pubkey |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | JWT |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key for server routes | JWT |
| `WALLET_ADAPTER_CLUSTER` | `mainnet-beta` / `devnet` — client RPC | string |
| `SOLANA_RPC` | Server-side RPC URL | URL |
| `DELEGATE_ENCRYPTION_KEY` | AES-256-GCM key for sealing session secrets. Rotating invalidates every installed delegate. | 32 raw bytes, base64 or hex |
| `SOLANA_CRANKER_KEYPAIR` | Fee payer for delegated twins + `cancel_stale_pending`. Fund with ~0.05 SOL. | 64-byte secret as base58 OR JSON array (same format as `~/.config/solana/id.json`) |
| `HELIUS_WEBHOOK_SECRET` | Shared secret for webhook auth | string |
| `CRON_SECRET` | Vercel cron auth bearer | string |

---

## Flow walkthroughs

### Happy-path booking (Solana + delegate installed)

1. Viewer fills booking form → client calls `CasiEscrowClient.startBeam()` (viewer wallet sig). USDC moves from viewer's ATA into the vault ATA under the PDA. State = `Pending`.
2. Helius webhook fires → `sync-webhook/route.ts` inserts `bookings` row with `status='pending'`, `escrow_pda`, `viewer_wallet`, `cancel_token`.
3. Streamer clicks Approve in `admin/page.tsx` → if delegate is healthy, POST `/api/solana/delegates/start-beam`. Server decrypts session key, builds `start_beam_delegated` tx with cranker as fee payer, signs with both. State = `Active`, `start_timestamp` set.
4. Webhook picks up the state change → flips DB `status='active'`.
5. Timer expires OR streamer kicks → POST `/api/solana/delegates/settle-beam`. `settle_beam_delegated` runs, vault ATA is drained to streamer + viewer ATAs pro-rata, account closes.
6. Webhook picks up the close → flips DB `status='expired'`, clears `escrow_pda`, clears `overlay_elements.image_url`.

### Fallback path (no cranker / delegate broken)

- Steps 3 and 5 return 503 `reason: 'no_cranker'` (or similar).
- Admin page falls back to wallet-signed `start_beam` / `settle_beam` — streamer gets a wallet popup.
- Same DB outcomes via the same webhook handler. Program doesn't care which instruction was used.

### Viewer cancel before approval

- Viewer sees `Pending` row in overlay page → clicks RECOVER chip.
- `reclaimSolanaEscrow` probes PDA. If Pending, builds `cancel_escrow` (viewer wallet sig). Anchor `.rpc()` resolves = tx confirmed.
- Always calls `clearPdaInDb` after confirmation (via server route with `cancel_token` auth). Never waits on webhook for UI feedback.

### Streamer deny on Active

- **Do NOT just flip DB status.** A `denied` DB row with a still-Active on-chain escrow vests 100% to the streamer as wall-clock time passes.
- `denyBooking` calls `settleOrClearSolanaEscrow` which tries delegated settle first, falls back to wallet. Outcome branches on discriminated return (`settled | closed | pending-chain | no-wallet | error`).

### Abandoned Pending (viewer never showed up, streamer never approved)

- After 7 days, the daily reconciler cron calls `cancel_stale_pending` (permissionless, signed by cranker). Viewer gets 100% refund. No human needed.

---

## Known gotchas (carry these forward)

- **Session key as fee payer fails.** Solana rejects txs where the fee payer has never received SOL with `"Attempt to debit an account but found no record of a prior credit"`. Always use the cranker as fee payer, co-sign with the session key.
- **Cranker balance drift.** Silent single point of failure. Monitor SOL balance. Delegated settle costs ~0.01 SOL if streamer/viewer ATAs don't yet exist (two ATA rents); delegated start is cheap (~0.00001 SOL).
- **Cluster mismatch.** `WALLET_ADAPTER_CLUSTER` and `EXPLORER_CLUSTER_QUERY` must match. Devnet wallet on mainnet endpoint = silent failure.
- **PostgREST returns NUMERIC as strings.** `Number(booking.duration_minutes)` before math.
- **Numeric vs string booking_id.** PostgREST returns `bookings.id` as a number; some older routes check `typeof === 'string'`. Always accept either: `typeof x === 'number' ? x : String(x)`.
- **Never regenerate session key on finalize retry.** The DB already has the committed pubkey. Regenerating means the on-chain `set_delegate` would register a stranger. Always re-use the pubkey the install endpoint returned.
- **Don't auto-promote the Solana queue on expire.** Program isn't wired for it. Admin's `playNow` handler explicitly kicks current + starts next.
- **Webhook is authoritative.** All `bookings` status transitions from Solana events flow through `sync-webhook/route.ts`. Don't write status elsewhere based on local inference — it'll drift.
- **Helius replica lag.** A post-tx `getAccountInfo` can read stale state for ~2s. If you're confirming via `.rpc()`, trust the resolve — don't re-probe and second-guess.

---

## Reading order for a new agent

1. `AGENTS.md` — project-wide conventions, RLS model, the "don'ts".
2. `programs/casi-escrow/PRIMITIVE.md` — framing for the session-key layer.
3. `programs/casi-escrow/src/lib.rs` — the program itself is ~1200 lines and heavily commented.
4. `src/lib/casi-escrow.ts` — client wrapper, shortest path to understanding how the UI calls the program.
5. `src/app/api/solana/sync-webhook/route.ts` — to see how on-chain events translate to DB writes.
6. `src/app/admin/page.tsx` — search for `settleOrClearSolanaEscrow` and `trySolanaSettleDelegated` to see the fallback pattern in action.
7. `src/app/overlay/page.tsx` — search for `reclaimSolanaEscrow` for the viewer-side recovery flow.
