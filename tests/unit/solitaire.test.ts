import { expect } from 'chai';
import {
  type Card, type G, type Suit,
  makeDeck, freshGame, canFound, canTab, isValidSeq,
  tryMove, drawStock, getMoving, allFaceUp, findAutoMove, findHint,
} from '../../src/app/solitaire/_components/gameLogic';

const card = (suit: Suit, value: number, faceUp = true): Card => ({
  id: `${suit}${value}`, suit, value, faceUp,
});

/** Minimal empty state to build scenarios on. */
const empty = (): G => ({
  stock: [], waste: [], found: [[], [], [], []],
  tab: [[], [], [], [], [], [], []],
  moves: 0, won: false, draw: 1,
});

describe('solitaire deal', () => {
  it('produces a full 52-card deck with unique ids', () => {
    const deck = makeDeck();
    expect(deck).to.have.length(52);
    expect(new Set(deck.map(c => c.id)).size).to.equal(52);
  });

  it('deals 28 tableau cards, 24 stock, only column tops face-up', () => {
    const g = freshGame(1);
    expect(g.stock).to.have.length(24);
    expect(g.tab.reduce((s, c) => s + c.length, 0)).to.equal(28);
    g.tab.forEach((col, i) => {
      expect(col).to.have.length(i + 1);
      col.forEach((c, r) => expect(c.faceUp).to.equal(r === i));
    });
    expect(g.stock.every(c => !c.faceUp)).to.equal(true);
  });
});

describe('placement rules', () => {
  it('foundation: only an ace starts a pile, then same suit ascending', () => {
    expect(canFound(card('S', 1), [])).to.equal(true);
    expect(canFound(card('S', 2), [])).to.equal(false);
    expect(canFound(card('S', 2), [card('S', 1)])).to.equal(true);
    expect(canFound(card('H', 2), [card('S', 1)])).to.equal(false);
    expect(canFound(card('S', 3), [card('S', 1)])).to.equal(false);
  });

  it('tableau: only a king starts an empty column, then alternating colors descending', () => {
    expect(canTab(card('S', 13), [])).to.equal(true);
    expect(canTab(card('S', 12), [])).to.equal(false);
    expect(canTab(card('H', 6), [card('S', 7)])).to.equal(true);
    expect(canTab(card('D', 6), [card('H', 7)])).to.equal(false); // both red
    expect(canTab(card('H', 6), [card('S', 7, false)])).to.equal(false); // face-down target
  });

  it('isValidSeq accepts alternating descending runs only', () => {
    expect(isValidSeq([card('S', 7), card('H', 6), card('C', 5)])).to.equal(true);
    expect(isValidSeq([card('S', 7), card('C', 6)])).to.equal(false);
    expect(isValidSeq([card('S', 7), card('H', 5)])).to.equal(false);
  });
});

describe('tryMove', () => {
  it('moves a tableau sequence and flips the revealed card', () => {
    const g = empty();
    g.tab[0] = [card('D', 9, false), card('S', 7), card('H', 6)];
    g.tab[1] = [card('D', 8)];
    const next = tryMove(g, { area: 'tableau', col: 0, idx: 1 }, { area: 'tableau', col: 1 });
    expect(next).to.not.equal(null);
    expect(next!.tab[1].map(c => c.id)).to.deep.equal(['D8', 'S7', 'H6']);
    expect(next!.tab[0]).to.have.length(1);
    expect(next!.tab[0][0].faceUp).to.equal(true); // D9 revealed
    expect(next!.moves).to.equal(1);
  });

  it('rejects an invalid drop and a multi-card foundation move', () => {
    const g = empty();
    g.tab[0] = [card('S', 7), card('H', 6)];
    g.tab[1] = [card('D', 10)];
    expect(tryMove(g, { area: 'tableau', col: 0, idx: 1 }, { area: 'tableau', col: 1 })).to.equal(null);
    expect(tryMove(g, { area: 'tableau', col: 0, idx: 0 }, { area: 'foundation', col: 0 })).to.equal(null);
  });

  it('moves the waste top to a foundation and detects the win', () => {
    const g = empty();
    // foundations one card from complete
    g.found = SUITS_FULL();
    g.waste = [card('C', 13)];
    const next = tryMove(g, { area: 'waste', col: 0, idx: 0 }, { area: 'foundation', col: 3 });
    expect(next).to.not.equal(null);
    expect(next!.won).to.equal(true);
    expect(next!.waste).to.have.length(0);
  });

  function SUITS_FULL(): Card[][] {
    const full = (s: Suit, n: number) => Array.from({ length: n }, (_, i) => card(s, i + 1));
    return [full('S', 13), full('H', 13), full('D', 13), full('C', 12)];
  }
});

