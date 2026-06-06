import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants/theme';

interface Props {
  visible: boolean;
  moves: number;
  elapsedSeconds: number;
  onNewGame: () => void;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function WinOverlay({ visible, moves, elapsedSeconds, onNewGame }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.emoji}>🎉</Text>
          <Text style={styles.title}>
            <Text style={styles.casi}>casi</Text>
            <Text style={styles.dot}>.</Text>
            <Text style={styles.suffix}>solitaire</Text>
          </Text>
          <Text style={styles.subtitle}>You won!</Text>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statVal}>{moves}</Text>
              <Text style={styles.statLbl}>moves</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.stat}>
              <Text style={styles.statVal}>{formatTime(elapsedSeconds)}</Text>
              <Text style={styles.statLbl}>time</Text>
            </View>
          </View>

          <Pressable onPress={onNewGame} style={styles.btn}>
            <Text style={styles.btnText}>Play Again</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: COLORS.winBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: 280,
    borderRadius: 16,
    backgroundColor: '#16181F',
    borderWidth: 1,
    borderColor: COLORS.accentBorder,
    alignItems: 'center',
    padding: 32,
    gap: 12,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
  },
  emoji: {
    fontSize: 40,
  },
  title: {
    fontSize: 22,
  },
  casi: {
    color: COLORS.accent,
    fontWeight: '700',
  },
  dot: {
    color: COLORS.accent,
    fontWeight: '700',
  },
  suffix: {
    color: COLORS.muted,
    fontWeight: '400',
  },
  subtitle: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '600',
    marginTop: -4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 24,
    alignItems: 'center',
    marginTop: 8,
  },
  stat: {
    alignItems: 'center',
  },
  statVal: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: '700',
  },
  statLbl: {
    color: COLORS.dim,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  divider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  btn: {
    marginTop: 8,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
  },
  btnText: {
    color: '#0C0D11',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
