# Overlay QA Checklist — casi.gg

> Scope: `src/app/overlay/`, `_components/`, `src/app/api/`, `src/lib/`, `supabase/migrations/`  
> Date: 2026-06-22 | Stripe: **LIVE (real money)** | Solana USDC: **devnet-only**

---

## 1. Overlay Page Load

- **Given** a viewer navigates to `/overlay?s=<username>` with a valid streamer handle,  
  **when** the page mounts,  
  **then** it fetches the profile, overlay elements, and active bookings, then renders the `NameEntryScreen` (if no `casi_viewer_name` in localStorage) or the main overlay.

- **Given** the page loads with no `s=` param and `mode` is not `obs`,  
  **when** the effect runs,  
  **then** the browser is redirected to `/search`.

- **Given** `?mode=obs` is in the URL,  
  **when** the page mounts,  
  **then** the canvas renders on a transparent background, the booking form / flash panel / name screen are suppressed, and a 30-second watchdog timer starts to reload if Supabase Realtime goes silent.

- **Given** an unknown streamer handle (no `profiles` row),  
  **when** the profile query returns null,  
  **then** `loading` transitions to false and no crash occurs (blank state).

---

## 2. Viewer Identity / localStorage

- **Given** no `casi_viewer_name` in localStorage,  
  **when** the `NameEntryScreen` renders,  
  **then** a random `<Adjective><Animal><NN>` name is pre-filled and the viewer can edit it or roll a new one via "↺ random".

- **Given** the viewer types a name and presses "Enter stream →" (or hits Enter),  
  **when** `confirmName` is called,  
  **then** the name is written to `localStorage.casi_viewer_name`, `nameConfirmed` becomes `true`, and the main overlay is shown.

- **Given** a name is already saved in localStorage,  
  **when** the page loads,  
  **then** `NameEntryScreen` is skipped and the saved name is used immediately.

- **Given** the viewer clicks "Change" inside the booking form,  
  **when** the change-name flow completes,  
  **then** the old name is overwritten in localStorage and the booking form updates to show the new handle.

- **Given** a `cancel_token` has been issued for a booking,  
  **when** `rememberBookingToken(bookingId, token)` runs,  
  **then** the token is persisted to `localStorage.casi_booking_tokens` as a JSON map keyed by booking ID.

---

## 3. Slot Listing

- **Given** a streamer has configured overlay elements (beams, backdrops),  
  **when** the overlay loads,  
  **then** `SlotsList` renders all elements with `price_value >= 0` or `is_background = true`, showing price, status ("In use", "Locked", queue count), and a "★ Free" badge for `price_value = 0` slots.

- **Given** a slot has a pending queue of bookings,  
  **when** `queueCounts` is populated,  
  **then** the slot card shows "In use · N waiting" where N is the pending count.

- **Given** a slot is locked (`locked = true`),  
  **when** the viewer clicks it,  
  **then** the click is ignored (no booking form opens) and the card shows "🔒 Locked".

- **Given** the viewer already has a non-denied booking for a slot,  
  **when** the slot card renders,  
  **then** it shows the booking's status string and is non-clickable (`.s-disabled` class).

- **Given** a slot is occupied by another viewer's active booking and the current viewer has none,  
  **when** the viewer clicks it,  
  **then** `openSlot(el, true)` fires — the booking form opens in queue-join mode.

---

## 4. Beam / Backdrop Booking Form

- **Given** the viewer selects a slot,  
  **when** `openSlot` is called,  
  **then** the booking form scrolls into view (smooth, below the sticky nav), all fields reset to defaults, and duration is clamped to `slot.max_duration_minutes`.

- **Given** the form is open in URL-link mode,  
  **when** the viewer pastes an HTTPS image URL,  
  **then** a hidden `<img>` loads to validate it; the hint turns accent-colored on success, red on error, and yellow if the URL doesn't start with `https://`.

- **Given** the form is open in upload mode,  
  **when** the viewer selects a file,  
  **then** images are rejected above 5 MB, videos above 20 MB, and a successful upload shows "✓ Image/Video ready" with a remove button.

- **Given** the slot has `shape = 'banner'`,  
  **when** the viewer types a message,  
  **then** the live preview scrolling marquee appears below the textarea, message is capped at `BANNER_MAX_MESSAGE` characters, and the submit guard requires a non-empty message instead of media.

- **Given** the viewer has added media,  
  **when** the `CustomizePanel` auto-opens,  
  **then** offset X/Y (0–100%) and zoom (1–3×) sliders are functional and their values are sent in the booking body; banner slots show font-size and speed sliders instead.

