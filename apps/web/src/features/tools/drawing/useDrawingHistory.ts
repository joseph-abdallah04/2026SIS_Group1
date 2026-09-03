import { useReducer, useRef } from 'react';

import { createDrawingHistory, drawingHistoryReducer } from './drawingHistory';
import type { DrawingStroke } from './drawingModel';

export function useDrawingHistory(initialStrokes: DrawingStroke[] = []) {
  const [history, dispatch] = useReducer(
    drawingHistoryReducer,
    initialStrokes,
    createDrawingHistory,
  );
  const strokesRef = useRef(history.present);
  strokesRef.current = history.present;

  function commit(strokes: DrawingStroke[]) {
    strokesRef.current = strokes;
    dispatch({ type: 'commit', strokes });
  }

  function preview(strokes: DrawingStroke[]) {
    strokesRef.current = strokes;
    dispatch({ type: 'preview', strokes });
  }

  function recordPreview(previous: DrawingStroke[]) {
    dispatch({ type: 'record-preview', previous });
  }

  function undo() {
    const previous = history.past.at(-1);
    if (previous) strokesRef.current = previous;
    dispatch({ type: 'undo' });
  }

  function redo() {
    const next = history.future[0];
    if (next) strokesRef.current = next;
    dispatch({ type: 'redo' });
  }

  return {
    strokes: history.present,
    strokesRef,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    commit,
    preview,
    recordPreview,
    undo,
    redo,
  };
}
