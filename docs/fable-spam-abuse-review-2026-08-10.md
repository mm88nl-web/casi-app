# CASI app-layer spam/abuse review

**Reviewer**: Fable 5 (Claude Agent), acting under the owner's authorization as a defensive review of their own product.
**Date**: 2026-08-10
**Scope**: app-layer TypeScript/Next.js abuse surfaces across both payment rails — booking/flash creation, Stripe Checkout Session creation, the free tier, Turnstile coverage, webhook auth, Discord bot interactions, signup, cron endpoints, and dashboard-side amplification. This is the sequel to `docs/fable-security-review-2026-08-10.md`, which covered `programs/casi-escrow/src/lib.rs`'s own on-chain exploitability — that program is **not** re-reviewed here. This pass is scoped to spam/abuse/DoS in the surrounding app.

## What was checked and how

Read `AGENTS.md` end-to-end first for the architecture, the known gaps it already documents (per-IP-only rate limiting on booking creation, the in-memory delegate rate limiter), and the "don't touch payment-flow logic" constraint. Then read every route under `src/app/api/{bookings,flashes,stripe,webhooks,discord,abuse,cron,solana}` that a viewer, streamer, or unauthenticated caller can reach, cross-referencing each against `src/lib/rate-limit.ts`, `src/lib/turnstile.ts`, `src/lib/content-moderation.ts`, and the relevant Supabase migrations for indexes/constraints. `src/app/studio/page.tsx`'s realtime subscription + dashboard query logic was read to assess DB/client load under spam volume. For the one claim asked about specifically (`capped-mainnet-plan.md`'s "rate-limit on signup IP already exists"), traced the actual signup path in `src/app/login/page.tsx`.

Where a defect could be demonstrated without live credentials, I built a runnable proof. `programs/casi-escrow/src/lib.rs` was not modified; no route was hit with real Stripe/Solana/Discord credentials; the one runnable PoC below is a pure in-memory re-implementation of the reviewed algorithm, not a live network call.

---

## Findings, most severe first

### 1. [HIGH — live on real money today] `/api/flashes/create`'s paid branches have *zero* rate limiting and *zero* Turnstile check — the only booking/flash-creation route missing both

**What's wrong**: every sibling creation route has *some* per-IP speed bump: `create-free` (`src/app/api/bookings/create-free/route.ts:158-167`), `create-solana` (`src/app/api/bookings/create-solana/route.ts:121-128`), and `create-stripe` (`src/app/api/bookings/create-stripe/route.ts:113-120`) all call a `claimSlot`-style cooldown before inserting. `flashes/create`'s **free** branch does too (`src/app/api/flashes/create/route.ts:131-144`, plus a Turnstile check at line 131). But the **paid branches** — `stripe` and `solana` — fall straight through to the insert at line 178 and the Stripe Checkout Session creation at line 217 with no call to `verifyTurnstileToken`, `inMemoryRateLimit`, `claimFreeFlashSlot`, or any other gate. Confirmed by grep: `getClientIp`/`resolveViewerKey`/rate-limit logic in this file is only ever invoked inside the `if (method === 'free')` block (lines 127–175); the paid path (lines 177–243) has no such call anywhere.

**Why this is worse than the already-known IP-rotation gap**: the known gap (Finding 3 below) requires an attacker to defeat a limiter that exists. Here there is no limiter to defeat — a single machine on a single IP, with no proxy pool, can call this route as fast as the network allows.

**Attack scenario**: `POST /api/flashes/create` with `{ profile_id: <any real streamer>, viewer_name: "x", message: "x", amount_cents: 100, payment_method: "stripe" }`, looped with no delay. Each call:
- Inserts a `pending` row into `flashes` (line 178–190), and
- Calls `stripe.checkout.sessions.create()` **on the streamer's live connected Stripe account** (line 217) — a real Stripe API call, not a local operation.

