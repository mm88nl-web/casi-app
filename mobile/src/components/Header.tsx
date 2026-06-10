import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants/theme';
import { HEADER_H } from '../constants/layout';

interface Props {
  moves: number;
  elapsedSeconds: number;
  onNewGame: () => void;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function Header({ moves, elapsedSeconds, onNewGame }: Props) {
  return (
    <View style={styles.bar}>
      <Text style={styles.title}>
        <Text style={styles.titleAccent}>casi</Text>
        <Text style={styles.titleDot}>.</Text>
        <Text style={styles.titleSuffix}>solitaire</Text>
      </Text>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{moves}</Text>
          <Text style={styles.statLabel}>moves</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatTime(elapsedSeconds)}</Text>
          <Text style={styles.statLabel}>time</Text>
        </View>
        <Pressable onPress={onNewGame} style={styles.newBtn}>
          <Text style={styles.newBtnText}>New</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: HEADER_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  title: {
    fontSize: 16,
  },
  titleAccent: {
    color: COLORS.accent,
    fontWeight: '700',
  },
  titleDot: {
    color: COLORS.accent,
    fontWeight: '700',
  },
  titleSuffix: {
    color: COLORS.muted,
    fontWeight: '400',
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 16,
  },
  statLabel: {
    color: COLORS.dim,
    fontSize: 9,
    lineHeight: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  newBtn: {
    marginLeft: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.accentBorder,
    backgroundColor: COLORS.accentMuted,
  },
  newBtnText: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '600',
  },
});
