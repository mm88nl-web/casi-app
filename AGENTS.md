<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing code that touches App Router, Route Handlers, Server Actions, or `next.config`. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# CASI — agent orientation

CASI lets livestream viewers pay to put their image / video / message **on stream** as an overlay for a fixed duration. Streamers run OBS with a CASI browser-source URL; viewers book a slot via the web app; the streamer approves, the beam appears, the timer expires, payment settles.

## Stack at a glance

- **Frontend**: Next.js App Router, TypeScript, Supabase JS client, Solana wallet-adapter (Phantom et al.).
- **Backend**: Next.js Route Handlers under `src/app/api/`. Webhook endpoints, cron jobs, payment flows all live here. Server routes use the Supabase service-role key and bypass RLS.
- **Database**: Supabase (Postgres + PostgREST + RLS). Hosted. Migrations in `supabase/migrations/` with timestamp prefixes.
- **Payments**:
  - **Stripe Connect Direct Charges** for fiat. Streamers onboard via Connect; charges land on their connected account with application-fee splits.
  - **Solana escrow** for crypto. Anchor program in `programs/casi-escrow/`. Viewer stakes SOL into a PDA; `CasiEscrowClient` in `src/lib/casi-escrow.ts` wraps the IDL. Prorated settle on early end, refund on cancel.
- **Hosting**: Vercel. Cron jobs defined in `vercel.json`. **On Hobby plan — daily-only cron, no more.**
- **Tests**: `ts-mocha` over `tests/unit/*.test.ts`. Run `npm test`.

## Repo layout

```
src/app/
  admin/              legacy streamer dashboard (auth-gated)
    page.tsx          main file — kept <2k lines by design
    _components/      private components (underscore = Next.js ignores for routing)
    settings/         v3 settings home — payouts, session key, accent picker, etc.
      _components/    one component per section
  studio/             v3 streamer dashboard redesign (canvas + airing + queue)
  overlay/            OBS browser-source target (renders active beams)
  s/[username]/       shareable streamer landing page — bio + live indicator +
                      flashes feed + hero CTA to /overlay (NOT a booking surface)
  api/
    bookings/         create/expire/advance/deny + per-rail variants
    stripe/           authorize, cancel, webhook, end-early, approve-queue
                      connect/ (POST = onboarding link writer; status = read-only)
    solana/           sync-webhook (on-chain events → DB)
                      delegates/ (install / status / revoke / start-beam /
                                  settle-beam / approve-flash / deny-flash)
    cron/             stripe-janitor, solana-reconciler, cranker-monitor
    flashes/          tip-style ephemeral messages
    log/              client-side error ingest (rate-limited)
  ...
src/lib/
  casi-escrow.ts          Anchor client wrapper
  casi-errors.ts          enumerated on-chain error names → user-readable
  cranker-keypair.ts      shared loader for SOLANA_CRANKER_KEYPAIR
  observability.ts        structured JSON logs → stdout + optional webhook
  solana-network.ts       cluster + explorer URL helpers
  streamer-moderation.ts  SINGLE SOURCE OF TRUTH for the moderation handlers
                          (approve / deny / endBeamEarly / moderateFlash) and
                          the escrow primitives (startSolanaBeamOnChain,
                          settleOrClearSolanaEscrow). Both /admin and /studio
                          call into this — don't reimplement in either surface.
  stripe.ts               Stripe SDK singleton
programs/casi-escrow/     Anchor program source (Rust)
supabase/migrations/      SQL, applied via Supabase Dashboard SQL Editor
tests/unit/               mocha + chai, wired into CI via .github/workflows/ci.yml
```

## Data model — the three things booked

- **`bookings`**: image/video "beams" and "backdrops" that occupy an overlay slot for N minutes at a price per minute/total.
- **`flashes`**: tip messages with optional media. No slot, no timer — pop up briefly.
- **`overlay_elements`**: streamer-defined slots on their canvas (position, size, lock state).

