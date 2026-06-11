# Solitaire V2 — Plan for Fable 5

> **Status (June 2026): V2 is implemented.** Logic lives in
> `src/app/solitaire/_components/gameLogic.ts` (pure, tested in
> `tests/unit/solitaire.test.ts`), UI in `SolitaireGame.tsx`. Shipped: deal /
> FLIP-move / flip animations, win cascade, drag-and-drop with snap-back +
> tap fallback, undo (capped history), localStorage stats, auto-complete,
> draw-3 mode, `?skin=` theming, hints (H), keyboard shortcuts, responsive
> column compression, SEO content layer + VideoGame/FAQPage JSON-LD.
> Remaining ideas from this plan: full arrow-key pile navigation
> (Priority 9 is only partially done — cards are focusable but there is no
> pile-to-pile arrow movement), per-move screen-reader announcements, and a
> redo stack.

This document was the brief used to take `/solitaire` from a functional V1 to a polished, competitive free solitaire experience. The game is live at `src/app/solitaire/`. Read the component and the CLAUDE.md before extending it.

---

## Context

`/solitaire` is a free, no-ads Klondike solitaire on casi.gg. The SEO angle is clean execution against ad-heavy competitors. V1 ships a fully playable game with click-to-move, a timer, move counter, and win detection. V2 is about depth, polish, and discoverability — things that keep people coming back and tell Google the page is worth ranking.

---

## Priority 1 — Animations

These are the biggest perceived-quality gap between V1 and a "real" solitaire.

**Card deal animation**
- On new game, cards should fly from a center point to their tableau positions with a staggered delay (col 0 first, col 6 last). ~30ms stagger between cards, ~280ms per card using `cubic-bezier(0.22, 1, 0.36, 1)`.
- Implement with CSS `@keyframes` + inline `animation-delay`. Cards start at a shared origin (`transform: translate(...)`) and move to their resting position.

**Card move animation**
- When a card (or sequence) is moved, it should slide to the destination rather than snap.
- Simplest approach: clone the card DOM node, animate the clone with `translate` from source rect to dest rect (`getBoundingClientRect()` diff), then swap to the actual card when the animation ends (~180ms).
- Alternative: use the FLIP technique (First-Last-Invert-Play) — record position before state update, update state, then animate from the delta.

**Card flip animation**
- When a face-down card flips up after moving a sequence off it, do a 3D Y-axis rotation: `rotateY(0deg → 90deg)` (shows back), swap content at 90°, continue `rotateY(90deg → 0deg)` (shows face). ~220ms total.
- Trigger: after `tryMove` returns a state where a card that was `faceUp: false` is now `faceUp: true`.

**Win cascade**
- On win, cards fly off the screen from the foundation piles one by one, bouncing like the classic Windows Solitaire win screen.
- Each card gets a random velocity vector (`vx`, `vy`), gravity is applied each frame via `requestAnimationFrame`. Cards wrap or disappear at viewport edges.
- Duration: ~4 seconds of cascade, then show the win modal.

---

## Priority 2 — Drag and Drop

V1 is click-to-move. Drag-and-drop is the expected interaction on both desktop and mobile.

**Desktop (mouse)**
- `pointerdown` on a face-up card: start drag, create a ghost element that follows the pointer. Ghost = the card(s) being dragged, styled with `box-shadow` and slight rotation.
- `pointermove`: translate ghost to pointer position. Highlight valid drop targets (tableau columns, foundation piles) with a teal border glow.
- `pointerup`: if over a valid target, commit the move via `tryMove`. Otherwise, snap-back animation (ghost returns to source position, then disappears).
- Valid target detection: use `document.elementFromPoint()` to find what's under the cursor, look for `[data-pile]` attributes.

**Touch (mobile)**
- Same pointer events work for touch (pointer events API handles both). Add `touch-action: none` on draggable cards.
- Tap-to-select should still work as a fallback when the drag distance is < 8px.

**Snap-back animation**
- If a drag is released on an invalid target, animate the ghost element back to the source position using a short spring (200ms). Important for mobile UX — users need to know the move failed without an alert.

---

## Priority 3 — Undo / Redo

V1 has no undo. Add it.

**State history**
- Keep a `history: G[]` array alongside the current `G`. Every successful move pushes the previous state onto history. Cap at 50 entries to bound memory.
- `undo()`: pop from history, set as current state, clear selection.
- `redo()`: maintain a `future: G[]` stack. Undo pushes current onto future; redo pops from future.

**UI**
- Undo button in the header (↩ icon). Keyboard shortcut: `Ctrl+Z` / `Cmd+Z`.
- Redo: `Ctrl+Shift+Z` / `Cmd+Shift+Z`. Or just omit redo — undo-only is simpler and sufficient for most players.
- Show undo count badge: "↩ 3" so players know how many moves they can take back.

---

## Priority 4 — Statistics

Returning players want to know their win rate. Store stats in `localStorage` under key `casi-solitaire-stats`.

**Shape**
```ts
interface Stats {
  played: number;
  won: number;
  streak: number;
  bestStreak: number;
  bestTime: number | null;   // seconds, only counting wins
  totalMoves: number;
}
```

**Tracking**
- Increment `played` when a new game starts (not on page load — only after first card move or after completing a game to avoid counting abandoned loads).
- Increment `won` and update `streak`, `bestStreak`, `bestTime` on win.
- Reset `streak` on a loss (when the player manually starts a new game from a non-won state with moves > 0).

