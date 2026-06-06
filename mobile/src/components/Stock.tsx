import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { COLORS } from '../constants/theme';
import { CARD_H, CARD_RADIUS, CARD_W } from '../constants/layout';

interface Props {
  cardCount: number;
  onTap: () => void;
}

export function Stock({ cardCount, onTap }: Props) {
  const isEmpty = cardCount === 0;
  return (
    <Pressable
      onPress={onTap}
      style={[styles.card, isEmpty ? styles.empty : styles.back]}
    >
      {isEmpty ? (
        <Text style={styles.recycleText}>↺</Text>
      ) : (
        <Text style={styles.casiLabel}>casi.</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: CARD_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  back: {
    backgroundColor: COLORS.cardBack,
  },
  empty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: COLORS.accentBorder,
    backgroundColor: 'transparent',
  },
  casiLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: Math.max(8, Math.round(CARD_W * 0.2)),
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  recycleText: {
    color: COLORS.accentBorder,
    fontSize: Math.round(CARD_W * 0.5),
  },
});