Every bookable row has a `status` lifecycle: `pending → approved_queued | active → expired | denied | cancelled`. The `element_id` foreign key connects bookings to slots.

## RLS and permission model (read this before touching auth)

- **`anon`** has column-level SELECT on `bookings` and `flashes`, *excluding* `cancel_token`. Reading that column via PostgREST is denied — server routes read it as service-role.
- **`anon` cannot UPDATE or INSERT** any booking/flash. All mutations go through server routes.
- **Viewer-initiated mutations** (cancel a pending booking, deny a queue spot) authenticate via a per-booking `cancel_token` handed out only once at create time. See `/api/bookings/viewer-deny`, `/api/stripe/cancel`.
- **Streamer-initiated mutations** use the Supabase session bearer. Streamers can only mutate their own `profile_id` rows.
- When adding a new sensitive column to `bookings` or `flashes`, **extend the column-level GRANT list** in a migration — don't rely on RLS alone.

## Admin / Studio conventions

- `src/app/admin/page.tsx` is the legacy kitchen sink — canvas, requests queue, modals, toasts. Kept together because state flows top-down and splitting the state shards makes things worse. Every self-contained UI chunk is extracted into `_components/`.
- `src/app/studio/page.tsx` is the v3 redesign of the same surface — leaner cockpit, mobile-friendly, same data sources.
- **Both pages share moderation handlers via `src/lib/streamer-moderation.ts`.** The lib is the single source of truth for `approveBooking`, `denyBooking`, `endBeamEarly`, `moderateFlash`, plus the escrow primitives `startSolanaBeamOnChain` and `settleOrClearSolanaEscrow`. Admin's local handlers are thin adapters that pipe React state (toasts, optimistic updates) around lib calls — don't add new business logic to them, edit the lib instead.
- When adding a new card or panel, follow the existing split pattern: one component per file, props-driven, variant prop (e.g. `kind: 'beam' | 'backdrop'`) to share a component across similar but differently-themed surfaces.
- Admin's four core handlers (`playNow`, `kickBeam`, `approveBooking`, `denyBooking`) close over supabase + profile + state and get passed into card components as callbacks. Don't duplicate them into children.
- `kickBeam` and `expireBooking` accept an `opts.skipAutoAdvance` flag. `playNow` is the one caller that sets it true — playNow handles its own next-booking promotion, so letting `expireBooking` auto-promote the queue's first entry would leave two `active` rows on the same slot.

## Payment flow quick reference

**Stripe booking create**:
1. Viewer fills form → `POST /api/stripe/authorize` creates a PaymentIntent in manual-capture mode on the streamer's connected account.
2. Viewer confirms → PI status `requires_capture`. Row inserted as `pending` with `payment_intent_id`.
3. Streamer approves in admin → server flips to `active` (or queues if slot occupied).
4. Beam timer expires → `/api/stripe/end-early` (or `/api/bookings/expire-and-advance`) captures the PI. Cron (daily) sweeps any abandoned ones.

**Solana booking create**:
1. Viewer fills form → `start_beam` instruction on the Anchor program stakes SOL into a vault ATA under a PDA keyed by booking id.
2. DB row inserted as `pending` with `escrow_pda`, `viewer_wallet`.
3. Streamer approves → `active`.
4. Beam expires or streamer kicks → `settle_beam` instruction: streamer receives vested portion, viewer gets unvested refund, vault closes.
5. On-chain events sync back via `/api/solana/sync-webhook`.

**Important**: the Solana rail does **not** auto-promote the next queued booking on expire. The admin page's `playNow` handler explicitly kicks the current and starts the next. Don't add auto-promotion to the Solana rail without also updating the escrow program.

## Phase 3 — session-key delegation (the "no popup on approve" flow)

Phase 3 added a scoped delegation layer to the escrow program so the streamer doesn't have to sign a wallet popup every time a beam starts OR gets kicked early. The program still works without any of this — it's pure UX glue on top of `start_beam` / `settle_beam`.