**UI**
- Stats modal accessible from a small "📊" or chart icon in the header.
- Show: games played, win rate (%), current streak, best streak, best time.
- "Reset stats" link at the bottom of the modal.

---

## Priority 5 — Auto-Complete

When all tableau cards are face-up (no hidden cards remain), the game is guaranteed to be won. At that point:
- Show an "Auto-complete" button (or auto-trigger after 2 seconds).
- Animate the remaining moves automatically: sweep cards to foundations one at a time using the card move animation from Priority 1.
- Detection: `g.tab.every(col => col.every(c => c.faceUp))`.

---

## Priority 6 — Draw-3 Mode

Standard Klondike can be played draw-1 (current) or draw-3 (harder, more strategic).

**Draw-3 rules**
- Draw 3 cards from stock at a time; only the top of the 3 is playable.
- When stock is exhausted, recycle waste — but in Vegas scoring, recycling is limited.
- Show all 3 drawn cards fanned in the waste area (offset, same negative-margin technique as tableau).

**Toggle**
- Add a "Draw 1 / Draw 3" toggle in a settings panel or directly in the header.
- Default: draw-1 (V1 behavior). Persist choice in `localStorage`.

---

## Priority 7 — Theming

Streamers on casi.gg have custom skins (ink + paper tokens). Expose those skins on the solitaire page.

**URL param**: `/solitaire?skin=twitch` sets `--ink: #9146FF; --paper: #0e0e1a`.

**Skin map** (mirror `src/lib/skins.ts`):
```
casi-dark  →  ink #0DCFB0  paper #0C0D11  (default)
twitch     →  ink #9146FF  paper #0e0e1a
kick       →  ink #53FC18  paper #0a1a0a
youtube    →  ink #FF0000  paper #0d0606
mono       →  ink #E8E8E8  paper #0a0a0a
rose       →  ink #F472B6  paper #0a0515
```

Card backs should pick up `--ink` so the back pattern reflects the active skin. The card face color (red/black) does not change — it is defined by the card suit, not the theme.

**Streamer link**: a streamer could share `casi.gg/solitaire?skin=kick` and the page loads in Kick green. Low-effort branding touchpoint.

---

## Priority 8 — Hint System

For new players: press `H` or tap a "?" button to highlight one valid move.

**Algorithm (simple)**
1. Check waste top card → any valid foundation move? Highlight it.
2. Check each tableau column top card → any valid foundation move? Highlight it.
3. Check each tableau column top card (or sequence) → any valid tableau column destination? Highlight source + destination.
4. If stock has cards, highlight stock as the hint.

Show hints as a pulsing teal outline on source + destination. Clear after 3 seconds or on next interaction.

---

## Priority 9 — Accessibility and Keyboard Navigation

**Current state**: V1 has `tabIndex` and `aria-label` on cards but no keyboard navigation between piles.

**Keyboard model**
- Arrow keys navigate between piles (Left/Right between columns in the top row and tableau row, Up/Down between rows).
- `Enter` or `Space` selects/confirms (mirrors mouse click behavior).
- `Tab` cycles through interactive elements (stock, waste, foundations, first card in each column).
- `H` for hint, `N` for new game, `U` for undo.

**Screen reader**
- `aria-live="polite"` region announces moves: "Queen of Hearts moved to King of Spades in column 3."
- Foundation build announcements: "Ace of Spades placed on foundation."
- Win announcement: "You won in 74 moves and 4 minutes."

---

## Priority 10 — SEO Content Layer

The game page itself ranks for "free solitaire", but adding a content section below the fold helps capture long-tail queries and builds topical authority.

**Sections to add (below the game, hidden by default, expanded via "How to play" link)**
- How to play Klondike Solitaire (rules: stock, waste, foundation, tableau — 200 words)
- What is Solitaire? (brief history, 100 words)
- Tips for winning (3-5 tips, 150 words)
- FAQ: "Can every solitaire game be won?" / "What is draw-3 mode?" / "What are the foundations for?"

**Schema markup**: add `FAQPage` and `Game` JSON-LD in the `<head>` (in `page.tsx`, the server wrapper):
```json
{
  "@type": "Game",
  "name": "Klondike Solitaire",
  "description": "...",
  "url": "https://www.casi.gg/solitaire",
  "applicationCategory": "Game",
  "operatingSystem": "Any",
  "offers": { "@type": "Offer", "price": "0" }
}
```

---

## Implementation notes for Fable 5

- Read `AGENTS.md` / `CLAUDE.md` before touching any files — specifically the v9 design system and the "don't hardcode brand colors" rule.
- `src/app/solitaire/_components/SolitaireGame.tsx` is the entire game — no split needed unless it exceeds ~700 lines, at which point extract `gameLogic.ts` (pure functions) and `Cards.tsx` (card components).
- All `tryMove` / `canFound` / `canTab` logic is pure and has no side effects — unit-testable. Write tests in `tests/unit/solitaire.test.ts` before touching the logic.
- Animations: do NOT use a third-party animation library. The CSS `@keyframes` + FLIP technique covers everything needed here without adding bundle weight.
- Stats localStorage key: `casi-solitaire-stats`. Don't change it after shipping — it's the user's historical data.
- The word generator at `/words` is a separate feature (`src/app/words/`). It shares no code with solitaire — don't merge them.
