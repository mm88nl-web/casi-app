import { Dimensions } from 'react-native';

const SCREEN_W = Dimensions.get('window').width;

export const H_PAD = 8;
export const COL_GAP = 4;
export const CARD_W = Math.floor((SCREEN_W - H_PAD * 2 - COL_GAP * 6) / 7);
export const CARD_H = Math.round(CARD_W * 1.4);
export const CARD_RADIUS = 5;

export const FD_OVERLAP = 16;
export const FU_OVERLAP = 26;

export const HEADER_H = 44;
export const BOTTOM_BAR_H = 56;
export const TOP_ROW_MARGIN = 8;

export const CORNER_RANK_FONT = Math.max(9, Math.round(CARD_W * 0.22));
export const CORNER_SUIT_FONT = Math.max(8, Math.round(CARD_W * 0.18));
export const CENTER_SUIT_FONT = Math.round(CARD_W * 0.5);

export function getCardTop(cards: { faceUp: boolean }[], index: number): number {
  let y = 0;
  for (let i = 0; i < index; i++) {
    y += cards[i].faceUp ? FU_OVERLAP : FD_OVERLAP;
  }
  return y;
}

export function getColumnHeight(cards: { faceUp: boolean }[]): number {
  if (cards.length === 0) return CARD_H;
  return getCardTop(cards, cards.length - 1) + CARD_H;
}
