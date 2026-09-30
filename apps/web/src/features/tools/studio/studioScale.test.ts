import {
  pathCurveLocalBounds,
  pointsBounds,
  rotatePoint,
  type PathElement,
} from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import type { StudioInkStroke } from './studioInk';
import {
  MIN_SCALED_EXTENT,
  handleAxes,
  heldPoint,
  resizeCursorFor,
  scaleInk,
  scalePath,
  uniformScaleFromPull,
} from './studioScale';

// A 100 x 50 stroke with its top-left corner at (100, 100).
const stroke: StudioInkStroke = {
  id: 'ink-1',
  points: [
    { x: 100, y: 100 },
    { x: 150, y: 140 },
    { x: 200, y: 150 },
  ],
  strokeWidthPreset: 'thick',
};

function frameOf(points: readonly { x: number; y: number }[]) {
  return pointsBounds(points)!;
}

describe('resize handles', () => {
  it('says which way each axis of a handle moves', () => {
    expect(handleAxes('nw')).toEqual({ hx: -1, hy: -1 });
    expect(handleAxes('e')).toEqual({ hx: 1, hy: 0 });
    expect(handleAxes('s')).toEqual({ hx: 0, hy: 1 });
  });

  it('holds the opposite corner, the opposite edge, or the centre', () => {
    const box = { x: 0, y: 0, width: 100, height: 50 };
    expect(heldPoint(box, 'se')).toEqual({ x: 0, y: 0 });
    expect(heldPoint(box, 'n')).toEqual({ x: 50, y: 50 });
    expect(heldPoint(box, 'w')).toEqual({ x: 100, y: 25 });
    expect(heldPoint(box, 'nw', true)).toEqual({ x: 50, y: 25 });
  });

  it('turns the resize cursor with the element', () => {
    expect(resizeCursorFor('n')).toBe('ns-resize');
    expect(resizeCursorFor('e')).toBe('ew-resize');
    expect(resizeCursorFor('se')).toBe('nwse-resize');
    expect(resizeCursorFor('ne')).toBe('nesw-resize');
    // A quarter turn makes the top edge a vertical line.
    expect(resizeCursorFor('n', 90)).toBe('ew-resize');
    expect(resizeCursorFor('se', 90)).toBe('nesw-resize');
    // Eighth turns land on the diagonals, and negative angles are handled.
    expect(resizeCursorFor('e', 45)).toBe('nwse-resize');
    expect(resizeCursorFor('e', -45)).toBe('nesw-resize');
  });

  it('measures a uniform scale along the handle, ignoring a sideways wobble', () => {
    const box = { x: 0, y: 0, width: 100, height: 100 };
    expect(uniformScaleFromPull(box, 'e', { x: 50, y: 0 })).toBeCloseTo(1.5);
    expect(uniformScaleFromPull(box, 'e', { x: 50, y: 80 })).toBeCloseTo(1.5);
    expect(uniformScaleFromPull(box, 'se', { x: 100, y: 100 })).toBeCloseTo(2);
    // From the centre the same pull goes twice as far.
    expect(uniformScaleFromPull(box, 'e', { x: 50, y: 0 }, true)).toBeCloseTo(2);
  });
});

