import type { DiagramEdge, DiagramNode } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import {
  createDiagramHistory,
  diagramHistoryReducer,
  isDiagramDirty,
  type DiagramSnapshot,
} from './diagramHistory';

const firstNode: DiagramNode = {
  id: 'n1',
  label: 'Client',
  x: 24,
  y: 24,
  shape: 'box',
};
const secondNode: DiagramNode = {
  id: 'n2',
  label: 'Server',
  x: 240,
  y: 24,
  shape: 'container',
};
const edge: DiagramEdge = { from: 'n1', to: 'n2', label: 'calls' };

function snapshot(nodes: DiagramNode[], edges: DiagramEdge[] = []): DiagramSnapshot {
  return { nodes, edges };
}

describe('diagramHistoryReducer', () => {
  it('undoes and redoes node and edge changes as one graph snapshot', () => {
    const initial = createDiagramHistory(snapshot([firstNode]));
    const connected = diagramHistoryReducer(initial, {
      type: 'commit',
      snapshot: snapshot([firstNode, secondNode], [edge]),
    });
    const undone = diagramHistoryReducer(connected, { type: 'undo' });
    const redone = diagramHistoryReducer(undone, { type: 'redo' });

    expect(undone.present).toEqual(snapshot([firstNode]));
    expect(redone.present).toEqual(snapshot([firstNode, secondNode], [edge]));
  });

  it('records a drag or typing preview as one undo step', () => {
    const initial = createDiagramHistory(snapshot([firstNode]));
    const movedNode = { ...firstNode, x: 320, y: 160 };
    const previewed = diagramHistoryReducer(initial, {
      type: 'preview',
      snapshot: snapshot([movedNode]),
    });
    const recorded = diagramHistoryReducer(previewed, {
      type: 'record-preview',
      previous: initial.present,
    });

    expect(recorded.past).toHaveLength(1);
    expect(diagramHistoryReducer(recorded, { type: 'undo' }).present).toEqual(initial.present);
  });

  it('restores a cancelled preview without creating history', () => {
    const initial = createDiagramHistory(snapshot([firstNode]));
    const previewed = diagramHistoryReducer(initial, {
      type: 'preview',
      snapshot: snapshot([{ ...firstNode, label: 'Draft' }]),
    });
    const restored = diagramHistoryReducer(previewed, {
      type: 'restore-preview',
      snapshot: initial.present,
    });

    expect(restored.present).toEqual(initial.present);
    expect(restored.past).toEqual([]);
  });

  it('clears redo after branching with a new change', () => {
    const initial = createDiagramHistory(snapshot([firstNode]));
    const changed = diagramHistoryReducer(initial, {
      type: 'commit',
      snapshot: snapshot([firstNode, secondNode]),
    });
    const undone = diagramHistoryReducer(changed, { type: 'undo' });
    const branched = diagramHistoryReducer(undone, {
      type: 'commit',
      snapshot: snapshot([{ ...firstNode, label: 'Gateway' }]),
    });

    expect(branched.future).toEqual([]);
  });

  it('tracks dirty state relative to the initial graph, including undo to clean', () => {
    const initial = createDiagramHistory(snapshot([firstNode]));
    const changed = diagramHistoryReducer(initial, {
      type: 'commit',
      snapshot: snapshot([firstNode, secondNode]),
    });

    expect(isDiagramDirty(initial)).toBe(false);
    expect(isDiagramDirty(changed)).toBe(true);
    expect(isDiagramDirty(diagramHistoryReducer(changed, { type: 'undo' }))).toBe(false);
  });
});
