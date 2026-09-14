import { useReducer, useRef } from 'react';

import {
  createDiagramHistory,
  diagramHistoryReducer,
  isDiagramDirty,
  type DiagramSnapshot,
} from './diagramHistory';

/**
 * A change to the graph, expressed as the parts that changed.
 *
 * `nodes` and `edges` stay required because every caller already supplies both,
 * but the v4 fields are merged from the current snapshot when a caller does not
 * mention them. Every existing edit — drag, align, style, paste — describes
 * itself purely in nodes and edges, and none of them should have to know that
 * ink exists in order to avoid deleting it.
 */
type DiagramSnapshotPatch = Pick<DiagramSnapshot, 'nodes' | 'edges'> & Partial<DiagramSnapshot>;

export function useDiagramHistory(initial: DiagramSnapshot) {
  const [history, dispatch] = useReducer(diagramHistoryReducer, initial, createDiagramHistory);
  const snapshotRef = useRef(history.present);
  snapshotRef.current = history.present;

  function merge(patch: DiagramSnapshotPatch): DiagramSnapshot {
    return { ...snapshotRef.current, ...patch };
  }

  function commit(patch: DiagramSnapshotPatch) {
    const snapshot = merge(patch);
    snapshotRef.current = snapshot;
    dispatch({ type: 'commit', snapshot });
  }

  function preview(patch: DiagramSnapshotPatch) {
    const snapshot = merge(patch);
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
