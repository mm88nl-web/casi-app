import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { FoundationPile } from '../engine/types';
import { Stock } from './Stock';
import { Waste } from './Waste';
import { Foundation } from './Foundation';
import { EmptySlot } from './EmptySlot';
import { CARD_W, COL_GAP, H_PAD } from '../constants/layout';

interface Props {
  stockCount: number;
  wasteCards: any[];
  drawMode: 1 | 3;
  wasteSelected: boolean;
  foundations: [FoundationPile, FoundationPile, FoundationPile, FoundationPile];
  foundationDropTargets: boolean[];
  onTapStock: () => void;
  onTapWaste: () => void;
  onTapFoundation: (i: number) => void;
}

export function TopRow({
  stockCount,
  wasteCards,
  drawMode,
  wasteSelected,
  foundations,
  foundationDropTargets,
  onTapStock,
  onTapWaste,
  onTapFoundation,
}: Props) {
  return (
    <View style={styles.row}>
      <Stock cardCount={stockCount} onTap={onTapStock} />
      <Waste cards={wasteCards} drawMode={drawMode} selected={wasteSelected} onTap={onTapWaste} />
      {/* Spacer aligned with tableau col 2 */}
      <View style={{ width: CARD_W }} />
      {foundations.map((f, i) => (
        <Foundation
          key={i}
          pile={f}
          isDropTarget={!!foundationDropTargets[i]}
          onTap={() => onTapFoundation(i)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: H_PAD,
    gap: COL_GAP,
  },
});
