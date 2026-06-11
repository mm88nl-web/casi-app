// Pure Klondike solitaire logic — no React, no DOM. Unit-tested in
// tests/unit/solitaire.test.ts; keep side-effect free.

export type Suit = 'S' | 'H' | 'D' | 'C';
export type Area = 'waste' | 'tableau' | 'foundation';

export interface Card {
  id: string;
  suit: Suit;
  value: number; // 1 (ace) … 13 (king)
  faceUp: boolean;
}

export interface Sel { area: Area; col: number; idx: number; }
export interface Dst { area: 'tableau' | 'foundation'; col: number; }

export interface G {
  stock: Card[];
  waste: Card[];
  found: Card[][]; // 4 piles, suit order = SUITS
  tab: Card[][];   // 7 columns
  moves: number;
  won: boolean;
  draw: 1 | 3;
}

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const SYM: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const LBL: Partial<Record<number, string>> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
export const lbl = (v: number) => LBL[v] ?? String(v);
export const isRed = (s: Suit) => s === 'H' || s === 'D';

export function makeDeck(): Card[] {
  return SUITS.flatMap(suit =>
    Array.from({ length: 13 }, (_, i) => ({
      id: `${suit}${i + 1}`, suit, value: i + 1, faceUp: false,
    }))
  );
}

export function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = 0 | Math.random() * (i + 1);
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export function freshGame(draw: 1 | 3 = 1): G {
  const deck = shuffle(makeDeck());
  let k = 0;
  const tab: Card[][] = Array.from({ length: 7 }, (_, c) =>
    Array.from({ length: c + 1 }, (_, r) => ({ ...deck[k++], faceUp: r === c }))
  );
  return {
    stock: deck.slice(k).map(c => ({ ...c, faceUp: false })),
    waste: [], found: [[], [], [], []], tab,
    moves: 0, won: false, draw,
  };
}

export function canFound(card: Card, pile: Card[]): boolean {
  if (!pile.length) return card.value === 1;
  const t = pile[pile.length - 1];
  return t.suit === card.suit && card.value === t.value + 1;
}

export function canTab(card: Card, col: Card[]): boolean {
  if (!col.length) return card.value === 13;
  const t = col[col.length - 1];
  return t.faceUp && isRed(t.suit) !== isRed(card.suit) && card.value === t.value - 1;
}

export function isValidSeq(cards: Card[]): boolean {
  for (let i = 0; i < cards.length - 1; i++) {
    if (isRed(cards[i].suit) === isRed(cards[i + 1].suit)) return false;
    if (cards[i].value !== cards[i + 1].value + 1) return false;
  }
  return true;
}

/** The cards a selection would move, or null if the selection is invalid. */
export function getMoving(g: G, sel: Sel): Card[] | null {
  if (sel.area === 'waste') {
    return g.waste.length ? [g.waste[g.waste.length - 1]] : null;
  }
  if (sel.area === 'foundation') {
    const p = g.found[sel.col];
    return p.length ? [p[p.length - 1]] : null;
  }
  const seq = g.tab[sel.col].slice(sel.idx);
  return seq.length && seq.every(c => c.faceUp) && isValidSeq(seq) ? seq : null;
}

/** Apply a move. Returns the new state, or null if the move is invalid. */
export function tryMove(g: G, sel: Sel, dst: Dst): G | null {
  const moving = getMoving(g, sel);
  if (!moving) return null;

  if (dst.area === 'foundation') {
    if (moving.length !== 1) return null;
    if (!canFound(moving[0], g.found[dst.col])) return null;
  } else {
    if (sel.area === 'tableau' && sel.col === dst.col) return null;
    if (!canTab(moving[0], g.tab[dst.col])) return null;
  }

  const waste = sel.area === 'waste' ? g.waste.slice(0, -1) : [...g.waste];
  const tab = g.tab.map(c => [...c]);
  const found = g.found.map(p => [...p]);

  if (sel.area === 'tableau') {
    tab[sel.col] = g.tab[sel.col].slice(0, sel.idx);
    const last = tab[sel.col].length - 1;
    if (last >= 0 && !tab[sel.col][last].faceUp) {
      tab[sel.col][last] = { ...tab[sel.col][last], faceUp: true };
    }
  } else if (sel.area === 'foundation') {
    found[sel.col] = g.found[sel.col].slice(0, -1);
  }

  if (dst.area === 'foundation') {
    found[dst.col] = [...found[dst.col], { ...moving[0], faceUp: true }];
  } else {
    tab[dst.col] = [...tab[dst.col], ...moving];
  }

  const next: G = { ...g, waste, tab, found, moves: g.moves + 1 };
  return { ...next, won: next.found.every(p => p.length === 13) };
}

