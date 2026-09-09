import { describe, expect, it } from 'vitest';

import { alignOffsets, distributeOffsets, type ArrangeBox } from './studioArrange';

const box = (key: string, x: number, y: number, width = 100, height = 40): ArrangeBox => ({
  key,
  x,
  y,
  width,
  height,
});

const moved = (boxes: readonly ArrangeBox[], offsets: Map<string, { x: number; y: number }>) =>
  boxes.map((entry) => {
    const offset = offsets.get(entry.key) ?? { x: 0, y: 0 };
    return { ...entry, x: entry.x + offset.x, y: entry.y + offset.y };
  });

describe('aligning', () => {
  it('brings every box to the leading edge of the group', () => {
    const boxes = [box('a', 40, 0), box('b', 120, 60), box('c', 200, 120)];
    const result = moved(boxes, alignOffsets(boxes, 'left'));
    expect(result.map((entry) => entry.x)).toEqual([40, 40, 40]);
    // Only the axis being aligned moves.
    expect(result.map((entry) => entry.y)).toEqual([0, 60, 120]);
  });

  it('aligns trailing edges, not origins, so widths are respected', () => {
    const boxes = [box('a', 0, 0, 100), box('b', 40, 60, 220)];
    const result = moved(boxes, alignOffsets(boxes, 'right'));
    expect(result.map((entry) => entry.x + entry.width)).toEqual([260, 260]);
  });

  it('centres on the middle of the group, not on the first box', () => {
    const boxes = [box('a', 0, 0, 100), box('b', 100, 60, 100)];
    const result = moved(boxes, alignOffsets(boxes, 'centerX'));
    expect(result.map((entry) => entry.x)).toEqual([50, 50]);
  });

  it('works the same way down the other axis', () => {
    const boxes = [box('a', 0, 20, 100, 40), box('b', 0, 200, 100, 80)];
    expect(moved(boxes, alignOffsets(boxes, 'top')).map((entry) => entry.y)).toEqual([20, 20]);
    expect(
      moved(boxes, alignOffsets(boxes, 'bottom')).map((entry) => entry.y + entry.height),
    ).toEqual([280, 280]);
  });

  it('mixes kinds without caring what they are', () => {
    // The whole point: a stroke's bounding box and a table's align the same way,
    // which is what lets a selection with no shared property still be arranged.
    const boxes = [box('stroke-1', 12, 0, 60, 60), box('table-1', 300, 0, 240, 120)];
    expect(moved(boxes, alignOffsets(boxes, 'left')).map((entry) => entry.x)).toEqual([12, 12]);
  });

  it('leaves a lone box alone, since there is nothing to align it to', () => {
    expect(alignOffsets([box('a', 40, 40)], 'left').size).toBe(0);
    expect(alignOffsets([], 'left').size).toBe(0);
  });

  it('is exact rather than snapped, so alignment survives being computed', () => {
    // Rounding a shared edge onto the grid moves differently sized boxes by
    // different amounts and undoes the alignment.
    const boxes = [box('a', 0, 0, 101), box('b', 0, 60, 34)];
    const result = moved(boxes, alignOffsets(boxes, 'centerX'));
    expect(result[0]!.x + result[0]!.width / 2).toBeCloseTo(result[1]!.x + result[1]!.width / 2);
  });
});

describe('distributing', () => {
  it('evens the gaps and leaves the outermost two where they are', () => {
    const boxes = [box('a', 0, 0, 100), box('b', 120, 0, 100), box('c', 400, 0, 100)];
    const result = moved(boxes, distributeOffsets(boxes, 'horizontal'));
    expect(result.map((entry) => entry.x)).toEqual([0, 200, 400]);
  });

  it('measures the gap between boxes, not between origins', () => {
    // A wide box and a narrow one get the same air around them, which is what
    // "evenly spaced" means to the eye.
    const boxes = [box('a', 0, 0, 40), box('b', 100, 0, 200), box('c', 500, 0, 40)];
    const result = moved(boxes, distributeOffsets(boxes, 'horizontal'));
    const gaps = [
      result[1]!.x - (result[0]!.x + result[0]!.width),
      result[2]!.x - (result[1]!.x + result[1]!.width),
    ];
    expect(gaps[0]).toBeCloseTo(gaps[1]!);
  });

  it('spreads by where the boxes are, not by the order they were selected', () => {
    const boxes = [box('c', 400, 0, 100), box('a', 0, 0, 100), box('b', 120, 0, 100)];
    const offsets = distributeOffsets(boxes, 'horizontal');
    expect(offsets.get('a')).toEqual({ x: 0, y: 0 });
    expect(offsets.get('c')).toEqual({ x: 0, y: 0 });
    expect(offsets.get('b')!.x).toBeCloseTo(80);
  });

  it('moves along one axis only', () => {
    const boxes = [box('a', 0, 0, 100, 40), box('b', 0, 100, 100, 40), box('c', 0, 400, 100, 40)];
    const offsets = distributeOffsets(boxes, 'vertical');
    expect(offsets.get('b')!.x).toBe(0);
    expect(moved(boxes, offsets).map((entry) => entry.y)).toEqual([0, 200, 400]);
  });

  it('needs three boxes: two have only one gap, which is already even', () => {
    const boxes = [box('a', 0, 0), box('b', 500, 0)];
    expect(distributeOffsets(boxes, 'horizontal').size).toBe(0);
  });
});