**Program surface** (see `programs/casi-escrow/PRIMITIVE.md` for the full framing):

- `set_delegate` — streamer signs once, stores a session pubkey + expiry under a PDA keyed by the streamer.
- `revoke_delegate` — streamer invalidates the delegate at any time.
- `start_beam_delegated` — same effect as `start_beam`, but signed by the registered session key instead of the streamer wallet.
- `settle_beam_delegated` — same effect as `settle_beam`, signed by the session key. Vesting math is identical to wallet-signed settle, so a compromised session key can at worst force an early settle at the current vested point; funds still split per the on-chain schedule.
- `approve_flash_delegated` — same effect as `approve_flash` (Pending → Settled, full amount → streamer ATA), signed by the session key. Cranker pays fees + one-time streamer-ATA rent.
- `deny_flash_delegated` — same effect as `deny_flash` (Pending → Cancelled, full refund → viewer ATA), signed by the session key. Cranker pays fees (viewer almost always already has a USDC ATA since they funded from it).
- Scoping summary: the session key can ONLY call the four delegated twins above. It cannot withdraw funds outside the escrow's declared destinations (approve always goes to `escrow.streamer`, deny always goes to `escrow.viewer`, settle splits per the on-chain vesting schedule), cannot cancel pending escrows on the viewer's behalf, cannot change delegation.
- `cancel_stale_pending` — permissionless crank that refunds the viewer after a 7-day (`PENDING_TIMEOUT_SECS`) Pending timeout. Any signer can call it.

**Server surface**:

- `/api/solana/delegates/install` — streamer-auth; generates a session keypair, seals the secret with `DELEGATE_ENCRYPTION_KEY` (AES-256-GCM), upserts to `streamer_delegates`.
- `/api/solana/delegates/status` — UI helper to pick card state (not-installed / installed / expired / revoked).
- `/api/solana/delegates/revoke` — streamer-auth; stamps `revoked_at`. Admin should also fire `revoke_delegate` on-chain.
- `/api/solana/delegates/start-beam` — called by the admin page's approve handler when a healthy delegate exists. Signs `start_beam_delegated` with the decrypted session key. **Uses the cranker as fee payer** (the session key has no SOL; Solana refuses to debit an un-credited account).
- `/api/solana/delegates/settle-beam` — called by admin's `kickBeam` + `settleOrClearSolanaEscrow` (deny-on-Active). Signs `settle_beam_delegated` with the session key, cranker pays fees + ATA inits. On 503 `no_cranker` or any non-OK status, the admin page falls back to wallet-signed `settle_beam`.
- `/api/solana/delegates/approve-flash` / `/api/solana/delegates/deny-flash` — called by admin's `moderateSolanaFlash` before the wallet-sign path. Sign `approve_flash_delegated` / `deny_flash_delegated`; same outcome shape as settle-beam so `describeDelegateSettleFailure` maps reasons to toasts. Webhook mirror: the Helius handler routes flash instructions through `applyFlashTransition` (parallel to the bookings path) to flip `flashes.status` — both wallet-signed and delegate-signed trips converge there.

**The cranker** (`SOLANA_CRANKER_KEYPAIR` env var, loaded via `src/lib/cranker-keypair.ts`):

