import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import type { Card } from '../engine/types';
import { rankLabel, suitColor, suitSymbol } from '../engine/rules';
import { COLORS } from '../constants/theme';
import {
  CARD_H,
  CARD_RADIUS,
  CARD_W,
  CENTER_SUIT_FONT,
  CORNER_RANK_FONT,
  CORNER_SUIT_FONT,
} from '../constants/layout';

interface Props {
  card: Card;
  selected?: boolean;
  style?: ViewStyle;
  onTap?: () => void;
  asView?: boolean;
}

function FaceDown({ selected, style, onTap, asView }: Omit<Props, 'card'>) {
  const Container = asView ? View : Pressable;
  return (
    <Container
      onPress={asView ? undefined : onTap}
      style={[styles.card, styles.back, selected && styles.selectedBack, style]}
    >
      <Text style={styles.casiLabel}>casi.</Text>
      <View style={styles.backDiag} />
    </Container>
  );
}

function FaceUp({ card, selected, style, onTap, asView }: Props) {
  const isRed = suitColor(card.suit) === 'red';
  const color = isRed ? COLORS.red : COLORS.dark;
  const sym = suitSymbol(card.suit);
  const label = rankLabel(card.rank);
  const Container = asView ? View : Pressable;

  return (
    <Container
      onPress={asView ? undefined : onTap}
      style={[styles.card, styles.face, selected && styles.selectedFace, style]}
    >
      {/* Top-left corner */}
      <View style={styles.cornerTL} pointerEvents="none">
        <Text style={[styles.rankText, { color }]}>{label}</Text>
        <Text style={[styles.suitSmall, { color }]}>{sym}</Text>
      </View>

      {/* Center suit */}
      <Text style={[styles.suitCenter, { color }]}>{sym}</Text>

      {/* Bottom-right corner rotated */}
      <View style={[styles.cornerTL, styles.cornerBR]} pointerEvents="none">
        <Text style={[styles.rankText, { color }]}>{label}</Text>
        <Text style={[styles.suitSmall, { color }]}>{sym}</Text>
      </View>
    </Container>
  );
}

export function CardView(props: Props) {
  return props.card.faceUp ? <FaceUp {...props} /> : <FaceDown {...props} />;
}

const styles = StyleSheet.create({
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
  },
  face: {
    backgroundColor: COLORS.cardFace,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: {
    backgroundColor: COLORS.cardBack,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedFace: {
    borderWidth: 2.5,
    borderColor: COLORS.selectedBorder,
    shadowColor: COLORS.selectedBorder,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 10,
  },
  selectedBack: {
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 8,
  },
  casiLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: Math.max(8, Math.round(CARD_W * 0.2)),
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  backDiag: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    opacity: 0.12,
    backgroundColor: 'transparent',
  },
  cornerTL: {
    position: 'absolute',
    top: 3,
    left: 4,
    alignItems: 'center',
  },
  cornerBR: {
    top: undefined,
    left: undefined,
    bottom: 3,
    right: 4,
    transform: [{ rotate: '180deg' }],
  },
  rankText: {
    fontSize: CORNER_RANK_FONT,
    fontWeight: '800',
    lineHeight: CORNER_RANK_FONT + 1,
  },
  suitSmall: {
    fontSize: CORNER_SUIT_FONT,
    lineHeight: CORNER_SUIT_FONT + 1,
  },
  suitCenter: {
    fontSize: CENTER_SUIT_FONT,
  },
});
