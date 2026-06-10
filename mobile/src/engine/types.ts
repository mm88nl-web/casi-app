export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
export type DrawMode = 1 | 3;

export interface Card {
  readonly id: string;
  readonly suit: Suit;
  readonly rank: Rank;
  faceUp: boolean;
}

export interface FoundationPile {
  suit: Suit | null;
  cards: Card[];
}

export interface TableauColumn {
  cards: Card[];
}

export interface GameState {
  stock: { cards: Card[] };
  waste: { cards: Card[] };
  foundations: [FoundationPile, FoundationPile, FoundationPile, FoundationPile];
  tableau: [
    TableauColumn, TableauColumn, TableauColumn, TableauColumn,
    TableauColumn, TableauColumn, TableauColumn,
  ];
  drawMode: DrawMode;
  moveCount: number;
  startTime: number;
  won: boolean;
  autoCompleting: boolean;
}

export type SelectionSource =
  | { zone: 'waste' }
  | { zone: 'foundation'; pileIndex: number }
  | { zone: 'tableau'; colIndex: number; cardIndex: number };

export interface Selection {
  source: SelectionSource;
  cards: readonly Card[];
}
