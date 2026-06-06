import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { COLORS } from '../constants/theme';
import { CARD_H, CARD_RADIUS, CARD_W } from '../constants/layout';

interface Props {
  label?: string;
  isDropTarget?: boolean;
  onTap?: () => void;
}

export function EmptySlot({ label, isDropTarget, onTap }: Props) {
  return (
    <Pressable
      onPress={onTap}
      style={[styles.slot, isDropTarget && styles.dropTarget]}
    >
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slot: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: CARD_RADIUS,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: COLORS.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropTarget: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentMuted,
    borderStyle: 'solid',
  },
  label: {
    color: COLORS.accentBorder,
    fontSize: Math.round(CARD_W * 0.28),
    fontWeight: '700',
  },
});