- **Given** a slot has both a Stripe fiat price and a USDC price in its `prices` JSONB,  
  **when** the rail picker renders,  
  **then** two cards appear (Card / USDC), the default is Card, each card shows its own cost, and switching rail updates the pay button label to match.

- **Given** only one rail is priced for a slot,  
  **when** the rail picker renders,  
  **then** a single inert card is shown (no picker interaction needed).

- **Given** a slot is occupied and the current viewer has no booking for it,  
  **when** the viewer opens the form in queue-join mode,  
  **then** the header reads "⏳ Join queue" and the estimated-wait block shows `~N min · M booking(s) ahead`.

---

## 5. Free Booking (Turnstile + RLS + Profanity Filter)

- **Given** a `price_value = 0` slot is selected,  
  **when** the booking form renders,  
  **then** the Turnstile widget appears (no Turnstile on paid slots), the "free" rail is pre-selected, and the pay button reads "Send free request" or "Join free queue".

- **Given** the Turnstile widget fires `onVerify(token)`,  
  **when** `turnstileToken` state is set,  
  **then** the submit button becomes enabled (before this it is disabled by `freeBlocked`).

- **Given** a valid Turnstile token and clean text,  
  **when** `POST /api/bookings/create-free` is called,  
  **then** the server verifies the Turnstile challenge, checks the element really has `price_value = 0`, enforces the 60-second per-IP cooldown (via `free_flash_rate_limits`), rejects videos with 400, runs `moderateText` on viewer_name and message, inserts the booking as `pending / payment_method=free`, and returns `{ booking_id, cancel_token }`.

- **Given** the viewer's name contains profanity,  
  **when** the server calls `moderateText(viewer_name, 'viewer_name')`,  
  **then** the route returns 400 with "Text contains disallowed language."

- **Given** a free booking attempt within 60 seconds of a prior one from the same IP,  
  **when** `claimFreeSlot` checks `free_flash_rate_limits`,  
  **then** the server returns 429 "Slow down — one free booking per minute."

- **Given** the free slot has a video `file_type`,  
  **when** the server receives it,  
  **then** 400 is returned: "Videos are paid-slots only for now."

- **Given** an anonymous client tries to INSERT directly into `bookings` for a `price_value = 0` slot,  
  **when** Supabase RLS evaluates the insert,  
  **then** the insert is rejected (blocked by `20260419000000_p0_hardening.sql`; free bookings must go through the server route).

---

## 6. Stripe Paid Booking

> Stripe is **live** — use a real card only in production; test with Stripe test cards in dev.

- **Given** a paid slot is selected and Card rail is chosen,  
  **when** the viewer clicks "Pay $X.XX",  
  **then** `POST /api/bookings/create-stripe` runs (creates booking row + cancel_token), followed by `POST /api/stripe/authorize` which creates a PaymentIntent in manual-capture mode on the streamer's connected account; the browser redirects to the Stripe Checkout URL.

- **Given** the viewer completes payment on Stripe,  
  **when** Stripe redirects back to `/overlay?s=<username>&payment=success&booking_id=<id>`,  
  **then** a "Payment successful — request sent! 🎉" toast fires and the URL is cleaned to `?s=<username>`.

- **Given** the viewer clicks "Back" on the Stripe Checkout page,  
  **when** Stripe redirects to `?payment=cancelled&booking_id=<id>`,  
  **then** `POST /api/stripe/cancel` is called with the stored `cancel_token`, the booking is denied, and the toast reads "Payment cancelled".

- **Given** the viewer wants to cancel a pending Stripe booking they created,  
  **when** they click "✕ cancel" on their beam chip,  
  **then** `cancelBooking(bookingId)` POSTs to `/api/stripe/cancel` with the stored `cancel_token`, and on success the token is removed from localStorage.

- **Given** a streamer denies a Stripe booking within 10 minutes of `created_at`,  
  **when** realtime fires the status change,  
  **then** the viewer sees the "✕ Denied — refund on the way" chip and a toast for up to 60 seconds.

---

## 7. Solana Paid Booking

> All Solana flows are **devnet-only** (`NEXT_PUBLIC_CASI_SOLANA_ENABLED=true` required; USDC mint: 4zMMC9…DU).

- **Given** a paid slot with a USDC price and the USDC rail selected,  
  **when** the viewer has `< 0.01 SOL` in their wallet,  
  **then** a preflight check fires and the booking is denied on server side with "Need devnet SOL for rent + fees."

