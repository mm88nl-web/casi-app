import React from 'react';
import { View } from 'react-native';
import type { TableauColumn } from '../engine/types';
import { CardView } from './CardView';
import { EmptySlot } from './EmptySlot';
import { CARD_H, CARD_W, getCardTop, getColumnHeight } from '../constants/layout';

interface Props {
  column: TableauColumn;
  colIndex: number;
  selectedFromIndex: number | null;
  isDropTarget: boolean;
  onTapCard: (colIndex: number, cardIndex: number) => void;
  onTapEmpty: (colIndex: number) => void;
}

export function Column({
  column,
  colIndex,
  selectedFromIndex,
  isDropTarget,
  onTapCard,
  onTapEmpty,
}: Props) {
  const { cards } = column;
  const height = getColumnHeight(cards);

  if (cards.length === 0) {
    return (
      <EmptySlot
        label="K"
        isDropTarget={isDropTarget}
        onTap={() => onTapEmpty(colIndex)}
      />
    );
  }

  return (
    <View style={{ width: CARD_W, height }}>
      {cards.map((card, idx) => {
        const top = getCardTop(cards, idx);
        const isSelected = selectedFromIndex !== null && idx >= selectedFromIndex;
        return (
          <View
            key={card.id}
            style={{
              position: 'absolute',
              top,
              left: 0,
              zIndex: idx,
            }}
          >
            <CardView
              card={card}
              selected={isSelected}
              onTap={() => onTapCard(colIndex, idx)}
            />
          </View>
        );
      })}
    </View>
  );
}
