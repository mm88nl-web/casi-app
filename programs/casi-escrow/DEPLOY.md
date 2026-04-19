# CASI Escrow — deploy checklist

End-to-end steps to ship the phase-3 program + server changes from a clean
working tree to a running devnet environment. Mainnet is the same sequence
plus the network flip in `src/lib/solana-network.ts`.

## 1. Build + deploy the Anchor program

```bash
# Toolchain — constant_time_eq@0.4.3 in the Anchor 0.31.1 deps graph needs 1.95+.
rustup install 1.95.0
rustup default 1.95.0

# Build and regenerate the IDL. The aggregate IDL that ships in src/idl/
# is checked in; regenerate it only if you changed an instruction/account/event.
anchor build

# Devnet deploy. Needs ~2.5 SOL in the deployer wallet at current rates.
solana config set --url devnet
anchor deploy --provider.cluster devnet

# Copy the new program ID into the web app's env vars.
node scripts/sync-program-id.mjs            # writes NEXT_PUBLIC_CASI_PROGRAM_ID=...
```

If the on-chain `declare_id!` doesn't match what `anchor deploy` returned,
`anchor build` will complain and refuse to deploy. Update
`programs/casi-escrow/src/lib.rs` to match, rebuild, redeploy.

## 2. Run the test suite

```bash
# Spin up a local validator in one terminal:
solana-test-validator --reset

# In another:
anchor test --skip-local-validator
```

All phase-3 tests are in `tests/casi-escrow.ts` under the headings
`SessionDelegate`, `CancelStalePending`, `VersionedState`, `Invariants`.

## 3. Apply the DB migrations

Supabase Dashboard → SQL Editor → paste each of these in order:

- `supabase/migrations/20260425000000_streamer_delegates.sql`
  — per-streamer session-key storage (AES-GCM sealed at rest)

(All prior phase-1/2 migrations should already be applied — check
`bookings.escrow_pda` exists before running any phase-3 routes.)

## 4. Env vars

All set in Vercel → Project → Settings → Environment Variables. Every
`NEXT_PUBLIC_*` var must also be available at build time.

### Required (core app)

| Name | Example | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxx.supabase.co` | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhb…` | |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhb…` | server-only, bypasses RLS |
| `NEXT_PUBLIC_CASI_PROGRAM_ID` | `6utjMbb5…` | from `anchor deploy` |
| `NEXT_PUBLIC_SOLANA_RPC` | `https://mainnet.helius-rpc.com/?api-key=…` | devnet public RPC is fine for staging; mainnet **needs** a paid provider |
| `HELIUS_WEBHOOK_SECRET` | 32+ random chars | shared with the Helius webhook dashboard |
| `CRON_SECRET` | 32+ random chars | protects `/api/cron/*` |

### Required for phase 3

| Name | Notes |
|---|---|
| `DELEGATE_ENCRYPTION_KEY` | **32 bytes, base64 or hex.** Generate with `openssl rand -base64 32`. Wraps every session-key secret at rest. **Rotating this invalidates every installed delegate** — streamers will need to hit "rotate" again. |

### Required if delegate flow is enabled (phase 3)

| Name | Notes |
|---|---|
| `SOLANA_CRANKER_KEYPAIR` | 64-byte secret as base58 OR JSON array (matches `~/.config/solana/id.json`). **Required** as the fee payer for `start_beam_delegated` — the session key has no SOL and Solana refuses to debit an un-credited account. Same keypair also powers the daily `solana-reconciler`'s permissionless `cancel_stale_pending` crank on 7d-old Pending escrows. Fund with ~0.05 SOL; the reconciler eats ~5k lamports per crank and each delegated start costs one base fee + compute. |

If you leave `SOLANA_CRANKER_KEYPAIR` unset, `/api/solana/delegates/start-beam` returns 503 (`reason: 'no_cranker'`) and the admin page falls back to wallet-signed `start_beam`. That's a safe degradation — every Approve will prompt the streamer's wallet, same as phase-2 behavior.

## 5. Helius webhook

Dashboard → Webhooks → Create / Edit:

- **Type**: Enhanced Transactions
- **Accounts to watch**: the program ID from step 1
- **Webhook URL**: `https://<your-app>/api/webhooks/solana`
- **Auth header**: `authorization: <HELIUS_WEBHOOK_SECRET>`
- **Cluster**: must match `src/lib/solana-network.ts` `NETWORK`

## 6. Post-deploy smoke test

Order matters — each step verifies a layer of the phase-3 stack.

1. **Program is live**: `solana account <PROGRAM_ID> --url devnet` returns an
   executable account.
2. **Webhook is wired**: book a 1-min beam from a test wallet. Watch Vercel
   logs — you should see `[solana-webhook]` processing `initialize_escrow`
   within a few seconds of the viewer paying.
3. **Direct start_beam still works**: streamer approves from admin → old path
   (wallet pop-up) still lands `start_beam` on-chain.
4. **Delegate install**: admin → Settings → Session key → Install. Row appears
   in `streamer_delegates`. Streamer signs on-chain `set_delegate` (currently
   manual, admin UI wiring is a future slice).
5. **Delegated start**: book another beam, streamer approves → server crank
   path hits `/api/solana/delegates/start-beam` → webhook lands
   `start_beam_delegated` → DB + overlay update. No wallet pop-up this time.
6. **Stale-pending refund** (takes 7d): leave an escrow Pending for a week,
   next daily cron run should crank `cancel_stale_pending` and the viewer
   gets their USDC back.

## Rollback

- **Program regression**: redeploy the prior binary. The new
  `EscrowState.version` field is on every account — downgrading is fine
  because the old program doesn't read the suffix.
- **Web app regression**: Vercel → Deployments → promote prior deployment.
  Leaves DB + chain untouched.
- **Kill the delegate system without rolling back**: `UPDATE
  streamer_delegates SET revoked_at = now() WHERE revoked_at IS NULL;`
  The server auto-crank refuses to use any revoked row; streamers fall
  back to wallet-signed approvals automatically.
