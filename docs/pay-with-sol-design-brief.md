# "Pay with SOL" — design brief

## What this is

An option on the Solana booking confirmation flow: a viewer who holds SOL but not USDC can pay for a beam/backdrop booking without leaving the app to swap first. Under the hood, a SOL→USDC swap runs as its own transaction, then the existing escrow deposit runs as a second, separate transaction — **two wallet signatures, not one.**

## Why two signatures, not one

The original design bundled the swap and the escrow deposit into a single transaction. Measured live (2026-09-08) against real Jupiter API responses: even the simplest possible swap route (18 accounts, single-hop) combined with the deposit instruction comes out to 1240 bytes — 8 over Solana's 1232-byte legacy transaction hard limit. This isn't a tunable parameter; there's no route small enough to fit both in one legacy transaction. VersionedTransaction+ALT was considered and rejected as materially more complex for a first ship; the two-signature split was the lowest-risk correct option.

Practical effect: the confirm modal shows "Step 1 of 2 · Swap SOL → USDC," the viewer signs, then — after a real on-chain confirmation, not just RPC-queue acceptance — the *same* modal reopens automatically pre-filled ("✓ Step 1 done · Step 2 of 2") for the plain, already-proven direct-USDC flow. One more tap, one more signature, done. True zero-tap auto-chaining was considered and rejected: Android won't open a wallet deeplink from a JS-driven redirect that isn't the direct result of a user gesture, so an automatic second redirect right after the swap confirms would likely fail silently on mobile.

## Why this exists at all

CASI's escrow settles in USDC only (by design — see `AGENTS.md`, "Don't add SOL pricing rows..."). That's the right call for the vault itself (stable value for the whole booking duration, no re-audit of the mainnet contract). But it means a viewer who only holds SOL couldn't book at all without a separate manual swap first. This closes that gap client-side, with zero changes to the escrow program — the deposit instruction itself is completely unmodified.

## Status: shipped, tested end-to-end

Verified live on both desktop (wallet-adapter) and mobile (Solflare via Phantom Connect deeplink) — swap lands, form/modal state survives the mobile round-trip, booking completes, escrow funds. Code lives in:
- `src/lib/jupiter-swap.ts` — quote + swap-instruction fetching (no UI)
- `src/app/overlay/_components/SolanaConfirmModal.tsx` — the confirm UI, including the 2-step badge
- `src/app/overlay/page.tsx` — `submitSolanaBooking`'s `paySol` branch (the swap step) + the `phantom-connect-return` handler's `kind === 'swap'` branch (mobile round-trip)
- `src/lib/phantom-connect.ts` — `PendingBooking['swap_ctx']` carries the whole booking form (slot, duration, image, message, customize params) across the mobile redirect so the confirm modal can restore and reopen itself rather than stranding the viewer on a bare page

## Real bugs found and fixed getting here

Worth keeping — these were genuine, non-obvious bugs, not one-off flukes, and the fixes are load-bearing:

1. **Oversized combined transaction** (above) — the reason this is two signatures.
2. **Solflare's response-param quirk**: appends its callback params with a bare `?` instead of `&` when `redirect_link` already has a query string (ours always does) — silently made the whole return handler no-op on every wallet response, success or error, with zero trace. Fixed by normalizing any non-leading `?` to `&` before parsing.
3. **Dapp encryption keypair reused forever**: Solflare's own docs recommend a fresh x25519 keypair per connect session; this codebase persisted one forever. `regenerateDappKeypair()` now runs before every connect initiation.
4. **Return-handler double-fire**: the effect depends on `[profile?.id]`, which flips from unset to set shortly after mount — a real double-fire, not hypothetical, that could resubmit an already-landed signed transaction and surface a harmless "already been processed" RPC error as a false failure. Fixed with a synchronous per-response dedup guard.
5. **Swap pre-flight didn't reserve SOL for the second transaction**: the swap step only budgeted for the swap itself, not the ~0.015 SOL the booking transaction separately needs for its own escrow-account rent — a viewer near the margin could swap successfully and then get stuck unable to afford the booking. Fixed by reserving `MIN_SOL_FOR_BOOKING_LAMPORTS` on top of the swap amount.
6. **`media_zoom` range mismatch** (unrelated to the swap mechanics, found while completing the first real end-to-end test): the zoom slider allowed up to 6x (later raised to 20x at the user's request) but the database constraint only allowed 4x — live on every payment rail in production, not just this feature. Shipped as a separate hotfix to `main`.

## Tone / constraints (still apply)

- v9 tokens only (`--ink`, `--paper`, the derived ladder) — no hardcoded colors except the existing error red (`#f87171`) and warning yellow (`#facc15`) already used elsewhere in this modal.
- Reads as reassuring, not a fee disclosure — the confirm modal breaks out the true total SOL requirement (swap amount + network margin + one-time USDC-wallet-setup cost + the booking-tx reserve) rather than presenting one blended, unexplained number.
- No design work needed on the streamer side — this is invisible to streamers; approve/settle/kick are unaffected.
- SOL-only for now — no multi-token picker.

## Possible follow-ups (not started)

- Streamer/product framing of "why two taps" if it comes up as a support question — the mechanism is explained above but there's no viewer-facing copy about it beyond the step badge.
- Revisit VersionedTransaction+ALT if a genuinely one-signature flow becomes a priority later; rejected this round as unnecessary complexity for a working two-signature ship.
