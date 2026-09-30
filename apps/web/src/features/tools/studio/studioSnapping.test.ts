import { describe, expect, it } from 'vitest';

import {
  clampDragToCanvas,
  offsetRect,
  snapDragToGrid,
  snapResizePull,
  unionBounds,
} from './studioSnapping';

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

describe('holding a drag inside the sheet', () => {
  // The sheet is 960 x 600.
  it('leaves a drag that stays on the sheet alone', () => {
    expect(clampDragToCanvas(rect(100, 100), { x: 20, y: 20 })).toEqual({ x: 20, y: 20 });
  });

  it('pulls back a drag that would run off the right or bottom edge', () => {
    // A 100-wide box landing at 900 overhangs by 40; 50-tall at 580 by 30.
    expect(clampDragToCanvas(rect(900, 580), { x: 100, y: 100 })).toEqual({ x: 60, y: 70 });
  });

  it('pushes back a drag that would run off the left or top edge', () => {
    expect(clampDragToCanvas(rect(-10, -25), { x: -100, y: -100 })).toEqual({ x: -90, y: -75 });
  });

  it('shrinks the delta rather than the artwork, so a group keeps its spacing', () => {
    const group = unionBounds([rect(880, 0, 40, 40), rect(940, 0, 40, 40)])!;
    // The group is 100 wide sitting at 880, so it may travel 960-980 = -20.
    expect(clampDragToCanvas(offsetRect(group, { x: 60, y: 0 }), { x: 60, y: 0 })).toEqual({
      x: -20,
      y: 0,
    });
  });

  it('pins a group wider than the sheet to the near edge instead of jittering', () => {
    // No offset fits a 1000-wide box on a 960-wide sheet; it settles at x = 0.
    expect(clampDragToCanvas(rect(-50, 0, 1000, 50), { x: 0, y: 0 })).toEqual({ x: 50, y: 0 });
  });
});

describe('snapping a resize pull to the grid', () => {
  it('puts the pulled edge on the grid and leaves the held one alone', () => {
    // Held left edge at 203 (off the grid); the right edge pulled to 313 lands on 312.
    expect(snapResizePull(rect(203, 400, 100, 48), 'e', { x: 10, y: 5 })).toEqual({ x: 9, y: 5 });
  });

  it('snaps both pulled edges from a corner', () => {
    // Top-left pulled to 197, 395: the nearest lines are 200 and 392.
    expect(snapResizePull(rect(200, 400), 'nw', { x: -3, y: -5 })).toEqual({ x: 0, y: -8 });
  });

  it('snaps the pulled edge when resizing from the centre', () => {
    // The right edge pulled to 307 lands on 304; the left mirrors it.
    expect(snapResizePull(rect(200, 400), 'e', { x: 7, y: 0 }, { fromCentre: true })).toEqual({
      x: 4,
      y: 0,
    });
  });

  it('never snaps a frame through its own held edge', () => {
    // Pulled almost flat: the nearest line is at or behind the held edge.
    expect(snapResizePull(rect(200, 400, 100, 50), 'e', { x: -97, y: 0 })).toEqual({
      x: -97,
      y: 0,
    });
  });

  it('keeps a uniform scale uniform, with the longer side on the grid', () => {
    const frame = rect(200, 400, 100, 50);
    const pull = snapResizePull(frame, 'se', { x: 13, y: 0 }, { uniform: true });
    // Along the reach, so both axes grow by the same factor.
    expect(pull.x / 100).toBeCloseTo(pull.y / 50);
    // And the right edge, the longer reach, lands on a grid line.
    expect((frame.x + frame.width + pull.x) % 8).toBeCloseTo(0);
  });
});