Stripe is documented as **live on real money** (AGENTS.md: "card payments are LIVE on real money as of 15 May 2026"), so this isn't a devnet-only concern. Stripe's own API rate limits (roughly 100 req/s in live mode, shared across the platform key since Direct Charges reuse one platform-level `sk_live_…` with a per-request `stripeAccount` header) are shared across **every** streamer on CASI, not scoped per-target. A sustained flood from one attacker against this one route can push the platform key toward Stripe's own throttling, which would start degrading or failing legitimate Checkout Session creation for every other streamer's real viewers mid-payment — the failure mode isn't confined to the targeted streamer.
The `solana` branch is cheaper per-call for CASI (just a DB insert, no external call) but has the identical zero-throttle problem, so it's a pure unbounded-row-growth vector into `flashes` on its own.

**Attacker cost vs. impact**: cost = one unauthenticated HTTP loop, no proxy needed, no captcha to solve, no valid Solana/Stripe credentials required. Impact = real Stripe API pressure on the live platform key (all streamers) + unbounded `flashes` table growth + a burst of Discord notification calls once payment webhooks land, which can trip Discord's own per-webhook rate limit (`src/lib/notify.ts` does a plain `fetch()` with no 429/backoff handling) and cause **legitimate** notifications to silently drop during/after an attack.

**Severity**: HIGH. This is the single cheapest, most-reachable, live-money-relevant gap found in this pass.

---

### 2. [HIGH — structural, becomes real-$ post-mainnet] Two unauthenticated routes turn one HTTP request into up to 100 real Solana RPC calls each, with no rate limiting

**What's wrong**:

- **`POST /api/bookings/cleanup-stale-solana`** (`src/app/api/bookings/cleanup-stale-solana/route.ts`) takes a bare `{ viewer_wallet?, viewer_name?, profile_id? }` body with **no auth token of any kind** (confirmed: no `Authorization` header check, no `cancel_token`, no rate-limit import anywhere in the file — grep confirms this). It queries up to 100 matching `bookings` rows (line 76: `.limit(100)`) and then does a **sequential loop calling `conn.getAccountInfo(pda)` for every one of them** (lines 99–122) — up to 100 real Solana RPC calls per single POST. The file's own comment even names the risk and does nothing about it: *"Helius rate-limits bursts. A short-circuit parallel fan-out is available if this ever shows up as slow — for now the simple loop is plenty"* (line 97) — this is about performance, not abuse; there is no throttle.
- **`POST /api/bookings/expire-and-advance`** (`src/app/api/bookings/expire-and-advance/route.ts`) is also fully unauthenticated (any `booking_id` accepted, no ownership check) and does one `conn.getAccountInfo()` RPC call (lines 70–81) any time it's called against a currently-`active` Solana booking whose timer hasn't naturally elapsed yet — which is exactly the "attacker calls it early and often" case, since the guard that would reject the request (`if (!timerElapsed && !onChainClosed) return 409`, line 83) runs **after** the RPC probe, not before it. The route is legitimately called by the viewer's own browser exactly once, only when its own countdown hits zero (`src/app/overlay/page.tsx:854-864`) — any higher-frequency traffic against an ID whose timer hasn't run out is not something a real client ever does.

**Why the matching data is cheap to obtain**: `cleanup-stale-solana`'s `viewer_wallet`/`viewer_name` match is a straight `.eq()`/`.or()` against the `bookings` table. Per AGENTS.md's own RLS section, **`anon` has column-level SELECT on `bookings`, including `viewer_wallet`** (only `cancel_token` is excluded). That means an attacker doesn't need to guess wallets or names — they can pull real, currently-matching values directly from Supabase's own public PostgREST API with the (public, client-embedded) anon key, e.g. `GET .../rest/v1/bookings?select=viewer_wallet&payment_method=eq.solana&status=in.(denied,expired,cancelled)&escrow_pda=not.is.null`, then feed each one straight back into `cleanup-stale-solana` to guarantee a row match and trigger the RPC loop. `expire-and-advance`'s `booking_id` is a small sequential integer (AGENTS.md's own "Numeric vs string `booking_id`" gotcha confirms `bookings.id` is a plain number), and any currently-live Solana beam is by definition visible on that streamer's public `/overlay` — there's no secret to guess.