- **Given** the viewer has no devnet USDC ATA,  
  **when** the preflight runs `getParsedTokenAccountsByOwner`,  
  **then** 400 is returned and the toast directs to the SPL token faucet.

- **Given** the viewer has sufficient SOL and USDC and the booking row is created,  
  **when** `buildInitializeBeamTx` succeeds,  
  **then** the tx is submitted via either `window.phantom.solana.signAndSendTransaction` (Phantom in-app browser), or `sendTransaction` (wallet adapter), racing against a 25-second PDA poll.

- **Given** the wallet submits the tx but the promise hangs (known Phantom Android WebView drop),  
  **when** the PDA poll detects the escrow account on-chain within 25 seconds,  
  **then** `attach-solana-tx` is called without a signature (`tx_signature: ''`), the toast shows "◎ Payment locked — awaiting streamer approval!", and the slot form closes.

- **Given** the viewer is on mobile Chrome with a Phantom Connect session,  
  **when** `needsMobileHandoff() && !isInWalletBrowser()` is true,  
  **then** the page redirects to the Phantom deeplink to sign, stashing the pending booking in localStorage; on return via `?phantom_action=sign-resume` the page calls `attach-solana-tx` with the returned signature.

- **Given** the viewer rejects the wallet popup,  
  **when** `isUserRejection(err)` is true,  
  **then** `viewer-deny` is called, the booking is marked denied, and the toast reads "Transaction rejected in wallet".

- **Given** a Solana booking is denied with funds still in the escrow PDA,  
  **when** the realtime update fires,  
  **then** the chip shows "✕ Denied — USDC locked" in purple and a "recover USDC" button appears; clicking it calls `reclaimSolanaEscrow` which reads the on-chain status byte at offset 161 and calls `cancel_escrow` (Pending) or `settle_beam` (Active).

- **Given** a pending Solana booking with no escrow_pda in DB but funds on-chain (mobile timeout race),  
  **when** the page reloads with the viewer's cancel_token still in localStorage,  
  **then** the PDA backfill probe runs, calls `attach-solana-tx` if the PDA exists, and the toast shows "Found N stuck booking(s) on-chain — streamer can approve now."

---

## 8. Flash Form — All Three Payment Tabs

- **Given** the FlashPanel's composer renders (requires `viewerName`, at least one payment rail available on the streamer profile),  
  **when** the viewer expands the composer,  
  **then** only payment tabs for available rails are shown: Stripe tab if `stripe_account_id` is set; USDC tab if `solana_wallet` is set AND `NEXT_PUBLIC_CASI_SOLANA_ENABLED=true`; Free tab if `allow_free_flashes = true`.

- **Given** the Free tab is selected and Turnstile is verified,  
  **when** the viewer submits a message ≤ 240 chars,  
  **then** `POST /api/flashes/create` with `payment_method='free'` runs the 60s cooldown check and profanity filter; on success a pending flash row is created.