describe('scaling a freehand stroke', () => {
  it('scales from the opposite corner and keeps the stroke weight', () => {
    const scaled = scaleInk(stroke, 'se', { x: 100, y: 50 });
    expect(frameOf(scaled.points)).toEqual({ x: 100, y: 100, width: 200, height: 100 });
    expect(scaled.points[1]).toEqual({ x: 200, y: 180 });
    expect(scaled.strokeWidthPreset).toBe('thick');
  });

  it('scales both axes from an edge, so the drawing never stretches', () => {
    const scaled = scaleInk(stroke, 'e', { x: 50, y: 0 });
    // 1.5x, about the middle of the left edge (100, 125).
    expect(frameOf(scaled.points)).toEqual({ x: 100, y: 87.5, width: 150, height: 75 });
  });

  it('scales about the centre with Alt', () => {
    const scaled = scaleInk(stroke, 'se', { x: 50, y: 25 }, true);
    expect(frameOf(scaled.points)).toEqual({ x: 50, y: 75, width: 200, height: 100 });
  });

  it('never shrinks a stroke past the smallest it can still be found at', () => {
    const scaled = scaleInk(stroke, 'se', { x: -1_000, y: -1_000 });
    const frame = frameOf(scaled.points);
    expect(Math.max(frame.width, frame.height)).toBeCloseTo(MIN_SCALED_EXTENT, 1);
  });

  it('stops growing at the edge of the sheet', () => {
    const nearEdge: StudioInkStroke = {
      id: 'edge',
      points: [
        { x: 800, y: 100 },
        { x: 900, y: 150 },
      ],
    };
    const scaled = scaleInk(nearEdge, 'se', { x: 500, y: 0 });
    const frame = frameOf(scaled.points);
    expect(frame.x + frame.width).toBeLessThanOrEqual(960.5);
    expect(frame.x + frame.width).toBeGreaterThan(955);
    // Still uniform: 1.6x on both sides.
    expect(frame.width / frame.height).toBeCloseTo(2, 1);
  });

  it('keeps the held corner where it is drawn on a turned stroke', () => {
    const turned: StudioInkStroke = { ...stroke, rotation: 90 };
    const before = frameOf(turned.points);
    const drawnBefore = rotatePoint(
      { x: before.x, y: before.y },
      { x: before.x + before.width / 2, y: before.y + before.height / 2 },
      90,
    );

    // Double it: the pull is (100, 50) in the stroke's own frame, turned onto
    // the screen.
    const delta = rotatePoint({ x: 100, y: 50 }, { x: 0, y: 0 }, 90);
    const scaled = scaleInk(turned, 'se', delta);
    const after = frameOf(scaled.points);
    expect(after.width).toBeCloseTo(200, 0);
    const drawnAfter = rotatePoint(
      { x: after.x, y: after.y },
      { x: after.x + after.width / 2, y: after.y + after.height / 2 },
      90,
    );
    expect(drawnAfter.x).toBeCloseTo(drawnBefore.x, 0);
    expect(drawnAfter.y).toBeCloseTo(drawnBefore.y, 0);
    expect(scaled.rotation).toBe(90);
  });

  it('leaves a flat stroke alone when pulled on the axis it has no extent along', () => {
    const flat: StudioInkStroke = {
      id: 'flat',
      points: [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ],
    };
    expect(scaleInk(flat, 'n', { x: 0, y: -50 }).points).toEqual(flat.points);
    // Its corners still work.
    expect(frameOf(scaleInk(flat, 'se', { x: 100, y: 0 }).points).width).toBeCloseTo(200);
  });
});

describe('scaling a pen path', () => {
  // Its curve peaks 45 units above the anchors.
  const arch: PathElement = {
    id: 'arch',
    anchors: [
      { x: 100, y: 200, out: { x: 0, y: -60 } },
      { x: 200, y: 200, in: { x: 0, y: -60 } },
    ],
    strokeWidthPreset: 'thin',
  };

  it('scales the curve it paints, bezier handles included, from the frame corner', () => {
    // The frame is the curve's box: (100, 155) to (200, 200).
    const scaled = scalePath(arch, 'se', { x: 100, y: 45 });
    expect(pathCurveLocalBounds(scaled)).toEqual({ x: 100, y: 155, width: 200, height: 90 });
    expect(scaled.anchors[0]!.out).toEqual({ x: 0, y: -120 });
    expect(scaled.anchors[1]!.in).toEqual({ x: 0, y: -120 });
    expect(scaled.strokeWidthPreset).toBe('thin');
  });

  it('keeps the top of the bulge where it was when pulled from the bottom', () => {
    const scaled = scalePath(arch, 's', { x: 0, y: 45 });
    const frame = pathCurveLocalBounds(scaled)!;
    expect(frame.y).toBeCloseTo(155);
    expect(frame.height).toBeCloseTo(90);
    expect(frame.width).toBeCloseTo(200);
  });

  it('keeps a turned path pinned at the held corner', () => {
    const turned: PathElement = { ...arch, rotation: 30 };
    const scaled = scalePath(turned, 'e', rotatePoint({ x: 50, y: 0 }, { x: 0, y: 0 }, 30));
    // The west edge's middle is held; on screen it must not move.
    const drawn = (path: PathElement) => {
      const frame = pathCurveLocalBounds(path)!;
      const pivot = pointsBounds(path.anchors)!;
      return rotatePoint(
        { x: frame.x, y: frame.y + frame.height / 2 },
        { x: pivot.x + pivot.width / 2, y: pivot.y + pivot.height / 2 },
        30,
      );
    };
    expect(drawn(scaled).x).toBeCloseTo(drawn(turned).x, 0);
    expect(drawn(scaled).y).toBeCloseTo(drawn(turned).y, 0);
    expect(pathCurveLocalBounds(scaled)!.width).toBeCloseTo(150, 0);
  });
});
