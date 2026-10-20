import { describe, expect, it } from 'vitest';

import {
  droppedOrder,
  landingIndex,
  landingOffset,
  rubberBand,
  slideShifts,
  type RowLayout,
} from './dragReorder';

/** Four 90px rows, 10px apart, the second one lifted. */
const layout: RowLayout = {
  ids: ['a', 'b', 'c', 'd'],
  boxes: [
    { top: 0, bottom: 90 },
    { top: 100, bottom: 190 },
    { top: 200, bottom: 290 },
    { top: 300, bottom: 390 },
  ],
  self: 1,
  step: 100,
  min: -100,
  max: 200,
};

describe('dragReorder', () => {
  it('lands on the furthest row whose middle the leading edge has passed', () => {
    expect(landingIndex(layout, 0)).toBe(1);
    // Bottom edge 190 + 50 = 240: not past c's middle (245).
    expect(landingIndex(layout, 50)).toBe(1);
    expect(landingIndex(layout, 60)).toBe(2);
    expect(landingIndex(layout, 200)).toBe(3);
    // Top edge 100 - 60 = 40: past a's middle (45).
    expect(landingIndex(layout, -60)).toBe(0);
  });

  it('slides the rows it passes one place back towards where it came from', () => {
    expect(slideShifts(layout, 3)).toEqual({ c: -100, d: -100 });
    expect(slideShifts(layout, 0)).toEqual({ a: 100 });
    expect(slideShifts(layout, 1)).toEqual({});
  });

  it('eases into the gap it opened', () => {
    expect(landingOffset(layout, 3)).toBe(200);
    expect(landingOffset(layout, 0)).toBe(-100);
  });

  it('gives the order the rows land in', () => {
    expect(droppedOrder(layout, 3)).toEqual(['a', 'c', 'd', 'b']);
    expect(droppedOrder(layout, 0)).toEqual(['b', 'a', 'c', 'd']);
    expect(droppedOrder(layout, 1)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('gives a little past the ends, never more than 14px', () => {
    expect(rubberBand(0)).toBe(0);
    expect(rubberBand(40)).toBeGreaterThan(0);
    expect(rubberBand(10_000)).toBeLessThanOrEqual(14);
    expect(rubberBand(-10_000)).toBeGreaterThanOrEqual(-14);
  });
});
