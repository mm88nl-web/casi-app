import type { Card, FoundationPile, GameState, Suit } from './types';

export function suitColor(suit: Suit): 'red' | 'black' {
  return suit === 'hearts' || suit === 'diamonds' ? 'red' : 'black';
}

export function rankLabel(rank: number): string {
  if (rank === 1) return 'A';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  return String(rank);
}

export function suitSymbol(suit: Suit): string {
  const map: Record<Suit, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  return map[suit];
}

export function canPlaceOnTableau(card: Card, targetTop: Card | null): boolean {
  if (targetTop === null) return card.rank === 13;
  if (!targetTop.faceUp) return false;
  return suitColor(card.suit) !== suitColor(targetTop.suit) && card.rank === targetTop.rank - 1;
}

export function canPlaceOnFoundation(card: Card, pile: FoundationPile): boolean {
  if (pile.cards.length === 0) {
    return card.rank === 1;
  }
  if (pile.suit !== card.suit) return false;
  return card.rank === pile.cards[pile.cards.length - 1].rank + 1;
}

export function isValidTableauSequence(cards: Card[]): boolean {
  for (let i = 1; i < cards.length; i++) {
    if (!cards[i - 1].faceUp || !cards[i].faceUp) return false;
    if (!canPlaceOnTableau(cards[i], cards[i - 1])) return false;
  }
  return true;
}

export function findValidFoundation(
  card: Card,
  foundations: GameState['foundations']
): number {
  for (let i = 0; i < 4; i++) {
    if (canPlaceOnFoundation(card, foundations[i])) return i;
  }
  return -1;
}

export function isAutoCompleteable(state: GameState): boolean {
  if (state.stock.cards.length > 0) return false;
  if (state.waste.cards.length > 0) return false;
  return state.tableau.every(col => col.cards.every(c => c.faceUp));
}

export function wouldWin(state: GameState): boolean {
  return state.foundations.reduce((n, f) => n + f.cards.length, 0) === 52;
}
