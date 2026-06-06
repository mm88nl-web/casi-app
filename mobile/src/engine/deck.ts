import type { Card, DrawMode, GameState, Rank, Suit } from './types';

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export function createDeck(): Card[] {
  return SUITS.flatMap(suit =>
    RANKS.map(rank => ({ id: `${suit}-${rank}`, suit, rank, faceUp: false }))
  );
}

export function shuffleDeck(deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export function dealInitial(deck: Card[], drawMode: DrawMode): GameState {
  let idx = 0;
  const tableau = Array.from({ length: 7 }, (_, col) => ({
    cards: Array.from({ length: col + 1 }, (_, row) => ({
      ...deck[idx++],
      faceUp: row === col,
    })),
  }));

  return {
    stock: { cards: deck.slice(idx).map(c => ({ ...c, faceUp: false })) },
    waste: { cards: [] },
    foundations: [
      { suit: null, cards: [] },
      { suit: null, cards: [] },
      { suit: null, cards: [] },
      { suit: null, cards: [] },
    ],
    tableau: tableau as GameState['tableau'],
    drawMode,
    moveCount: 0,
    startTime: Date.now(),
    won: false,
    autoCompleting: false,
  };
}
