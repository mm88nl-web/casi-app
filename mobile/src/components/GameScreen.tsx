import React from 'react';
import { ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGame } from '../hooks/useGame';
import { Header } from './Header';
import { TopRow } from './TopRow';
import { Column } from './Column';
import { BottomBar } from './BottomBar';
import { WinOverlay } from './WinOverlay';
import { COLORS } from '../constants/theme';
import {
  CARD_W,
  COL_GAP,
  H_PAD,
  TOP_ROW_MARGIN,
  getColumnHeight,
} from '../constants/layout';

export function GameScreen() {
  const {
    game,
    selection,
    undoStack,
    elapsed,
    dropTargets,
    tapStock,
    tapWaste,
    tapFoundation,
    tapTableauCard,
    tapTableauEmpty,
    undo,
    newGame,
    startAutoComplete,
    canAutoComplete,
  } = useGame();

  const wasteSelected = selection?.source.zone === 'waste';

  const getColSelectedIdx = (colIndex: number): number | null => {
    if (!selection || selection.source.zone !== 'tableau') return null;
    const src = selection.source as { zone: 'tableau'; colIndex: number; cardIndex: number };
    return src.colIndex === colIndex ? src.cardIndex : null;
  };

  const tableauHeight = Math.max(
    ...game.tableau.map(col => getColumnHeight(col.cards))
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      <Header
        moves={game.moveCount}
        elapsedSeconds={elapsed}
        onNewGame={newGame}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.topRowWrap}>
          <TopRow
            stockCount={game.stock.cards.length}
            wasteCards={game.waste.cards}
            drawMode={game.drawMode}
            wasteSelected={!!wasteSelected}
            foundations={game.foundations}
            foundationDropTargets={dropTargets.foundations}
            onTapStock={tapStock}
            onTapWaste={tapWaste}
            onTapFoundation={tapFoundation}
          />
        </View>

        <View style={[styles.tableau, { height: tableauHeight }]}>
          {game.tableau.map((col, i) => (
            <Column
              key={i}
              column={col}
              colIndex={i}
              selectedFromIndex={getColSelectedIdx(i)}
              isDropTarget={!!dropTargets.tableau[i]}
              onTapCard={tapTableauCard}
              onTapEmpty={tapTableauEmpty}
            />
          ))}
        </View>
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.bottomSafe}>
        <BottomBar
          canUndo={undoStack.length > 0}
          canAutoComplete={canAutoComplete}
          onUndo={undo}
          onAutoComplete={startAutoComplete}
          onNewGame={newGame}
        />
      </SafeAreaView>

      <WinOverlay
        visible={game.won}
        moves={game.moveCount}
        elapsedSeconds={elapsed}
        onNewGame={newGame}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 12,
  },
  topRowWrap: {
    marginTop: TOP_ROW_MARGIN,
    marginBottom: TOP_ROW_MARGIN,
  },
  tableau: {
    flexDirection: 'row',
    paddingHorizontal: H_PAD,
    gap: COL_GAP,
  },
  bottomSafe: {
    backgroundColor: COLORS.bg,
  },
});
