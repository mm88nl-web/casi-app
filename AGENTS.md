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
  admin/              streamer dashboard (auth-gated)
    page.tsx          main file — kept <2k lines by design
    _components/      private components (underscore = Next.js ignores for routing)
  overlay/            OBS browser-source target (renders active beams)
  api/
    bookings/         create/expire/advance/deny + per-rail variants
    stripe/           authorize, cancel, webhook, end-early, approve-queue
    solana/           sync-webhook (on-chain events → DB)
    cron/             stripe-janitor (daily safety net for abandoned PIs)
    flashes/          tip-style ephemeral messages
    log/              client-side error ingest (rate-limited)
  ...
src/lib/
  casi-escrow.ts      Anchor client wrapper
  casi-errors.ts      enumerated on-chain error names → user-readable
  observability.ts    structured JSON logs → stdout + optional webhook
  solana-network.ts   cluster + explorer URL helpers
  stripe.ts           Stripe SDK singleton
programs/casi-escrow/ Anchor program source (Rust)
supabase/migrations/  SQL, applied via Supabase Dashboard SQL Editor
tests/unit/           mocha + chai, wired into CI via .github/workflows/ci.yml
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

## Admin page conventions

- `src/app/admin/page.tsx` is the kitchen sink — canvas, requests queue, modals, toasts. Kept together because state flows top-down and splitting the state shards makes things worse. But every self-contained UI chunk is extracted into `_components/`.
- When adding a new card or panel, follow the existing split pattern: one component per file, props-driven, variant prop (e.g. `kind: 'beam' | 'backdrop'`) to share a component across similar but differently-themed surfaces.
- `playNow`, `kickBeam`, `approveBooking`, `denyBooking` are the four core handlers. They close over supabase + profile + state and get passed into card components as callbacks. Don't duplicate them into children.

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
- **Don't add every-minute cron on Hobby.** Deploy will fail.
- **Don't call `select('*')` on bookings.** Use the explicit column list already in `admin/page.tsx` / `overlay/page.tsx`.
- **Don't auto-promote Solana queue on expire.** Escrow program isn't wired for it.