- **Given** the Stripe tab is selected with `amount_cents >= 100` (minimum $1),  
  **when** the viewer submits,  
  **then** a Stripe Checkout session is created via `POST /api/flashes/create` (direct charge on the streamer's connected account, manual capture, zero platform fee), and the browser redirects to Stripe.

- **Given** Stripe flash checkout completes and redirects to `?flash_success=1&flash_id=<id>`,  
  **when** the overlay page mounts,  
  **then** the toast "⚡ Flash sent — awaiting streamer approval!" fires and the URL params are cleaned.

- **Given** the USDC tab is selected (devnet-only) and the streamer has a `solana_wallet`,  
  **when** `POST /api/flashes/create` with `payment_method='solana'` is called,  
  **then** the server returns `{ flash_id, solana_wallet }` and the client initiates the escrow flow via `PaymentManager.sendFlash`.

- **Given** the viewer sends a flash message that contains profanity (checked by `moderateText`),  
  **when** the server processes it,  
  **then** the route returns 400 with "Text contains disallowed language."

- **Given** `amount_cents < 100` is submitted for a paid flash,  
  **when** the server validates,  
  **then** 400 is returned: "Minimum flash amount is $1.00."

---

## 9. Realtime Flash Feed (OBS Overlay + Viewer Panel)

- **Given** the streamer approves a flash,  
  **when** the Supabase `UPDATE` event fires on the `flashes` table (`status → 'approved'`),  
  **then** `FlashFeed.tsx` (OBS overlay canvas layer, bottom-right corner) picks up the event via `postgres_changes` and prepends the flash to the 5-item queue with a `flashPop` CSS animation.

- **Given** a flash has been in the feed for 25 seconds (`DISPLAY_MS = 25_000`),  
  **when** the 1-second cleanup interval fires,  
  **then** the item is removed from the feed array and disappears from the UI.

- **Given** a Solana flash has a non-null `tx_signature`,  
  **when** the flash card renders in `FlashFeed`,  
  **then** a "↗ verify on Solscan" link appears pointing to `solscan.io/tx/<sig>?cluster=devnet`.

- **Given** the `ViewerFlashesFeed` renders in the left panel (non-OBS viewer mode),  
  **when** it hydrates on mount,  
  **then** it fetches approved flashes since local midnight, ordered descending, and shows up to 6 rows; new approvals are picked up via a realtime `*` subscription that re-queries and replaces the list.

- **Given** a reconnect replays a Supabase event with an older `commit_timestamp`,  
  **when** `lastEventTsRef` is checked,  
  **then** the stale event is dropped and the UI is not re-triggered.

---

## 10. "Your Activity" Section

- **Given** the viewer has a saved name or connected wallet,  
  **when** `loadData` runs,  
  **then** `MyTransactionsSection` queries bookings and flashes created since local midnight, deduplicating by ID across `viewer_name` and `viewer_wallet` queries.

- **Given** a beam was ended early by the streamer (both `started_at` and `ended_at` are set),  
  **when** the row appears in `MyTransactionsSection`,  
  **then** the aired duration is prorated (`min(elapsed, duration) / duration × booked_cents`) and the row shows e.g. "32s (early) · message — 0.18 USDC".

- **Given** the viewer has a mix of Stripe and USDC transactions,  
  **when** the footer renders,  
  **then** the "You've sent" total groups by rail: "X.XX USDC + €Y.YY" (denied and cancelled rows are excluded from the total).

- **Given** a transaction has a Solana `tx_signature`,  
  **when** the row renders,  
  **then** a "↗" link to Solscan appears beside the status label.

- **Given** a beam is still `active`,  
  **when** the status label renders,  
  **then** it shows "live" in green (`#4ade80`); `approved_queued` shows "queued" in yellow.

---

## 11. "Your Beams" Section (MyBeamsSection)

- **Given** the viewer has a live beam,  
  **when** `MyBeamsSection` renders,  
  **then** a countdown timer (via `Countdown.tsx`, 1-second interval) shows remaining time.

- **Given** the countdown reaches 0,  
  **when** `onExpire` fires,  
  **then** `POST /api/bookings/expire-and-advance` is called (server verifies the timer is genuinely overdue with a 409 guard against race); on success the booking advances from the queue if any.

- **Given** the remaining time drops below the warning threshold,  
  **when** `onWarning(seconds)` fires,  
  **then** the chip turns yellow ("⚠ Expiring") and the booking ID is added to the `expiringSoon` set.

- **Given** the viewer clicks "✕ end early" on a live Solana beam,  
  **when** `settleSolanaBeam` is called,  
  **then** the chip immediately shows "⏳ Ending…" (optimistic), `settle_beam` is called on-chain, and on success the toast reads "◎ Beam ended — refund returned to your wallet."

- **Given** a Solana booking has `status = 'denied'` and `escrow_pda` is non-null,  
  **when** the chip renders,  
  **then** it shows purple "✕ Denied — USDC locked" and a "recover USDC" button (calls `reclaimSolanaEscrow`).

- **Given** a Solana booking has `status = 'expired'` with `escrow_pda` non-null (kick-leaked),  
  **when** the chip renders,  
  **then** it shows "⚡ Ended early — USDC recoverable" with a recover button.

- **Given** the viewer has a connected wallet and at least one denied/expired Solana row with a PDA,  
  **when** `MyBeamsSection` renders,  
  **then** a "Clean up ended" button appears; clicking it POSTs to `/api/bookings/cleanup-stale-solana` which probes each PDA server-side and nulls `escrow_pda` only where the on-chain account is gone.

---

## 12. Stuck Flashes Panel (StuckFlashesPanel)

- **Given** the viewer has a Solana flash with `status = 'pending'` and non-null `escrow_pda`,  
  **when** `loadData` runs,  
  **then** the flash appears in `StuckFlashesPanel` showing amount, truncated message, and a "Recover" button.

- **Given** the viewer clicks "Recover" on a stuck flash,  
  **when** `reclaimFlashEscrow` runs,  
  **then** it probes the PDA on-chain; if closed, calls `POST /api/flashes/viewer-recover` to flip the DB row and dismiss the card; if still open with status `Pending`, calls `cancel_escrow` and then `viewer-recover` after the tx lands.

---

## 13. Browse Streams Modal

- **Given** the viewer clicks the "Browse streams" link,  
  **when** `BrowseStreamersModal` opens,  
  **then** it queries `profiles` for `is_live = true`, orders by username, and shows each streamer's display name, handle, avatar (or letter fallback), and a pulsing "Live" badge.

- **Given** no streamers are live,  
  **when** the list renders,  
  **then** the empty state reads "Nobody's live right now."

- **Given** the viewer types in the search box,  
  **when** the filter runs,  
  **then** results are narrowed by case-insensitive match on `display_name` or `username`.

- **Given** the viewer clicks a streamer card or presses Escape,  
  **when** the navigation occurs,  
  **then** the card navigates to `/overlay?s=<username>` (full page load) or the modal closes, respectively.

---

## 14. Wallet Connection

- **Given** the USDC rail is selected in the booking form or flash composer,  
  **when** the viewer clicks the pay button before connecting a wallet,  
  **then** `openWalletModal()` fires; the wallet-adapter modal opens; no automatic connect fires on page load.

- **Given** the user selects a wallet in the modal,  
  **when** `userInitiatedConnect` ref is true,  
  **then** `connect()` is called on the adapter — this is the only path that triggers a wallet popup on desktop.

- **Given** the wallet connects and `publicKey` becomes non-null,  
  **when** `viewerWalletRef` updates,  
  **then** `loadData` re-runs, adding denied/expired Solana bookings keyed by `viewer_wallet` to the viewer's visible rows (cross-device recovery).

- **Given** a Phantom Connect session is stored in localStorage (from a prior mobile deeplink),  
  **when** the overlay loads,  
  **then** `phantomConnectSession` is truthy, `hasPhantomConnectSession` gates the Solana pay button as "connected", and the displayed pubkey comes from the session.

---

## 15. Content Moderation

- **Given** any string submitted as `viewer_name`,  
  **when** `moderateText(text, 'viewer_name')` runs on the server (called in `create-free` and `flashes/create`),  
  **then** names longer than 32 characters are rejected with "Name too long", empty strings with "Empty text not allowed", and strings matching the `obscenity` English dataset with "Text contains disallowed language."

- **Given** any flash or booking message,  
  **when** `moderateText(text, 'message')` runs,  
  **then** messages longer than 240 characters are rejected and profane content is blocked (same `obscenity` matcher, no external API call).

- **Given** the server validates a banner-slot booking,  
  **when** `validateBannerBooking(shape, message)` runs,  
  **then** a non-banner slot returns `{ ok: true }` immediately; a banner slot with an empty or missing message returns `{ ok: false }`.

---

## 16. Countdown Timers

- **Given** an active booking has `started_at` set,  
  **when** `getSecondsRemaining(booking)` is called,  
  **then** it computes `(duration_minutes * 60) - (Date.now() - new Date(started_at).getTime()) / 1000`, floored to avoid float display bugs (`3:34.999…`).

- **Given** the `Countdown` component mounts with a booking,  
  **when** the 1-second interval fires,  
  **then** the displayed string updates via `formatTime(seconds)` and `onWarning(s)` is called each tick.

- **Given** `getSecondsRemaining` returns ≤ 0 and `onExpire` has not yet fired,  
  **when** the interval fires,  
  **then** `firedRef.current` is set to `true` and `onExpire()` is called exactly once.

---

## Partial / Constrained Areas

⚠️ **Solana all flows** — devnet-only: requires `NEXT_PUBLIC_CASI_SOLANA_ENABLED=true`, devnet wallet, devnet USDC (mint 4zMMC9…DU). All Solana checklist items above must be run against devnet; mainnet launch is pending external audit.

⚠️ **Flash USDC tab** — not testable unless `NEXT_PUBLIC_CASI_SOLANA_ENABLED=true` is set in the environment; the tab is hidden client-side when the flag is false regardless of `solana_wallet` value on the profile.

⚠️ **Stripe flash checkout cancel path** (`flash_cancelled=1`)  — the URL is generated by `flashes/create` but the overlay page has no handler for `flash_cancelled`; the flash row is left as `pending` until the streamer denies it manually or the daily cron sweeps it. Do not test expecting an auto-deny.

⚠️ **OAuth providers (Twitch / Discord / X)** — buttons are wired in code but Supabase Dashboard enablement is unconfirmed for non-Google providers; clicking them in production may throw "provider is not enabled."

⚠️ **"Clean up ended" bulk cleanup** — calls `/api/bookings/cleanup-stale-solana` which probes each PDA; on devnet this can be slow (RPC rate limits). Not meaningful without at least one prior Solana booking.
