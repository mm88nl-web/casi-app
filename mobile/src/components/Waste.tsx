import React from 'react';
import { View } from 'react-native';
import type { Card } from '../engine/types';
import { CardView } from './CardView';
import { EmptySlot } from './EmptySlot';
import { CARD_W } from '../constants/layout';

interface Props {
  cards: Card[];
  drawMode: 1 | 3;
  selected: boolean;
  onTap: () => void;
}

export function Waste({ cards, drawMode, selected, onTap }: Props) {
  if (cards.length === 0) return <EmptySlot />;

  if (drawMode === 1 || cards.length === 1) {
    return (
      <CardView
        card={cards[cards.length - 1]}
        selected={selected}
        onTap={onTap}
      />
    );
  }

  // Draw-3: fan top 3 cards slightly to the right
  const topN = Math.min(3, cards.length);
  const topCards = cards.slice(-topN);
  const FAN_OFFSET = 12;

  return (
    <View style={{ width: CARD_W + FAN_OFFSET * (topN - 1), position: 'relative' }}>
      {topCards.map((card, i) => {
        const isTop = i === topCards.length - 1;
        return (
          <View
            key={card.id}
            style={{
              position: 'absolute',
              left: i * FAN_OFFSET,
              zIndex: i,
            }}
          >
            <CardView
              card={card}
              selected={isTop && selected}
              onTap={isTop ? onTap : undefined}
            />
          </View>
        );
      })}
    </View>
  );
}
