import { describe, expect, it } from 'vitest';
import type { DiagramNode, PathElement } from '@roundtable/shared';

import { createTable } from './studioTables';
import {
  EMPTY_STUDIO_SELECTION,
  inkBounds,
  isSelectionEmpty,
  mergeSelections,
  pathBounds,
  rectsIntersect,
  selectionSize,
  studioElementsInRect,
  tableBounds,
} from './studioSelection';

const node: DiagramNode = { id: 'n1', label: 'Box', x: 0, y: 0, shape: 'box' };
const path: PathElement = {
  id: 'path-1',
  anchors: [
    { x: 300, y: 300 },
    { x: 360, y: 340 },
  ],
};
const stroke = {
  id: 'ink-1',
  points: [
    { x: 500, y: 100 },
    { x: 540, y: 160 },
  ],
};
const table = { ...createTable(2, 2, { x: 700, y: 400 }), id: 'table-1' };

const scene = { nodes: [node], ink: [stroke], paths: [path], tables: [table] };

describe('element bounds', () => {
  it('boxes a path from its anchors', () => {
    expect(pathBounds(path)).toEqual({ x: 300, y: 300, width: 60, height: 40 });
  });

  it('boxes a stroke from its points', () => {
    expect(inkBounds(stroke)).toEqual({ x: 500, y: 100, width: 40, height: 60 });
  });

  it('boxes a table from its origin and its tracks', () => {
    // A 2x2 default table is 192 x 64.
    expect(tableBounds(table)).toEqual({ x: 700, y: 400, width: 192, height: 64 });
  });

  it('reports nothing for an element with no geometry', () => {
    expect(pathBounds({ anchors: [] })).toBeNull();
    expect(inkBounds({ points: [] })).toBeNull();
  });

  it('counts a touch as an intersection, the way the node marquee already does', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectsIntersect(a, { x: 10, y: 10, width: 5, height: 5 })).toBe(true);
    expect(rectsIntersect(a, { x: 11, y: 0, width: 5, height: 5 })).toBe(false);
  });
});

describe('sweeping a selection', () => {
  it('catches every kind of element under the sweep', () => {
    const all = studioElementsInRect(scene, { x: 0, y: 0, width: 1000, height: 600 });
    expect(all).toEqual({
      nodeIds: ['n1'],
      inkIds: ['ink-1'],
      pathIds: ['path-1'],
      tableIds: ['table-1'],
    });
    expect(selectionSize(all)).toBe(4);
  });

  it('catches only what the sweep actually crossed', () => {
    const justPath = studioElementsInRect(scene, { x: 290, y: 290, width: 80, height: 60 });
    expect(justPath.pathIds).toEqual(['path-1']);
    expect(justPath.nodeIds).toEqual([]);
    expect(justPath.inkIds).toEqual([]);
    expect(justPath.tableIds).toEqual([]);
  });

  it('catches ink on its own, which the eraser used to be the only way to remove', () => {
    const justInk = studioElementsInRect(scene, { x: 480, y: 80, width: 80, height: 100 });
    expect(justInk.inkIds).toEqual(['ink-1']);
    expect(justInk.pathIds).toEqual([]);
  });

  it('comes back empty from a sweep over bare canvas', () => {
    const none = studioElementsInRect(scene, { x: 900, y: 10, width: 20, height: 20 });
    expect(isSelectionEmpty(none)).toBe(true);
  });

  it('handles a scene with no studio elements at all', () => {
    const legacy = studioElementsInRect({ nodes: [node] }, { x: 0, y: 0, width: 500, height: 500 });
    expect(legacy.nodeIds).toEqual(['n1']);
    expect(isSelectionEmpty({ ...legacy, nodeIds: [] })).toBe(true);
  });
});

describe('merging selections', () => {
  it('unions without repeating what is already there', () => {
    const merged = mergeSelections(
      { ...EMPTY_STUDIO_SELECTION, nodeIds: ['n1'], pathIds: ['path-1'] },
      { ...EMPTY_STUDIO_SELECTION, nodeIds: ['n1', 'n2'], inkIds: ['ink-1'] },
    );
    expect(merged.nodeIds).toEqual(['n1', 'n2']);
    expect(merged.pathIds).toEqual(['path-1']);
    expect(merged.inkIds).toEqual(['ink-1']);
  });
});
