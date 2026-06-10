import type { GameState } from './types';
import { findValidFoundation, isAutoCompleteable } from './rules';
import { moveTableauToFoundation, moveWasteToFoundation } from './moves';

export { isAutoCompleteable };

export type AutoCompleteMove =
  | { from: 'waste'; pileIndex: number }
  | { from: 'tableau'; colIndex: number; pileIndex: number };

export function findAutoCompleteMove(state: GameState): AutoCompleteMove | null {
  if (state.waste.cards.length > 0) {
    const card = state.waste.cards[state.waste.cards.length - 1];
    const pi = findValidFoundation(card, state.foundations);
    if (pi !== -1) return { from: 'waste', pileIndex: pi };
  }

  // Prefer lower ranks to build foundations evenly and avoid out-of-order issues
  let best: { colIndex: number; pileIndex: number; rank: number } | null = null;
  for (let col = 0; col < 7; col++) {
    const cards = state.tableau[col].cards;
    if (cards.length === 0) continue;
    const card = cards[cards.length - 1];
    if (!card.faceUp) continue;
    const pi = findValidFoundation(card, state.foundations);
    if (pi !== -1 && (best === null || card.rank < best.rank)) {
      best = { colIndex: col, pileIndex: pi, rank: card.rank };
    }
  }
  if (best) return { from: 'tableau', colIndex: best.colIndex, pileIndex: best.pileIndex };

  return null;
}

export function applyAutoCompleteMove(state: GameState, move: AutoCompleteMove): GameState {
  if (move.from === 'waste') {
    return moveWasteToFoundation(state, move.pileIndex) ?? state;
  }
  return moveTableauToFoundation(state, move.colIndex, move.pileIndex) ?? state;
}