/** Draw from stock (or recycle waste). Returns null when both are empty. */
export function drawStock(g: G): G | null {
  if (g.stock.length) {
    const n = Math.min(g.draw, g.stock.length);
    const drawn = g.stock.slice(-n).reverse().map(c => ({ ...c, faceUp: true }));
    return {
      ...g,
      stock: g.stock.slice(0, -n),
      waste: [...g.waste, ...drawn],
      moves: g.moves + 1,
    };
  }
  if (g.waste.length) {
    return {
      ...g,
      stock: [...g.waste].reverse().map(c => ({ ...c, faceUp: false })),
      waste: [],
      moves: g.moves + 1,
    };
  }
  return null;
}

export function allFaceUp(g: G): boolean {
  return g.tab.every(col => col.every(c => c.faceUp));
}

/** Next move for auto-complete: any top card that can go to a foundation. */
export function findAutoMove(g: G): { sel: Sel; dst: Dst } | null {
  const w = g.waste[g.waste.length - 1];
  if (w) {
    const fi = g.found.findIndex(p => canFound(w, p));
    if (fi >= 0) {
      return {
        sel: { area: 'waste', col: 0, idx: g.waste.length - 1 },
        dst: { area: 'foundation', col: fi },
      };
    }
  }
  for (let c = 0; c < 7; c++) {
    const col = g.tab[c];
    const t = col[col.length - 1];
    if (!t) continue;
    const fi = g.found.findIndex(p => canFound(t, p));
    if (fi >= 0) {
      return {
        sel: { area: 'tableau', col: c, idx: col.length - 1 },
        dst: { area: 'foundation', col: fi },
      };
    }
  }
  return null;
}

export type Hint =
  | { kind: 'move'; ids: string[]; dstKey: string }
  | { kind: 'stock' }
  | null;

/** One suggested move, in rough priority order. */
export function findHint(g: G): Hint {
  // 1. waste / tableau top → foundation
  const auto = findAutoMove(g);
  if (auto) {
    const card = getMoving(g, auto.sel)![0];
    return { kind: 'move', ids: [card.id], dstKey: `f-${auto.dst.col}` };
  }

  // 2. tableau sequence → tableau column
  for (let c1 = 0; c1 < 7; c1++) {
    const col = g.tab[c1];
    for (let idx = 0; idx < col.length; idx++) {
      if (!col[idx].faceUp) continue;
      const seq = col.slice(idx);
      if (!isValidSeq(seq)) continue;
      for (let c2 = 0; c2 < 7; c2++) {
        if (c2 === c1) continue;
        if (!canTab(seq[0], g.tab[c2])) continue;
        // Skip pointless shuffles: a full face-up king stack onto an empty col
        if (idx === 0 && g.tab[c2].length === 0) continue;
        return { kind: 'move', ids: seq.map(x => x.id), dstKey: `t-${c2}` };
      }
    }
  }

  // 3. waste top → tableau
  const w = g.waste[g.waste.length - 1];
  if (w) {
    for (let c = 0; c < 7; c++) {
      if (canTab(w, g.tab[c])) return { kind: 'move', ids: [w.id], dstKey: `t-${c}` };
    }
  }

  // 4. draw
  if (g.stock.length || g.waste.length) return { kind: 'stock' };
  return null;
}