describe('drawStock', () => {
  it('draw-1 moves one card to waste, face up', () => {
    const g = { ...empty(), stock: [card('S', 1, false), card('H', 2, false)] };
    const next = drawStock(g)!;
    expect(next.stock).to.have.length(1);
    expect(next.waste.map(c => c.id)).to.deep.equal(['H2']);
    expect(next.waste[0].faceUp).to.equal(true);
  });

  it('draw-3 takes three at once and keeps order so the last drawn is playable', () => {
    const g: G = {
      ...empty(), draw: 3,
      stock: [card('S', 1, false), card('H', 2, false), card('D', 3, false), card('C', 4, false)],
    };
    const next = drawStock(g)!;
    expect(next.stock).to.have.length(1);
    expect(next.waste.map(c => c.id)).to.deep.equal(['C4', 'D3', 'H2']);
  });

  it('recycles the waste back into stock when stock is empty', () => {
    const g = { ...empty(), waste: [card('S', 1), card('H', 2)] };
    const next = drawStock(g)!;
    expect(next.waste).to.have.length(0);
    expect(next.stock.map(c => c.id)).to.deep.equal(['H2', 'S1']);
    expect(next.stock.every(c => !c.faceUp)).to.equal(true);
  });

  it('returns null when both stock and waste are empty', () => {
    expect(drawStock(empty())).to.equal(null);
  });
});

describe('selection validity', () => {
  it('rejects a tableau selection that is not a valid run', () => {
    const g = empty();
    g.tab[0] = [card('S', 7), card('C', 6)]; // same color, invalid run
    expect(getMoving(g, { area: 'tableau', col: 0, idx: 0 })).to.equal(null);
    expect(getMoving(g, { area: 'tableau', col: 0, idx: 1 })).to.not.equal(null);
  });
});

describe('auto-complete and hints', () => {
  it('findAutoMove finds tableau and waste tops that fit a foundation', () => {
    const g = empty();
    g.found[0] = [card('S', 1)];
    g.tab[0] = [card('S', 2)];
    const m = findAutoMove(g)!;
    expect(m.sel.area).to.equal('tableau');
    expect(m.dst).to.deep.equal({ area: 'foundation', col: 0 });
  });

  it('allFaceUp is true only when no tableau card is hidden', () => {
    const g = empty();
    g.tab[0] = [card('S', 5)];
    expect(allFaceUp(g)).to.equal(true);
    g.tab[1] = [card('H', 9, false), card('C', 3)];
    expect(allFaceUp(g)).to.equal(false);
  });

  it('findHint suggests the stock when nothing else moves', () => {
    const g = empty();
    g.stock = [card('D', 4, false)];
    g.tab[0] = [card('S', 9)];
    expect(findHint(g)).to.deep.equal({ kind: 'stock' });
  });

  it('findHint prefers a foundation move and skips pointless king shuffles', () => {
    const g = empty();
    g.found[0] = [card('S', 1)];
    g.tab[0] = [card('S', 2)];
    expect(findHint(g)).to.deep.equal({ kind: 'move', ids: ['S2'], dstKey: 'f-0' });

    const g2 = empty();
    g2.tab[0] = [card('S', 13)]; // lone king, empty col available — pointless
    const h2 = findHint(g2);
    expect(h2).to.equal(null);
  });
});
