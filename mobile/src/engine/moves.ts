import type { Card, GameState } from './types';
import {
  canPlaceOnFoundation,
  canPlaceOnTableau,
  isValidTableauSequence,
  wouldWin,
} from './rules';

function flipTop(cards: Card[]): Card[] {
  if (cards.length === 0) return cards;
  const top = cards[cards.length - 1];
  if (top.faceUp) return cards;
  return [...cards.slice(0, -1), { ...top, faceUp: true }];
}

function checkWin(state: GameState): GameState {
  return wouldWin(state) ? { ...state, won: true } : state;
}

export function drawFromStock(state: GameState): GameState {
  const { stock, waste, drawMode } = state;
  if (stock.cards.length === 0) {
    if (waste.cards.length === 0) return state;
    return {
      ...state,
      stock: { cards: [...waste.cards].reverse().map(c => ({ ...c, faceUp: false })) },
      waste: { cards: [] },
      moveCount: state.moveCount + 1,
    };
  }
  const drawN = Math.min(drawMode, stock.cards.length);
  const drawn = stock.cards.slice(-drawN).map(c => ({ ...c, faceUp: true }));
  return {
    ...state,
    stock: { cards: stock.cards.slice(0, stock.cards.length - drawN) },
    waste: { cards: [...waste.cards, ...drawn] },
    moveCount: state.moveCount + 1,
  };
}

export function moveWasteToFoundation(state: GameState, pileIndex: number): GameState | null {
  const waste = state.waste.cards;
  if (waste.length === 0) return null;
  const card = waste[waste.length - 1];
  const pile = state.foundations[pileIndex];
  if (!canPlaceOnFoundation(card, pile)) return null;

  const newFoundations = state.foundations.map((f, i) =>
    i === pileIndex
      ? { suit: f.suit ?? card.suit, cards: [...f.cards, { ...card, faceUp: true }] }
      : f
  ) as GameState['foundations'];

  return checkWin({
    ...state,
    waste: { cards: waste.slice(0, -1) },
    foundations: newFoundations,
    moveCount: state.moveCount + 1,
  });
}

export function moveWasteToTableau(state: GameState, colIndex: number): GameState | null {
  const waste = state.waste.cards;
  if (waste.length === 0) return null;
  const card = waste[waste.length - 1];
  const col = state.tableau[colIndex].cards;
  const targetTop = col.length > 0 ? col[col.length - 1] : null;
  if (!canPlaceOnTableau(card, targetTop)) return null;

  const newTableau = state.tableau.map((c, i) =>
    i === colIndex ? { cards: [...c.cards, { ...card, faceUp: true }] } : c
  ) as GameState['tableau'];

  return checkWin({
    ...state,
    waste: { cards: waste.slice(0, -1) },
    tableau: newTableau,
    moveCount: state.moveCount + 1,
  });
}

export function moveFoundationToTableau(
  state: GameState,
  pileIndex: number,
  colIndex: number
): GameState | null {
  const pile = state.foundations[pileIndex];
  if (pile.cards.length === 0) return null;
  const card = pile.cards[pile.cards.length - 1];
  const col = state.tableau[colIndex].cards;
  const targetTop = col.length > 0 ? col[col.length - 1] : null;
  if (!canPlaceOnTableau(card, targetTop)) return null;

  const newFoundations = state.foundations.map((f, i) =>
    i === pileIndex ? { ...f, cards: f.cards.slice(0, -1) } : f
  ) as GameState['foundations'];

  const newTableau = state.tableau.map((c, i) =>
    i === colIndex ? { cards: [...c.cards, { ...card, faceUp: true }] } : c
  ) as GameState['tableau'];

  return checkWin({
    ...state,
    foundations: newFoundations,
    tableau: newTableau,
    moveCount: state.moveCount + 1,
  });
}

export function moveTableauToFoundation(
  state: GameState,
  colIndex: number,
  pileIndex: number
): GameState | null {
  const col = state.tableau[colIndex].cards;
  if (col.length === 0) return null;
  const card = col[col.length - 1];
  if (!card.faceUp) return null;
  const pile = state.foundations[pileIndex];
  if (!canPlaceOnFoundation(card, pile)) return null;

  const newFoundations = state.foundations.map((f, i) =>
    i === pileIndex
      ? { suit: f.suit ?? card.suit, cards: [...f.cards, { ...card, faceUp: true }] }
      : f
  ) as GameState['foundations'];

  const newTableau = state.tableau.map((c, i) =>
    i === colIndex ? { cards: flipTop(c.cards.slice(0, -1)) } : c
  ) as GameState['tableau'];

  return checkWin({
    ...state,
    foundations: newFoundations,
    tableau: newTableau,
    moveCount: state.moveCount + 1,
  });
}

export function moveTableauToTableau(
  state: GameState,
  fromCol: number,
  cardIndex: number,
  toCol: number
): GameState | null {
  if (fromCol === toCol) return null;
  const from = state.tableau[fromCol].cards;
  const to = state.tableau[toCol].cards;
  if (cardIndex < 0 || cardIndex >= from.length) return null;
  const moving = from.slice(cardIndex);
  if (moving.some(c => !c.faceUp)) return null;
  if (!isValidTableauSequence(moving)) return null;
  const targetTop = to.length > 0 ? to[to.length - 1] : null;
  if (!canPlaceOnTableau(moving[0], targetTop)) return null;

  const newTableau = state.tableau.map((c, i) => {
    if (i === fromCol) return { cards: flipTop(c.cards.slice(0, cardIndex)) };
    if (i === toCol) return { cards: [...c.cards, ...moving] };
    return c;
  }) as GameState['tableau'];

  return checkWin({
    ...state,
    tableau: newTableau,
    moveCount: state.moveCount + 1,
  });
}
