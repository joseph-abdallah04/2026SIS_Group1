import { describe, expect, it } from 'vitest';

import { offsetRect, snapDragToGrid, unionBounds } from './studioSnapping';

const rect = (x: number, y: number, width = 100, height = 50) => ({ x, y, width, height });

describe('snapping a drag to the grid', () => {
  it('pulls the moving artwork onto the nearest grid line', () => {
    // Landing at 203, 405 on an 8-unit grid: nearest lines are 200 and 408.
    expect(snapDragToGrid(rect(203, 405), { x: 0, y: 0 }, true)).toEqual({ x: -3, y: 3 });
  });

  it('leaves an already-aligned drag exactly where it is', () => {
    expect(snapDragToGrid(rect(200, 400), { x: 16, y: 8 }, true)).toEqual({ x: 16, y: 8 });
  });

  it('does nothing at all when snapping is switched off', () => {
    expect(snapDragToGrid(rect(203, 405), { x: 7, y: 9 }, false)).toEqual({ x: 7, y: 9 });
  });

  it('adjusts the delta rather than replacing it, so the drag still tracks', () => {
    const delta = { x: 40, y: 40 };
    const snapped = snapDragToGrid(rect(243, 445), delta, true);
    expect(snapped.x).toBeCloseTo(delta.x - 3);
    expect(snapped.y).toBeCloseTo(delta.y + 3);
  });
});

describe('group bounds', () => {
  it('boxes everything being dragged, so spacing inside a group is kept', () => {
    expect(unionBounds([rect(0, 0, 10, 10), rect(50, 20, 10, 10)])).toEqual({
      x: 0,
      y: 0,
      width: 60,
      height: 30,
    });
  });

  it('snaps a group by its outer box, not by one member', () => {
    const group = unionBounds([rect(203, 405, 10, 10), rect(253, 425, 10, 10)])!;
    const delta = snapDragToGrid(group, { x: 0, y: 0 }, true);
    // Both members shift by the same amount, so their offset is untouched.
    expect(delta).toEqual({ x: -3, y: 3 });
  });

  it('reports nothing for an empty group', () => {
    expect(unionBounds([])).toBeNull();
  });

  it('offsets a box by a delta', () => {
    expect(offsetRect(rect(10, 10), { x: 5, y: -5 })).toEqual({
      x: 15,
      y: 5,
      width: 100,
      height: 50,
    });
  });
});