**Impact today vs. post-mainnet**: `NETWORK` is currently `'devnet'` (`src/lib/solana-network.ts:28`), and `SOLANA_RPC` defaults to the free public `api.devnet.solana.com` unless `NEXT_PUBLIC_SOLANA_RPC` is already overridden. So right now the direct dollar cost is low — the damage is public-devnet-RPC throttling degrading the Solana booking flow for everyone. But `solana-network.ts`'s own header comment says flipping to mainnet requires setting a **paid** RPC provider (Helius/QuickNode/Triton) "or booking failures under load" — at that point, these two routes become a **real, metered, unauthenticated cost surface**: an attacker sending, say, 10 req/s to `cleanup-stale-solana` with a batch of pre-harvested wallets sustains up to ~1,000 RPC calls/sec against CASI's paid RPC key, with no code-level ceiling at all. This is exactly the kind of gap worth closing **before** the capped-mainnet cutover the review context describes, not after.

**Severity**: HIGH as a structural/pre-mainnet-blocker finding (unauthenticated, unbounded, no rate limit at all); currently bounded by devnet's free-tier RPC, so today's blast radius is availability/degradation rather than a real invoice.

---

### 3. [Characterizing the known gap] The per-`(streamer_id, IP-hash)` rate limiter, proven bypassable, and how cheaply

This is the gap AGENTS.md already flags ("Per-IP rate limit only on booking-creation routes... Add per-profile_id rate limit alongside per-IP"). Per the task brief, characterizing it rather than re-stating it:

