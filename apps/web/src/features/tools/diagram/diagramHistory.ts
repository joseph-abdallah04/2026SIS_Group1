import type { DiagramEdge, DiagramNode, PathElement } from '@roundtable/shared';

import type { StudioInkStroke } from '../studio/studioInk';

export interface DiagramSnapshot {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  /**
   * v4, optional for the same reason it is optional on the artifact: absent
   * means no ink and the derived paint order, so a diagram with neither is the
   * same object it has always been.
   */
  ink?: StudioInkStroke[];
  paths?: PathElement[];
  z?: string[];
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
    ...(snapshot.ink
      ? { ink: snapshot.ink.map((stroke) => ({ ...stroke, points: [...stroke.points] })) }
      : {}),
    ...(snapshot.paths
      ? {
          paths: snapshot.paths.map((path) => ({
            ...path,
            anchors: path.anchors.map((anchor) => ({ ...anchor })),
          })),
        }
      : {}),
    ...(snapshot.z ? { z: [...snapshot.z] } : {}),
  };
}

/**
 * Identity of a snapshot, used to tell "changed" from "unchanged".
 *
 * The v4 fields are spelled out with empty-array defaults rather than letting
 * `JSON.stringify` see the object as-is, so a snapshot carrying `ink: []` and
 * one carrying no `ink` key compare equal. Otherwise merely entering draw mode
 * and leaving again would register as an edit and mark the diagram dirty.
 */
export function diagramSnapshotKey(snapshot: DiagramSnapshot): string {
  return JSON.stringify({
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    ink: snapshot.ink ?? [],
    paths: snapshot.paths ?? [],
    z: snapshot.z ?? [],
  });
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