- Single shared keypair that pays fees for the delegated twins (`start_beam_delegated`, `settle_beam_delegated`) and signs the permissionless `cancel_stale_pending` crank from the daily reconciler.
- Required if the delegate flow is enabled. Unset = both delegated routes return 503 `reason: 'no_cranker'` and admin falls back to wallet-signed start/settle (popup per action). This is a safe degradation; the program doesn't care.
- Fund with ~0.05 SOL. Steady-state cost per delegated start or settle is ~10k lamports (0.00001 SOL, two signatures × 5k base fee). First-ever settle to a brand-new streamer OR first-ever refund to a brand-new viewer adds a one-time ~2.04M lamports (0.00204 SOL) ATA rent-exempt reserve per fresh ATA; once created, subsequent flashes/beams to the same wallet skip it. Worst-case both-ATAs-fresh is ~0.00409 SOL. Cancel-stale-pending cranks eat ~5k lamports each. At steady state 0.05 SOL covers thousands of operations.
- Loader returns `null` on missing/malformed env — never throws. Callers branch on null and either fall back or 503.
- **Daily balance monitor**: `/api/cron/cranker-monitor` (04:00 UTC) probes the cranker's SOL via `Connection.getBalance` and emits structured logs at two thresholds — `logWarn` at 0.005 SOL (~500 ops left), `logError` at 0.001 SOL (one fresh-ATA settle could break the next op). `ERROR_WEBHOOK_URL` fans the critical case out to Slack/Discord. Read-only; never moves funds.

**Where the install UI lives**: `DelegateKeyCard.tsx` (in `src/app/admin/_components/`) is the reusable card. It's mounted inside `src/app/admin/settings/_components/SessionKeySection.tsx`, which provides the `onInstalled` callback that signs `set_delegate` from the streamer wallet. The legacy `/admin` route's `ProfileEditCard` also references it but the new settings page is the canonical home.

**Install UX contract** (see `DelegateKeyCard.tsx` state machine):

Install is a two-phase write — DB row (server) + on-chain `set_delegate` (streamer wallet). Either can fail independently, so the component tracks a `needs-finalize` state:

1. `loading` → fetch status.
2. `absent` → "Install" button. Disabled unless `walletReady` (wallet connected AND matches `profile.solana_wallet`).
3. Click Install → POST `/api/solana/delegates/install` (DB upsert). Then call `onInstalled(sessionPubkey, expiresAt)` which the admin page implements as a `set_delegate` tx from the streamer wallet.
4. If step 3b throws, component stays in `needs-finalize` with a "Finalize →" button. Clicking re-runs `onInstalled` with the **same** session pubkey — no DB write, no key regeneration. Idempotent retry.
5. Green "✓ Delegate registered on-chain — view tx" with Solscan link on success.
6. Rotate = same flow but keeps the old `installed_at`; revoke flips DB `revoked_at` and (should) fire `revoke_delegate` on-chain.

**Never regenerate session keys on finalize retry** — the DB already has the pubkey committed. A new key means the on-chain `set_delegate` would register a stranger. Always re-use the pubkey the server returned.

**Env vars introduced in phase 3**:

| Name | Notes |
|---|---|
| `DELEGATE_ENCRYPTION_KEY` | 32 raw bytes, base64 or hex. `openssl rand -base64 32`. Rotating invalidates every installed delegate. |
| `SOLANA_CRANKER_KEYPAIR` | 64-byte secret as base58 OR JSON array. Same format as `~/.config/solana/id.json`. |

**Migration**: `supabase/migrations/20260425000000_streamer_delegates.sql` adds the `streamer_delegates` table (one row per streamer, sealed secret + pubkey + expiry + rotated/revoked timestamps).

**Don'ts**:

- Don't make the install button callable without `walletReady` — you'll leave orphan DB rows when the streamer clicks before connecting.
- Don't have the client sign `start_beam_delegated` / `settle_beam_delegated` with a user wallet. They're scoped to the session pubkey; a user-wallet sig will fail the `delegate.session_key == session` constraint.
- Don't reuse the cranker as the escrow vault authority, the streamer, or anything else money-moving. It's a fee payer. Keep its balance small.
- Don't skip the webhook for `start_beam_delegated` / `settle_beam_delegated` / `approve_flash_delegated` / `deny_flash_delegated` / `cancel_stale_pending` / `set_delegate` / `revoke_delegate` discriminators. For bookings the webhook is the only authoritative DB writer; for flashes both the webhook AND `/api/flashes/moderate` can write, but both gate on `WHERE status = 'pending'` so first-writer-wins and duplicates no-op. Delegated variants must share the non-delegated handler (`settle_beam_delegated` → `settle_beam`'s Active → expired path; `approve_flash_delegated` → pending → approved; `deny_flash_delegated` → pending → denied).

