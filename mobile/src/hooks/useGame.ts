import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import type { GameState, Selection } from '../engine/types';
import { createDeck, dealInitial, shuffleDeck } from '../engine/deck';
import {
  drawFromStock,
  moveFoundationToTableau,
  moveTableauToFoundation,
  moveTableauToTableau,
  moveWasteToFoundation,
  moveWasteToTableau,
} from '../engine/moves';
import {
  applyAutoCompleteMove,
  findAutoCompleteMove,
  isAutoCompleteable,
} from '../engine/autoComplete';
import { canPlaceOnFoundation, canPlaceOnTableau } from '../engine/rules';

const MAX_UNDO = 64;

function freshGame(drawMode: 1 | 3 = 1): GameState {
  return dealInitial(shuffleDeck(createDeck()), drawMode);
}

export function useGame() {
  const [game, setGame] = useState<GameState>(() => freshGame(1));
  const [selection, setSelection] = useState<Selection | null>(null);
  const [undoStack, setUndoStack] = useState<GameState[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const acRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick timer
  useEffect(() => {
    if (game.won) return;
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [game.won]);

  const stopAC = useCallback(() => {
    if (acRef.current) {
      clearInterval(acRef.current);
      acRef.current = null;
    }
  }, []);

  useEffect(() => () => stopAC(), [stopAC]);

  const saveUndo = useCallback((prev: GameState) => {
    setUndoStack(s => {
      const next = [...s, prev];
      return next.length > MAX_UNDO ? next.slice(-MAX_UNDO) : next;
    });
  }, []);

  const commit = useCallback(
    (result: GameState | null, prev: GameState): boolean => {
      if (!result) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setSelection(null);
        return false;
      }
      saveUndo(prev);
      setGame(result);
      setSelection(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return true;
    },
    [saveUndo]
  );

  const tapStock = useCallback(() => {
    if (game.autoCompleting || game.won) return;
    setSelection(null);
    const next = drawFromStock(game);
    if (next === game) return;
    saveUndo(game);
    setGame(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [game, saveUndo]);

  const tapWaste = useCallback(() => {
    if (game.autoCompleting || game.won) return;
    if (selection) { setSelection(null); return; }
    const waste = game.waste.cards;
    if (waste.length === 0) return;
    setSelection({ source: { zone: 'waste' }, cards: [waste[waste.length - 1]] });
    Haptics.selectionAsync();
  }, [game, selection]);

  const tapFoundation = useCallback(
    (pileIndex: number) => {
      if (game.autoCompleting || game.won) return;
      const pile = game.foundations[pileIndex];

      if (!selection) {
        if (pile.cards.length === 0) return;
        const top = pile.cards[pile.cards.length - 1];
        setSelection({ source: { zone: 'foundation', pileIndex }, cards: [top] });
        Haptics.selectionAsync();
        return;
      }

      const src = selection.source;
      if (src.zone === 'foundation' && (src as any).pileIndex === pileIndex) {
        setSelection(null);
        return;
      }

      if (selection.cards.length !== 1 || !canPlaceOnFoundation(selection.cards[0], pile)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setSelection(null);
        return;
      }

      let result: GameState | null = null;
      if (src.zone === 'waste') result = moveWasteToFoundation(game, pileIndex);
      else if (src.zone === 'foundation') result = null;
      else if (src.zone === 'tableau') result = moveTableauToFoundation(game, (src as any).colIndex, pileIndex);
      commit(result, game);
    },
    [game, selection, commit]
  );

  const tapTableauCard = useCallback(
    (colIndex: number, cardIndex: number) => {
      if (game.autoCompleting || game.won) return;
      const col = game.tableau[colIndex].cards;
      const card = col[cardIndex];

      if (!card.faceUp) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      if (!selection) {
        setSelection({
          source: { zone: 'tableau', colIndex, cardIndex },
          cards: col.slice(cardIndex),
        });
        Haptics.selectionAsync();
        return;
      }

      const src = selection.source;
      if (src.zone === 'tableau' && (src as any).colIndex === colIndex) {
        setSelection(null);
        return;
      }

      const targetTop = col.length > 0 ? col[col.length - 1] : null;
      if (!canPlaceOnTableau(selection.cards[0], targetTop)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setSelection(null);
        return;
      }

      let result: GameState | null = null;
      if (src.zone === 'waste') result = moveWasteToTableau(game, colIndex);
      else if (src.zone === 'foundation') result = moveFoundationToTableau(game, (src as any).pileIndex, colIndex);
      else if (src.zone === 'tableau') result = moveTableauToTableau(game, (src as any).colIndex, (src as any).cardIndex, colIndex);
      commit(result, game);
    },
    [game, selection, commit]
  );

  const tapTableauEmpty = useCallback(
    (colIndex: number) => {
      if (game.autoCompleting || game.won || !selection) return;
      if (!canPlaceOnTableau(selection.cards[0], null)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setSelection(null);
        return;
      }
      const src = selection.source;
      let result: GameState | null = null;
      if (src.zone === 'waste') result = moveWasteToTableau(game, colIndex);
      else if (src.zone === 'foundation') result = moveFoundationToTableau(game, (src as any).pileIndex, colIndex);
      else if (src.zone === 'tableau') result = moveTableauToTableau(game, (src as any).colIndex, (src as any).cardIndex, colIndex);
      commit(result, game);
    },
    [game, selection, commit]
  );

  const undo = useCallback(() => {
    if (undoStack.length === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    stopAC();
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(s => s.slice(0, -1));
    setGame(prev);
    setSelection(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [undoStack, stopAC]);

  const newGame = useCallback(() => {
    stopAC();
    setUndoStack([]);
    setSelection(null);
    setElapsed(0);
    setGame(freshGame(game.drawMode));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [game.drawMode, stopAC]);

  const startAutoComplete = useCallback(() => {
    if (!isAutoCompleteable(game) || game.won) return;
    stopAC();
    setSelection(null);
    setGame(g => ({ ...g, autoCompleting: true }));

    acRef.current = setInterval(() => {
      setGame(current => {
        if (!current.autoCompleting) return current;
        const move = findAutoCompleteMove(current);
        if (!move) return { ...current, autoCompleting: false };
        const next = applyAutoCompleteMove(current, move);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (next.won) return { ...next, autoCompleting: false };
        return next;
      });
    }, 130);
  }, [game, stopAC]);

  // Stop auto-complete when won
  useEffect(() => {
    if (game.won) stopAC();
  }, [game.won, stopAC]);

  const dropTargets = (() => {
    if (!selection) return { foundations: [false, false, false, false] as boolean[], tableau: Array(7).fill(false) as boolean[] };
    const card = selection.cards[0];
    const foundations = game.foundations.map(f =>
      selection.cards.length === 1 && canPlaceOnFoundation(card, f)
    );
    const tableau = game.tableau.map((col, i) => {
      if (selection.source.zone === 'tableau' && (selection.source as any).colIndex === i) return false;
      const top = col.cards.length > 0 ? col.cards[col.cards.length - 1] : null;
      return canPlaceOnTableau(card, top);
    });
    return { foundations, tableau };
  })();

  return {
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
    canAutoComplete: isAutoCompleteable(game) && !game.won && !game.autoCompleting,
  };
}
