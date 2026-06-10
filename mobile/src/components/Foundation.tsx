import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { FoundationPile } from '../engine/types';
import { CardView } from './CardView';
import { EmptySlot } from './EmptySlot';
import { rankLabel, suitColor, suitSymbol } from '../engine/rules';
import { COLORS } from '../constants/theme';
import { CARD_H, CARD_RADIUS, CARD_W } from '../constants/layout';

interface Props {
  pile: FoundationPile;
  isDropTarget: boolean;
  onTap: () => void;
}

export function Foundation({ pile, isDropTarget, onTap }: Props) {
  const top = pile.cards.length > 0 ? pile.cards[pile.cards.length - 1] : null;

  if (!top) {
    const sym = pile.suit ? suitSymbol(pile.suit) : 'A';
    return <EmptySlot label={sym} isDropTarget={isDropTarget} onTap={onTap} />;
  }

  return (
    <Pressable
      onPress={onTap}
      style={[styles.wrapper, isDropTarget && styles.dropTarget]}
    >
      <CardView card={top} asView />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
  },
  dropTarget: {
    borderWidth: 2,
    borderColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 6,
    elevation: 8,
  },
});