## Solana escrow state machine (read this before touching deny / refund paths)

**On-chain state is authoritative.** The DB is a projection; it can drift (tab closes mid-tx, cron hasn't run, webhook missed). Anything that acts on funds must probe the PDA first via `connection.getAccountInfo(pda)` and branch on the result.

**Program constraints (from `programs/casi-escrow/src/lib.rs`)**:

| State | Who can close it | How |
|---|---|---|
| `Pending` (viewer funded, streamer hasn't approved) | **viewer only** | `cancel_escrow` → 100% refund |
| `Pending`, age ≥ 7 days | **anyone (permissionless crank)** | `cancel_stale_pending` → 100% refund to viewer |
| `Active` (streamer called `start_beam`) | **viewer OR streamer** | `settle_beam` → pro-rata |
| after `elapsed ≥ duration` | **anyone (permissionless crank)** | `settle_beam` → 100% to streamer |

Streamers cannot cancel a `Pending` escrow from their side. That's a program-level constraint, not a UI choice — if you think you need to add it, update the program first.

`start_beam` and `settle_beam` both have delegated twins (`start_beam_delegated` / `settle_beam_delegated`) signed by a pre-registered session key instead of the streamer wallet. Same status effects and same vesting math — the program treats the session key as a narrow proxy for the streamer's signature, nothing more. See the phase-3 section above.

**Settle math**: `vested_to_streamer = total × min(elapsed, duration) / duration`, viewer gets the remainder. `elapsed = now − start_timestamp` where `start_timestamp` is set by `start_beam`. This means **a booking left in `denied` DB state while the escrow is still `Active` on-chain vests 100% to the streamer as wall-clock time passes**. Admin deny MUST call `settle_beam` immediately for Active escrows, not just flip DB status.

**EscrowState layout** (for raw decoding without loading the IDL):
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
`Settled` / `Cancelled` close the account, so if `getAccountInfo` returns non-null the status byte is only 0 or 1. Viewer-side recovery uses this to skip loading the IDL on every row.

**Recovery surfaces**:
- Viewer: `reclaimSolanaEscrow` in `overlay/page.tsx` — probes PDA, cancels if Pending, tells viewer "beam is live" if Active. Handles numeric booking ids. Shows for denied rows scoped by `viewer_name` (local-tab) OR `viewer_wallet` (cross-device same-wallet), so abandoning a tab and reconnecting from a new browser still surfaces the refund chip as long as the same wallet is used.
- Viewer bulk: `POST /api/bookings/cleanup-stale-solana` + the "Clean up ended" button in the overlay's "Your beams" header. Probes every denied/expired/cancelled Solana row for a given `viewer_wallet` and nulls `escrow_pda` where the on-chain PDA is actually gone. No auth — only write is clearing a DB column on rows whose funds already left the vault. Used to wipe "ghost" RECOVER USDC chips left over from prior builds / aborted flows.
- Streamer: none by design. Deny-on-Active settles immediately via `settleOrClearSolanaEscrow`, and the `cancel_stale_pending` crank in `/api/cron/solana-reconciler` refunds abandoned Pending escrows after 7 days. Admins don't need to babysit stuck escrows.
- Shared helper: `settleOrClearSolanaEscrow` in `src/lib/streamer-moderation.ts` — discriminated-outcome (`settled | closed | pending-chain | no-wallet | error`) so callers compose their own DB + toast logic without duplicating signing boilerplate. `kickBeam` uses this too: DB only transitions to `expired` when outcome is `settled` or `closed`. Every other outcome leaves the beam live with a toast — this is load-bearing, since flipping DB while the escrow is still Active on-chain is how streamers end up with "Ended early — USDC recoverable" ghost chips and vesting clocks that keep ticking. Accepts an optional `hooks.onDelegateFailure` callback so admin can toast the delegate failure reason before the wallet-sign fallback fires.

**Delegate failure diagnostics**:
- `trySolanaStartDelegated` / `trySolanaSettleDelegated` / `trySolanaFlashDelegated` (all exported from `src/lib/streamer-moderation.ts`) return a `DelegateSettleOutcome` discriminated union (`{ ok: true, alreadyProcessed? } | { ok: false, reason?, message?, status? }`). Never a bare boolean — every caller must branch on `.ok`.
- `describeDelegateSettleFailure(outcome)` (also in `src/lib/streamer-moderation.ts`) maps reason codes (`no_session | no_delegate | revoked | expired | no_cranker | decrypt_failed | key_mismatch | db_error | chain_error | network_error`) to user-facing strings. Admin callers toast this BEFORE the wallet-sign fallback so the streamer sees WHICH failure caused the popup.
- `/api/solana/delegates/settle-beam` 502 responses carry `casiError` (parsed Anchor variant via `parseCasiError`) and a prefixed `message` — the toast names the on-chain revert (`NotActive`, `Unauthorized`, `DelegateExpired`, etc.) instead of a bare opaque string.
- `no_cranker` (503) means `loadCrankerKeypair` returned null — env var unset / empty / wrong length / base58-decode failure. NOT a balance issue; the server never tries to submit when cranker can't load. If the env var IS set on Vercel but the route still returns `no_cranker`, the value is malformed (extra whitespace, wrong format, truncated paste).

## Migration workflow

- Timestamp filename: `YYYYMMDDHHMMSS_description.sql`.
- Apply via Supabase Dashboard → SQL Editor → New Query → paste → Run. Migrations are **not** auto-applied from the repo.
- Hobby plan can't use `CREATE INDEX CONCURRENTLY` inside a transaction — use plain `CREATE INDEX IF NOT EXISTS`. Locks are milliseconds at current scale.
- When testing RLS/GRANT changes, the Supabase SQL Editor runs as `service_role` and **bypasses grants**. Test from the client side with `curl` + the anon key:
  ```
  curl https://<ref>.supabase.co/rest/v1/<table>?select=<col>&limit=1 \
    -H "apikey: <anon-key>"
  ```

## Common gotchas

- **PostgREST returns NUMERIC columns as strings**. Always `Number(booking.duration_minutes)` before math.
- **Server routes need `export const dynamic = 'force-dynamic'`** (or a similar opt-out) whenever they read headers/cookies — or you'll get a build error about dynamic server usage.
- **Stripe Connect application fees** are set on the PaymentIntent at creation; can't be changed on capture. Plan the split up front.
- **Solana cluster mismatch**: `WALLET_ADAPTER_CLUSTER` + `EXPLORER_CLUSTER_QUERY` must match. Devnet wallet on mainnet endpoint = silent failure.
- **`file_type: 'video'`** means use `<video autoPlay loop muted playsInline>`. `SlotMedia` does this — don't `<img>` a video URL.
- **`profile_id` vs `auth.uid()`**: `profiles.id` = user id = `auth.uid()` for authenticated streamers. `bookings.profile_id` points at the streamer (who *receives*), not the viewer.
- **Numeric vs string `booking_id`**: PostgREST returns `bookings.id` as a JS number, but older server routes rejected `typeof booking_id !== 'string'`. Always accept either — `typeof x === 'number' ? x : String(x)` — or the viewer's client will silently 400. Affects `/api/bookings/viewer-deny`, `/api/bookings/attach-solana-tx`, `/api/bookings/expire-and-advance`.
- **`NEXT_PUBLIC_CASI_PROGRAM_ID` unset**: `CasiEscrowClient` throws a loud error in its constructor. Without this guard, unset env → client falls back to `SystemProgram.programId` and signs txs that look fine to the wallet but land on the wrong program.
- **Session key as fee payer**: neither `start_beam_delegated` nor `settle_beam_delegated` can be signed with the session key as fee payer — Solana returns `"Attempt to debit an account but found no record of a prior credit"` because the ephemeral key has never received SOL. Always pay fees with the cranker; co-sign with the session key. `loadCrankerKeypair` in `src/lib/cranker-keypair.ts` is the shared loader.
- **Cranker balance drift**: the cranker is the silent single point of failure for the delegated approve/kick flow. Monitor its SOL balance; if it hits 0, every approve AND every kick starts popping a wallet prompt again (routes return 503, admin falls back). Steady-state cost is ~10k lamports per start OR settle (base fee × 2 sigs); a one-time ~0.00204 SOL ATA rent is added the FIRST time a fresh streamer or viewer ATA is created. For a streamer with repeat viewers, subsequent operations are just the base fee — not 0.01 SOL each. The daily `cranker-monitor` cron warns/errors at 0.005 / 0.001 SOL thresholds via `ERROR_WEBHOOK_URL`.
- **Stripe denied-chip window**: the viewer overlay surfaces "✕ Denied — refund on the way" for Stripe denials within `STRIPE_DENIED_WINDOW_MS = 10 min` of `created_at`. Anchor on `created_at` because there's no `denied_at` column. The old 30s window meant a streamer denying after 30s + a viewer reload = no chip ever showed; 10 min covers realistic moderation latency.
- **`playNow` queue safety**: `kickBeam(current, { skipAutoAdvance: true })` is mandatory in `playNow`. Without the flag, `expireBooking` auto-promotes the queue's FIRST `approved_queued` row, then `playNow` ALSO promotes the booking the streamer clicked — both end up `active` on the same `element_id`, both vesting clocks tick, the overlay shows whichever `image_url` won the race.

## Observability

- `logError(scope, err, extra?)` and `logWarn(scope, msg, extra?)` from `src/lib/observability.ts` emit structured JSON to stdout. Vercel log drain picks them up automatically.
- Optional: set `ERROR_WEBHOOK_URL` env var to fan out to Slack/Discord/Better Stack. Payload shape: `{level, scope, message, stack, extra, ts}`.
- Client-side errors are captured by `ClientErrorReporter` and POSTed to `/api/log`. Dedupe window 10s, rate-limit 20/min/IP.

## Commands

- `npm run dev` — local dev server
- `npm run build` — production build (requires env vars; will fail in a bare sandbox, that's expected)
- `npx tsc --noEmit` — type check only
- `npm test` — 35 unit assertions, ~13ms
- `npm run lint` — ESLint

## When in doubt

- **Don't broaden RLS or add table-level GRANTs.** Go column-level.
- **Don't touch `admin/page.tsx` without extracting the piece you added to `_components/`** if it's more than ~30 lines of JSX.
- **Don't put new moderation logic in `admin/page.tsx`.** The four core handlers live in `src/lib/streamer-moderation.ts` so /admin and /studio share one implementation. Admin's local handlers are thin adapters that translate `ModerationResult` to toasts + optimistic state. New logic goes in the lib.
- **Don't add every-minute cron on Hobby.** Deploy will fail.
- **Don't call `select('*')` on bookings.** Use the explicit column list already in `admin/page.tsx` / `overlay/page.tsx`.
- **Don't auto-promote Solana queue on expire.** Escrow program isn't wired for it.
- **Don't flip a Solana booking's DB status without reconciling the chain first.** DB status ≠ escrow status; acting on the DB alone leaves funds stuck or over-vested to the streamer. Use `settleOrClearSolanaEscrow` or equivalent probe-first logic.
- **Don't build a second booking surface.** `/overlay` is the canonical Stripe + Solana booking flow; `/s/[username]` is a marketing landing page that funnels into it. If you need richer in-page booking on /s/[username], wire it through `/api/stripe/authorize` + `CasiEscrowClient` — never a parallel implementation.