**How the bypass works, proven**: `claimFreeSlot`/`claimFreeFlashSlot`/`claimSlot` (identical shape in `create-free`, `create-solana`, `create-stripe`, and `flashes/create`'s free branch) all key a shared `free_flash_rate_limits` table row on `(streamer_id, viewer_key)` where `viewer_key = "ip:" + sha256(getClientIp(req))`. Nothing checks how many *distinct* `viewer_key` rows already exist for a given `streamer_id` — there is no secondary/aggregate cap. I wrote a side-effect-free, in-process re-implementation of the exact algorithm (no network calls, no real credentials) and ran it:

```
=== Test 1: same IP, rapid-fire against one streamer ===
  request 1 from fixed IP -> ALLOWED
  request 2-5 -> blocked (429)
  result: 1/5 allowed from ONE identity — limiter works correctly in isolation

=== Test 2: rotate through 50 distinct source IPs against the SAME streamer ===
  50/50 allowed against the SAME streamer_id within 100s of wall-clock time
  (the per-key cooldown never once triggered — every key was fresh)
```
Full script: see Appendix A below.

**Realistic attacker cost**: `getClientIp()` checks `x-real-ip` first, falling back to the first `x-forwarded-for` entry — and per the code's own comment (`flashes/create/route.ts:34-35`), the assumption is that Vercel's edge sets `x-real-ip` from the real TCP peer and it "cannot be spoofed by clients" via a raw header. If that holds, the bypass genuinely requires **distinct source IPs**, not just editing a header in a script — but distinct IPs are cheap: rotating-residential-proxy plans (tens of dollars a month for effectively unlimited rotating IPs) or even a handful of mobile-carrier NAT changes are enough; no botnet is required, and the free-tier cooldown (60s) and Solana/Stripe booking cooldowns (5s) are short enough that a modest pool (tens of IPs, not thousands) sustains a high steady rate indefinitely.
**One important caveat I could not resolve without live traffic (out of scope for this pass)**: AGENTS.md states casi.gg fronts Vercel with **Cloudflare**. With Cloudflare terminating the client connection and re-connecting to Vercel, the "real" peer IP Vercel's edge observes may be one of Cloudflare's own edge IPs rather than the true client — in which case whether `x-real-ip` reflects genuine per-visitor identity depends on how that hop is configured, something this code-only review can't verify. This could make the practical bypass *easier* than "get N distinct IPs" (if many real visitors already collapse toward a small set of observed IPs, legitimate users could even trip false positives) or could be a non-issue if Vercel already unwraps Cloudflare's `CF-Connecting-IP` correctly — worth an explicit check against real traffic rather than assuming either way.

**Blast radius once bypassed**:
- **DB query layer holds up**: `bookings`/`flashes` both have `(profile_id, status)` composite indexes (`supabase/migrations/20260424000000_hot_path_indexes.sql:20-21,49-50`), and the dashboard's pending-queue queries are all `.limit(50)`/`.limit(10)` (`src/app/studio/page.tsx:354-380`) — so the Postgres side does **not** degrade into full-table scans even under thousands of spam rows. This is a checked-clean result worth stating plainly.
- **The real amplifier is client-side, not DB-side**: `studio/page.tsx`'s realtime subscriptions (lines 466-478) call `reload(profileId)` — which fires **7 parallel Supabase queries** (lines 352-381) — on *every single* `postgres_changes` INSERT/UPDATE/DELETE event for that streamer's `bookings`/`flashes` rows, with **no debounce** (confirmed: no `debounce`/`throttle` anywhere in the file; `lastEventRef` is only used for a watchdog timer, not to coalesce bursts). So N spam inserts in a tight window doesn't cost the streamer N queries — it costs **7×N** queries fired from their own open browser tab, back-to-back, against the same shared Supabase project every other streamer's dashboard also depends on. At a sustained bypass rate of even a few requests per second (trivial per the cost analysis above), this turns into dozens of queries per second from one victim's tab alone. Supabase Realtime also has its own per-project message-rate ceiling; a large enough burst risks that ceiling being hit for the *whole* project, not just the targeted streamer.
- **Queue burial, not queue overflow**: the pending-queue UI is capped at the newest 50 rows (`.order('created_at', { ascending: false }).limit(50)`), so a sustained flood doesn't crash the dashboard — it **buries real pending bookings/flashes off the visible list** behind spam, which is a real moderation-availability problem even though nothing technically breaks.
- **`/api/stripe/authorize` has a second, independent weakness worth connecting here**: its own comment already says its 30-per-60s limiter is "per-instance" (`src/app/api/stripe/authorize/route.ts:13-19`, backed by `inMemoryRateLimit` in `src/lib/rate-limit.ts`, whose own header comment states buckets are "NOT shared across concurrent serverless instances"). This means **even without any IP rotation**, plain concurrent request fan-out against the *same* pending `booking_id` can exceed the nominal cap once Vercel spins multiple lambda instances under load — the identical architectural gap already documented as Finding 5 in the escrow review (delegate routes' in-memory limiter), now confirmed to also apply to a route that creates real Stripe Checkout Sessions. Each hit also calls `stripe.accounts.retrieve()` (line 70) in addition to `checkout.sessions.create()` — two live Stripe API calls per attempt, on the same shared platform key discussed in Finding 1.

**Severity**: HIGH/MEDIUM depending on rail — same underlying defect as AGENTS.md already tracks, but now quantified: cheap (tens of dollars in proxy access, no botnet), sustainable, and its real damage is a 7x-amplified client-side/Supabase-project-wide load spike plus queue burial, not a DB crash.

---

### 4. [MEDIUM] `capped-mainnet-plan.md`'s "rate-limit on signup IP already exists" is not enforced by anything in this repo

The plan's risk table lists this as the stated mitigation for "cap evasion via multi-account abuse" (`capped-mainnet-plan.md:326`). Tracing the actual signup path (`src/app/login/page.tsx:180-222`): account creation calls `supabase.auth.signUp()` **directly from the client** (line 187) with an *optional* Turnstile token (`options: realCaptchaToken ? { captchaToken: realCaptchaToken } : undefined`, line 189) — and the submit button is only disabled on `!acceptedTos || loading` (line 670), **not** on captcha completion. If the Turnstile widget fails to load, is blocked, or simply hasn't resolved yet, signup proceeds with `options: undefined` and no token is sent at all.

More importantly: nothing in `src/app/login/page.tsx` is a server-side gate. `supabase.auth.signUp()` calls Supabase Auth's own public REST endpoint directly using the anon key, which is embedded in client JS and therefore public. A scripted attacker doesn't need to touch `/login` or its Turnstile widget at all — they can call Supabase's signup endpoint directly. Whatever "rate-limit on signup IP" exists is therefore entirely a **Supabase Auth platform default** (GoTrue has its own built-in per-IP signup/email-send throttling), not anything this codebase enforces, verifies, or would even notice if disabled. This is the same class of risk AGENTS.md already documents for OAuth providers ("may not be enabled in the dashboard yet") — a confident claim resting on dashboard configuration this review can't verify from code, flagged per the task brief's note that several such claims in these docs turned out to be stale.

**Severity**: MEDIUM. Not a proven live bypass (didn't hit live Supabase Auth, per the no-real-credentials constraint), but the plan's mitigation for cap-evasion-via-multi-accounting has zero app-layer backing today.

---

### 5. [MEDIUM] `/api/abuse/report`'s rate limit is bypassable the same way, but the blast radius is smaller

`src/app/api/abuse/report/route.ts` does correctly apply Turnstile (line 90) and a 5-reports/hour/IP cap (lines 96-111) — both enforced before the insert. But the cap is the same `hashIp(getClientIp(req))`-keyed pattern as Finding 3, so the same IP-rotation bypass applies: a modest proxy pool defeats the hourly cap entirely, and nothing caps total reports per target (`target_username`/`target_url`) either. Confirmed via grep that **no code anywhere reads from `abuse_reports`** outside this route and the migration that creates it (`supabase/migrations/20260419000000_p0_hardening.sql`) — there is no automated consequence (no auto-suspend, no auto-takedown) wired to report volume, so mass-reporting can't directly grief a streamer's live status. The realistic damage is flooding CASI's own manual-triage table/inbox, which the route's own docstring says is reviewed by hand ("Operators triage reports from the admin tooling or straight from the table") — a real report (e.g. an actual DMCA notice) could get buried in noise, but nothing auto-executes against the targeted streamer.

**Severity**: MEDIUM — same bypass mechanics as Finding 3, meaningfully smaller blast radius since there's no automated trigger downstream.

---

### 6. [LOW] Two minor, low-blast-radius gaps noted for completeness

- **`/api/webhooks/pumpfun`** (`src/app/api/webhooks/pumpfun/route.ts`) has no auth check at all (by explicit design — comment says "does NOT touch the database or business logic"). Confirmed: it only `console.log`s parsed event fields and always returns 200. An attacker could POST arbitrary garbage here to generate Vercel log noise, but there's no DB write, no notification fan-out, and no state change reachable. Not worth fixing unless Vercel log-volume cost becomes a concern.
- **`/api/log`** (`src/app/api/log/route.ts`) has a real per-IP rate limit (20/min, lines 38-48) and caps message/stack/extra field lengths, but uses the same in-memory-per-instance pattern as Finding 3's `stripe-authorize` limiter — the route's own comment acknowledges this is "protecting against a single noisy tab, not DDoS." If `ERROR_WEBHOOK_URL` is configured, a sustained flood (via IP rotation or concurrent fan-out) could spam CASI's own Slack/Discord ops channel, but each message is small and capped, so this is a minor operational-noise risk, not a data or payment risk.

---

## Checked and found clean

- **Stripe never touches raw card data.** Grepped every route under `src/app/api` for `paymentIntents.create`, `paymentMethods.create`, `charges.create`, `tokens.create`, `CardElement`, `confirmCardPayment` — zero matches anywhere in the codebase. Every payment-creating route (`/api/stripe/authorize`, `/api/flashes/create`'s stripe branch, `/api/stripe/approve-queue`) exclusively calls `stripe.checkout.sessions.create()`; raw card entry happens entirely on Stripe's own hosted Checkout page behind Stripe's own Radar. The classic card-testing vector (attacker submits many stolen card numbers directly against a merchant's own PaymentIntent API to probe validity) **does not apply** to this architecture — there is no route that accepts raw payment method data directly. This holds for every Stripe-touching route in the codebase, confirmed by exhaustive grep, not just the routes named in the review brief.
- **Turnstile is genuinely server-enforced where it's applied.** `verifyTurnstileToken` (`src/lib/turnstile.ts`) fails closed on a missing/malformed token, on Cloudflare's own siteverify rejecting it, and on a network error reaching Cloudflare (each returns `{ ok: false }`, and every call site checks `.ok` before proceeding to any DB write). The dev-mode skip (verification bypassed if `TURNSTILE_SECRET_KEY` is unset) is intentional and documented, not a live bypass — it would only matter if the prod env var were unset, which this review can't verify but has no reason to suspect (same caveat class as the OAuth "may not be enabled" pattern already in AGENTS.md). All three call sites (`create-free`, `flashes/create`'s free branch, `abuse/report`) run the captcha check before any database write, not after.
- **`/api/webhooks/solana` (Helius) auth is sound on every path.** The shared-secret compare (`src/app/api/webhooks/solana/route.ts:82-89`) correctly checks `a.length === b.length` **before** calling `timingSafeEqual` (avoiding the length-mismatch throw), fails closed if `HELIUS_WEBHOOK_SECRET` is unset, and there's no early-return branch that skips the check. Replay-safety verified by reading every `applyTransition`/`applyFlashTransition` case: `initialize_escrow` only notifies on `isFirstFunding` (guarded by `!booking.tx_signature`, so a replayed delivery is a pure no-op after the first), and every other transition (`start_beam`, `settle_beam`, `cancel_escrow`, flash approve/deny) is gated by a narrow `WHERE status = <expected prior state>` clause, making duplicate deliveries idempotent by construction. The price-integrity fix from the earlier escrow review (Finding 1 there) is confirmed live in this file (lines 227-244).
- **`/api/stripe/webhook` signature verification and idempotency are both solid.** Tries both `STRIPE_WEBHOOK_SECRET` and `STRIPE_WEBHOOK_SECRET_PLATFORM` via `stripe.webhooks.constructEvent`, rejects if neither is configured or neither verifies. Dedup via a `stripe_webhook_events` upsert with `ignoreDuplicates: true` (lines 56-73) correctly short-circuits replayed/retried deliveries, and correctly rolls back the dedup marker + returns 5xx (rather than silently swallowing) if the downstream DB write fails, so Stripe's own retry isn't wrongly treated as "already handled."
- **`/api/discord/interactions` signature verification is applied on every path, before any processing.** `verifySignature()` (Ed25519 via WebCrypto) runs first in the handler (line 118) and the function returns `false` on any exception (fails closed); `ix.guild_id !== ALLOWED_GUILD` is checked before any DB read (line 129). There is no code path that reaches a DB mutation without both checks passing. This directly answers the review brief's question about today's `BOT_TOKEN` removal — the endpoint's authorization model doesn't depend on a bot token at all, it depends entirely on the Ed25519 signature, which is intact.
- **All three cron endpoints are consistently protected.** `stripe-janitor`, `solana-reconciler`, and `cranker-monitor` each independently implement the identical pattern: fail closed with a 500 if `CRON_SECRET` is unset, otherwise a length-checked `timingSafeEqual` compare against `Bearer ${cronSecret}`. No route under `/api/cron/` is missing this check.
- **Viewer-authenticated mutation routes correctly gate on `cancel_token`.** `/api/bookings/viewer-deny`, `/api/bookings/attach-solana-tx`, and `/api/stripe/cancel` all require a `tokensMatch(claimedToken, booking.cancel_token)` match before touching another viewer's row — these are not spammable into cross-viewer interference.
- **Studio dashboard's DB-query layer does not degrade under row-count spam.** `(profile_id, status)` composite indexes exist for both `bookings` and `flashes` (`20260424000000_hot_path_indexes.sql`), and every dashboard query is `.limit()`-bounded. The amplification risk under spam is entirely the un-debounced realtime-reload pattern described in Finding 3, not Postgres query cost.

---

## If you fix only three things

1. **Add the same per-IP cooldown (+ Turnstile, for the free-adjacent risk) to `/api/flashes/create`'s `stripe`/`solana` branches** that every sibling booking/flash-creation route already has (Finding 1). This is live against real Stripe money today and is the cheapest, most-reachable gap in this review — no proxy pool, no captcha-solving, nothing but an unthrottled loop.
2. **Put a rate limit (and ideally a `cancel_token`/auth requirement) on `/api/bookings/cleanup-stale-solana` and `/api/bookings/expire-and-advance`**, and consider moving the RPC probe in `expire-and-advance` to *after* the timer/status guard rather than before it (Finding 2). Both are unauthenticated, unthrottled, and turn one request into up to 100 real Solana RPC calls — low-cost today on public devnet RPC, but a real metered-cost DoS surface the moment a paid RPC key is wired in for mainnet.
3. **Close the long-known per-`profile_id` gap** (AGENTS.md already specifies the fix: add a `profile_id`-or-account-scoped secondary cap alongside the per-IP one) **and debounce `studio/page.tsx`'s realtime `reload()` calls** (Finding 3) — right now every spam write is amplified 7x into DB query load fired from the streamer's own dashboard tab with no coalescing, which is a bigger practical risk than any single spam row.

---

## Appendix A — rate-limit bypass proof (full script)

Pure in-memory re-implementation of `claimFreeSlot()` from `src/app/api/bookings/create-free/route.ts:44-73` (identical shape in the other three call sites). No network calls, no real Supabase/Stripe/Solana credentials used — this exercises the algorithm directly, not the live route.

```js
const crypto = require('crypto');
const FREE_BOOKING_COOLDOWN_MS = 60_000;

// ---- Test 1: single identity is correctly throttled -----------------------
const table = new Map();
function claimFreeSlot(streamerId, viewerKey, now) {
  const key = `${streamerId}::${viewerKey}`;
  const existing = table.get(key);
  if (existing !== undefined && now - existing < FREE_BOOKING_COOLDOWN_MS) return false;
  table.set(key, now);
  return true;
}
function hashIp(ip) { return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32); }

const streamer = 'streamer-abc-123';
const fixedIp = '203.0.113.7';
let t = Date.now(), allowedCount = 0;
for (let i = 0; i < 5; i++) {
  const ok = claimFreeSlot(streamer, `ip:${hashIp(fixedIp)}`, t);
  if (ok) allowedCount++;
  t += 2_000;
}
// -> 1/5 allowed from ONE identity (expected: 1) — limiter works correctly in isolation

// ---- Test 2: N distinct IPs against the SAME streamer ---------------------
const table2 = new Map();
function claimFreeSlot2(streamerId, viewerKey, now) {
  const key = `${streamerId}::${viewerKey}`;
  const existing = table2.get(key);
  if (existing !== undefined && now - existing < FREE_BOOKING_COOLDOWN_MS) return false;
  table2.set(key, now);
  return true;
}
const N = 50;
let t2 = Date.now(), allowed2 = 0;
for (let i = 0; i < N; i++) {
  const proxyIp = `198.51.100.${i}`;
  const ok = claimFreeSlot2(streamer, `ip:${hashIp(proxyIp)}`, t2);
  if (ok) allowed2++;
  t2 += 2_000;
}
// -> 50/50 allowed against the SAME streamer_id within 100s of wall-clock time
```

Output (actually run, `node` — see run log above): Test 1 correctly blocks 4/5 repeat requests from one identity; Test 2 allows all 50/50 requests from 50 distinct simulated IPs against the same streamer, because `claimFreeSlot`/`claimFreeFlashSlot`/`claimSlot` never check how many distinct `viewer_key` rows already exist for a `streamer_id` — only the per-key cooldown, which a fresh key always passes.
