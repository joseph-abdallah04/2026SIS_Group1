import { useReducer, useRef } from 'react';

import {
  createDiagramHistory,
  diagramHistoryReducer,
  isDiagramDirty,
  type DiagramSnapshot,
} from './diagramHistory';

export function useDiagramHistory(initial: DiagramSnapshot) {
  const [history, dispatch] = useReducer(diagramHistoryReducer, initial, createDiagramHistory);
  const snapshotRef = useRef(history.present);
  snapshotRef.current = history.present;

  function commit(snapshot: DiagramSnapshot) {
    snapshotRef.current = snapshot;
    dispatch({ type: 'commit', snapshot });
  }

  function preview(snapshot: DiagramSnapshot) {
    snapshotRef.current = snapshot;
    dispatch({ type: 'preview', snapshot });
  }

  function recordPreview(previous: DiagramSnapshot) {
    dispatch({ type: 'record-preview', previous });
  }

  function restorePreview(snapshot: DiagramSnapshot) {
    snapshotRef.current = snapshot;
    dispatch({ type: 'restore-preview', snapshot });
  }

  function undo() {
    const previous = history.past.at(-1);
    if (previous) snapshotRef.current = previous;
    dispatch({ type: 'undo' });
  }

  function redo() {
    const next = history.future[0];
    if (next) snapshotRef.current = next;
    dispatch({ type: 'redo' });
  }

  return {
    snapshot: history.present,
    snapshotRef,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    isDirty: isDiagramDirty(history),
    commit,
    preview,
    recordPreview,
    restorePreview,
    undo,
    redo,
  };
}
