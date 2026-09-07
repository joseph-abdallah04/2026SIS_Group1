import { describe, expect, it } from 'vitest';
import type { PathElement } from '@roundtable/shared';

import {
  anchorAtPoint,
  isSmoothAnchor,
  moveAnchor,
  moveHandle,
  removeAnchor,
  toggleAnchorSmooth,
} from './studioPathEdit';

const path = (anchors: PathElement['anchors'], closed = false): PathElement => ({
  id: 'path-1',
  anchors,
  ...(closed ? { closed: true } : {}),
});

const line = () =>
  path([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ]);

describe('moving an anchor', () => {
  it('moves the point and carries its curve with it', () => {
    const curved = path([
      { x: 0, y: 0 },
      { x: 50, y: 50, in: { x: -10, y: 0 }, out: { x: 10, y: 0 } },
    ]);
    const moved = moveAnchor(curved, 1, { x: 80, y: 90 });
    expect(moved.anchors[1]).toEqual({ x: 80, y: 90, in: { x: -10, y: 0 }, out: { x: 10, y: 0 } });
  });

  it('snaps to 45° from where the anchor started when constrained', () => {
    const moved = moveAnchor(line(), 1, { x: 200, y: 12 }, { x: 100, y: 0 }, true);
    expect(moved.anchors[1]).toMatchObject({ y: 0 });
    expect(moved.anchors[1]!.x).toBeGreaterThan(100);
  });

  it('leaves the path alone for an index that is not there', () => {
    const original = line();
    expect(moveAnchor(original, 9, { x: 0, y: 0 })).toBe(original);
  });
});

describe('dragging a handle', () => {
  it('mirrors the opposite handle so the curve stays smooth', () => {
    const dragged = moveHandle(line(), 1, 'out', { x: 130, y: 20 });
    expect(dragged.anchors[1]!.out).toEqual({ x: 30, y: 20 });
    expect(dragged.anchors[1]!.in).toEqual({ x: -30, y: -20 });
  });

  it('leaves the other side untouched when the tangent is broken', () => {
    const smooth = moveHandle(line(), 1, 'out', { x: 130, y: 20 });
    const broken = moveHandle(smooth, 1, 'out', { x: 110, y: 60 }, true);
    expect(broken.anchors[1]!.out).toEqual({ x: 10, y: 60 });
    // The incoming handle keeps the direction it had before the tangent broke.
    expect(broken.anchors[1]!.in).toEqual({ x: -30, y: -20 });
  });

  it('breaking a tangent on a corner leaves the other side absent', () => {
    const broken = moveHandle(line(), 1, 'out', { x: 130, y: 20 }, true);
    expect(broken.anchors[1]!.out).toEqual({ x: 30, y: 20 });
    expect(broken.anchors[1]!.in).toBeUndefined();
  });
});

describe('corner and smooth', () => {
  it('smooths a corner along the line between its neighbours', () => {
    const smoothed = toggleAnchorSmooth(line(), 1);
    // Neighbours run (0,0) → (100,100), so the tangent is a third of that.
    expect(smoothed.anchors[1]!.out).toEqual({ x: 33.3, y: 33.3 });
    expect(smoothed.anchors[1]!.in).toEqual({ x: -33.3, y: -33.3 });
    expect(isSmoothAnchor(smoothed.anchors[1]!)).toBe(true);
  });

  it('turns a smooth anchor back into a corner', () => {
    const smoothed = toggleAnchorSmooth(line(), 1);
    const cornered = toggleAnchorSmooth(smoothed, 1);
    expect(cornered.anchors[1]).toEqual({ x: 100, y: 0 });
    expect(isSmoothAnchor(cornered.anchors[1]!)).toBe(false);
  });

  it('leans on its one neighbour at the end of an open path', () => {
    const smoothed = toggleAnchorSmooth(line(), 0);
    expect(isSmoothAnchor(smoothed.anchors[0]!)).toBe(true);
  });

  it('wraps around the ends of a closed path', () => {
    const closed = path(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      true,
    );
    // The first anchor's "previous" is the last one, so it has a real tangent.
    expect(isSmoothAnchor(toggleAnchorSmooth(closed, 0).anchors[0]!)).toBe(true);
  });
});

describe('removing an anchor', () => {
  it('drops the anchor and keeps the rest', () => {
    const shortened = removeAnchor(line(), 1);
    expect(shortened?.anchors).toHaveLength(2);
    expect(shortened?.anchors[1]).toEqual({ x: 100, y: 100 });
  });

  it('reports that a two-anchor path cannot lose one', () => {
    // Nothing worth drawing would be left, so the caller removes the path.
    expect(
      removeAnchor(
        path([
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ]),
        0,
      ),
    ).toBeNull();
  });
});

describe('hit-testing anchors', () => {
  it('finds the anchor under the pointer', () => {
    expect(anchorAtPoint(line(), { x: 98, y: 3 }, 8)).toBe(1);
  });

  it('takes the nearest when two are in range', () => {
    const crowded = path([
      { x: 0, y: 0 },
      { x: 6, y: 0 },
    ]);
    expect(anchorAtPoint(crowded, { x: 5, y: 0 }, 8)).toBe(1);
  });

  it('finds nothing when the pointer is clear of them all', () => {
    expect(anchorAtPoint(line(), { x: 50, y: 50 }, 4)).toBeNull();
  });
});
