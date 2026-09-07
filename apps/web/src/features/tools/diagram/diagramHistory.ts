import type { DiagramEdge, DiagramNode } from '@roundtable/shared';

export interface DiagramSnapshot {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export interface DiagramHistory {
  initial: DiagramSnapshot;
  past: DiagramSnapshot[];
  present: DiagramSnapshot;
  future: DiagramSnapshot[];
}

export type DiagramHistoryAction =
  | { type: 'commit'; snapshot: DiagramSnapshot }
  | { type: 'preview'; snapshot: DiagramSnapshot }
  | { type: 'record-preview'; previous: DiagramSnapshot }
  | { type: 'restore-preview'; snapshot: DiagramSnapshot }
  | { type: 'undo' }
  | { type: 'redo' };

function cloneSnapshot(snapshot: DiagramSnapshot): DiagramSnapshot {
  return {
    nodes: snapshot.nodes.map((node) => ({ ...node })),
    edges: snapshot.edges.map((edge) => ({ ...edge })),
  };
}

export function diagramSnapshotKey(snapshot: DiagramSnapshot): string {
  return JSON.stringify(snapshot);
}

export function createDiagramHistory(initial: DiagramSnapshot): DiagramHistory {
  const snapshot = cloneSnapshot(initial);
  return { initial: snapshot, past: [], present: snapshot, future: [] };
}

export function diagramHistoryReducer(
  state: DiagramHistory,
  action: DiagramHistoryAction,
): DiagramHistory {
  switch (action.type) {
    case 'commit':
      if (diagramSnapshotKey(state.present) === diagramSnapshotKey(action.snapshot)) return state;
      return {
        ...state,
        past: [...state.past, state.present],
        present: action.snapshot,
        future: [],
      };
    case 'preview':
      return { ...state, present: action.snapshot };
    case 'record-preview':
      if (diagramSnapshotKey(action.previous) === diagramSnapshotKey(state.present)) return state;
      return {
        ...state,
        past: [...state.past, action.previous],
        future: [],
      };
    case 'restore-preview':
      return { ...state, present: action.snapshot };
    case 'undo': {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        ...state,
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }
    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
      };
    }
  }
}

export function isDiagramDirty(history: DiagramHistory): boolean {
  return diagramSnapshotKey(history.initial) !== diagramSnapshotKey(history.present);
}
