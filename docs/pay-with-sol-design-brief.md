# "Pay with SOL" — design brief

## What this is

A new option on the Solana booking confirmation flow: a viewer who holds SOL but not USDC can pay for a beam/backdrop booking without leaving the app to swap first. Under the hood, a SOL→USDC swap gets bundled into the same transaction as the existing escrow deposit — **one wallet signature, not two.**

## Why

CASI's escrow settles in USDC only (by design — see `AGENTS.md`, "Don't add SOL pricing rows..."). That's the right call for the vault itself (stable value for the whole booking duration, no re-audit of the mainnet contract). But it means a viewer who only holds SOL currently can't book at all without a separate manual swap first. This closes that gap entirely client-side, with zero changes to the escrow program.

## Current implementation status

Functional MVP, **not yet visually designed** — currently plain inline styles matching the modal's existing pattern, not a real design pass. Not yet tested end-to-end (blocked on Jupiter being mainnet-only — no devnet test path — and a separate Supabase outage). Code lives in:
- `src/lib/jupiter-swap.ts` — quote + swap-instruction fetching (no UI)
- `src/app/overlay/_components/SolanaConfirmModal.tsx` — where the actual UI is
- `src/app/overlay/page.tsx` — wiring or `submitSolanaBooking`

## What needs a design pass

The existing `SolanaConfirmModal` is a dark-surface receipt-style card (mono font, `--surf` background, `--ink-22` border, 16px radius) showing slot/duration/rate/total, then a balance line, then Confirm/Cancel buttons. The new piece is a **checkbox + conditional balance-row swap**, currently just:

- A checkbox, shown only when USDC balance is insufficient: *"Not enough USDC — swap SOL for it automatically (one signature, via Jupiter)"*
- When checked, the balance row switches from showing USDC balance to showing the live SOL quote (`≈ X.XXXX SOL`), with an insufficient/error state in red

### States to design
1. Default (USDC sufficient) — unchanged from today, no toggle shown.
2. USDC insufficient, toggle unchecked — toggle visible, offering the SOL path.
3. Toggle checked, quote loading.
4. Toggle checked, quote resolved, SOL balance sufficient — Confirm enabled.
5. Toggle checked, quote resolved, SOL balance still insufficient — Confirm disabled, clear reason why.
6. Toggle checked, quote fetch failed — clear, non-scary retry state.

### Tone / constraints
- Use v9 tokens only (`--ink`, `--paper`, the derived ladder) — no hardcoded colors except the existing error red (`#f87171`) and warning yellow (`#facc15`) already used elsewhere in this modal.
- Should read as reassuring, not as a fee disclosure — the added cost to the viewer is trivial (same base network fee, a small buffer that mostly comes back as unused USDC in their wallet rather than being spent) and the added time is under a second. Don't design it like a warning.
- Make "one signature" legible somehow — viewers may assume "swap" means a separate step.
- No design work needed on the streamer side — this change is invisible to streamers; approve/settle/kick are completely unaffected.
- SOL-only for now — no multi-token picker needed yet.

## Reference

Full technical + product context: session notes in this Claude Code project's memory (`casi-payment-flexibility` and `casi-competitor-novelty-check`) if picking this up fresh.
