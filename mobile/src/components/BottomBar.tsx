import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants/theme';
import { BOTTOM_BAR_H } from '../constants/layout';

interface Props {
  canUndo: boolean;
  canAutoComplete: boolean;
  onUndo: () => void;
  onAutoComplete: () => void;
  onNewGame: () => void;
}

interface BtnProps {
  label: string;
  sublabel?: string;
  onPress: () => void;
  disabled?: boolean;
  accent?: boolean;
}

function Btn({ label, sublabel, onPress, disabled, accent }: BtnProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.btn, disabled && styles.btnDisabled, accent && styles.btnAccent]}
    >
      <Text style={[styles.btnLabel, disabled && styles.labelDisabled, accent && styles.labelAccent]}>
        {label}
      </Text>
      {sublabel ? (
        <Text style={[styles.btnSub, disabled && styles.subDisabled]}>{sublabel}</Text>
      ) : null}
    </Pressable>
  );
}

export function BottomBar({ canUndo, canAutoComplete, onUndo, onAutoComplete, onNewGame }: Props) {
  return (
    <View style={styles.bar}>
      <Btn label="↩" sublabel="Undo" onPress={onUndo} disabled={!canUndo} />
      <Btn label="✦" sublabel="Auto" onPress={onAutoComplete} disabled={!canAutoComplete} accent={canAutoComplete} />
      <Btn label="⊕" sublabel="New" onPress={onNewGame} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: BOTTOM_BAR_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: COLORS.bg,
    paddingHorizontal: 16,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    marginHorizontal: 4,
    backgroundColor: COLORS.btnBg,
    borderWidth: 1,
    borderColor: COLORS.btnBorder,
  },
  btnDisabled: {
    opacity: 0.35,
  },
  btnAccent: {
    borderColor: COLORS.accentBorder,
    backgroundColor: COLORS.accentMuted,
  },
  btnLabel: {
    color: COLORS.muted,
    fontSize: 18,
    lineHeight: 22,
  },
  labelDisabled: {
    color: COLORS.dim,
  },
  labelAccent: {
    color: COLORS.accent,
  },
  btnSub: {
    color: COLORS.dim,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    lineHeight: 13,
  },
  subDisabled: {
    color: COLORS.dim,
    opacity: 0.5,
  },
});
