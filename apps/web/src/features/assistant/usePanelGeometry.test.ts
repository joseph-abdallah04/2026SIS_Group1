import { describe, expect, it } from 'vitest';

import {
  clampGeometry,
  defaultGeometry,
  resizeFrom,
  MIN_HEIGHT,
  MIN_WIDTH,
  type PanelGeometry,
} from './usePanelGeometry';

const VW = 1440;
const VH = 900;
const panel: PanelGeometry = { x: 400, y: 200, width: 420, height: 500 };

describe('defaultGeometry', () => {
  // The bug that started this: the panel's top edge sat in the board header, over the session
  // status and End session.
  it('leaves the board header clear', () => {
    const g = defaultGeometry(VW, VH);
    expect(g.y).toBeGreaterThanOrEqual(72);
  });

  it('sits in the bottom-right, clear of the creative toolbar', () => {
    const g = defaultGeometry(VW, VH);
    expect(g.x + g.width).toBeLessThanOrEqual(VW);
    expect(g.y + g.height).toBeLessThanOrEqual(VH - 90);
  });

  it('still produces a usable panel on a small window', () => {
    const g = defaultGeometry(700, 500);
    expect(g.width).toBeGreaterThanOrEqual(MIN_WIDTH);
    expect(g.height).toBeGreaterThanOrEqual(MIN_HEIGHT);
  });
});

describe('clampGeometry', () => {
  it('leaves a panel that already fits alone', () => {
    expect(clampGeometry(panel, VW, VH)).toEqual(panel);
  });

  it('never lets the header go above the top, since it is the only drag handle', () => {
    expect(clampGeometry({ ...panel, y: -300 }, VW, VH).y).toBe(0);
  });

  it('keeps a grabbable strip on screen at both edges', () => {
    const offRight = clampGeometry({ ...panel, x: 5000 }, VW, VH);
    expect(offRight.x).toBeLessThanOrEqual(VW - 48);

    const offLeft = clampGeometry({ ...panel, x: -5000 }, VW, VH);
    expect(offLeft.x + offLeft.width).toBeGreaterThanOrEqual(48);
  });

  it('enforces the minimum size', () => {
    const tiny = clampGeometry({ ...panel, width: 10, height: 10 }, VW, VH);
    expect(tiny.width).toBe(MIN_WIDTH);
    expect(tiny.height).toBe(MIN_HEIGHT);
  });

  it('shrinks a panel bigger than the window', () => {
    const huge = clampGeometry({ x: 0, y: 0, width: 4000, height: 4000 }, VW, VH);
    expect(huge.width).toBe(VW);
    expect(huge.height).toBe(VH);
  });

  // A phone-sized window is narrower than the minimum: the panel must still exist rather
  // than collapsing to nothing or producing NaN.
  it('survives a window smaller than the minimum panel', () => {
    const g = clampGeometry(panel, 200, 200);
    expect(g.width).toBe(MIN_WIDTH);
    expect(g.height).toBe(MIN_HEIGHT);
    expect(Number.isFinite(g.x) && Number.isFinite(g.y)).toBe(true);
  });
});

describe('resizeFrom', () => {
  it('grows from the south-east corner without moving the panel', () => {
    const g = resizeFrom(panel, 'se', 900, 800);
    expect(g).toEqual({ x: 400, y: 200, width: 500, height: 600 });
  });

  it('grows from the north-west corner by moving the origin, not the far edges', () => {
    const g = resizeFrom(panel, 'nw', 300, 100);
    expect(g).toEqual({ x: 300, y: 100, width: 520, height: 600 });
    // The right and bottom edges are exactly where they were.
    expect(g.x + g.width).toBe(panel.x + panel.width);
    expect(g.y + g.height).toBe(panel.y + panel.height);
  });

  it('handles the mixed corners one axis at a time', () => {
    const ne = resizeFrom(panel, 'ne', 900, 100);
    expect(ne).toMatchObject({ x: 400, width: 500 });
    expect(ne.y + ne.height).toBe(panel.y + panel.height);

    const sw = resizeFrom(panel, 'sw', 300, 800);
    expect(sw).toMatchObject({ y: 200, height: 600 });
    expect(sw.x + sw.width).toBe(panel.x + panel.width);
  });

  // Dragging a west or north corner past the minimum must stop dead. If the anchor drifted
  // instead, the panel would crawl across the screen as you kept pulling.
  it('pins the far edge when you drag past the minimum size', () => {
    const g = resizeFrom(panel, 'nw', 5000, 5000);
    expect(g.width).toBe(MIN_WIDTH);
    expect(g.height).toBe(MIN_HEIGHT);
    expect(g.x + g.width).toBe(panel.x + panel.width);
    expect(g.y + g.height).toBe(panel.y + panel.height);
  });

  it('pins the origin when a south-east drag goes past the minimum', () => {
    const g = resizeFrom(panel, 'se', -5000, -5000);
    expect(g).toEqual({ x: 400, y: 200, width: MIN_WIDTH, height: MIN_HEIGHT });
  });
});
