import { describe, expect, it } from 'vitest';
import { DIAGRAM_INK_POINT_LIMIT, packInkPoints } from '@roundtable/shared';

import { fitInkStroke, type StudioInkStroke } from './studioInk';

/** A wandering line, so simplification cannot collapse it to a straight one. */
const longStroke = (count: number): StudioInkStroke => ({
  id: 'ink-long',
  points: Array.from({ length: count }, (_, index) => ({
    x: index * 0.7,
    y: 300 + Math.sin(index / 3) * 120,
  })),
});

describe('fitting a stroke to what the artifact can hold', () => {
  it('brings a very long stroke under the contract cap', () => {
    // A pointer reports a position every few milliseconds, so an unhurried
    // stroke arrives with thousands of points. Over the cap it is refused by
    // the write path and dropped by the read path: the first stops proposing
    // from working, the second loses a saved drawing without saying so.
    const fitted = fitInkStroke(longStroke(4000));
    expect(packInkPoints(fitted.points).length).toBeLessThanOrEqual(DIAGRAM_INK_POINT_LIMIT);
  });

  it('holds the cap however long the stroke is', () => {
    for (const count of [401, 1000, 20_000]) {
      const fitted = fitInkStroke(longStroke(count));
      expect(packInkPoints(fitted.points).length).toBeLessThanOrEqual(DIAGRAM_INK_POINT_LIMIT);
    }
  });

  it('keeps where the stroke started and where the pointer was lifted', () => {
    // A stroke that stops short of its own end reads as a different stroke.
    const original = longStroke(4000);
    const fitted = fitInkStroke(original);
    expect(fitted.points[0]).toEqual(original.points[0]);
    expect(fitted.points.at(-1)).toEqual(original.points.at(-1));
  });

  it('keeps the shape of what was drawn', () => {
    // Thinning is allowed to lose detail, not to lose the line: the fitted
    // stroke still has to cover the ground the original did.
    const original = longStroke(4000);
    const fitted = fitInkStroke(original);
    const spread = (points: readonly { x: number; y: number }[]) => ({
      x: Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x)),
      y: Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y)),
    });
    const before = spread(original.points);
    const after = spread(fitted.points);
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.y).toBeGreaterThan(before.y * 0.9);
  });

  it('leaves an ordinary stroke to the simplifier', () => {
    const ordinary = longStroke(40);
    const fitted = fitInkStroke(ordinary);
    expect(fitted.points.length).toBeLessThanOrEqual(ordinary.points.length);
    expect(fitted.points.length).toBeGreaterThan(1);
  });

  it("carries the stroke's own styling through", () => {
    const styled: StudioInkStroke = { ...longStroke(4000), strokeColor: 'rose' };
    const fitted = fitInkStroke(styled);
    expect(fitted.strokeColor).toBe('rose');
    expect(fitted.id).toBe('ink-long');
  });

  it('copes with a stroke of a single point', () => {
    expect(fitInkStroke({ id: 'i', points: [{ x: 1, y: 2 }] }).points).toHaveLength(1);
  });
});
