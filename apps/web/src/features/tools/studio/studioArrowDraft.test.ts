import { describe, expect, it } from 'vitest';
import { arrowGeometry, type ArrowElement, type ArrowTarget } from '@roundtable/shared';

import {
  ARROW_SNAP_TOLERANCE,
  arrowEndpointAt,
  arrowSnapToleranceForView,
  bendForPointer,
  draftArrow,
  elbowHandlePoint,
  finishArrow,
  isArrowWorthPlacing,
  snapArrowPoint,
} from './studioArrowDraft';

const target = (id: string, x: number, y: number, width = 80, height = 40): ArrowTarget => ({
  id,
  box: { x, y, width, height },
});

describe('deciding what an endpoint binds to', () => {
  it('binds when the pointer is over the element', () => {
    const snap = snapArrowPoint({ x: 40, y: 20 }, [target('a', 0, 0)]);
    expect(snap?.elementId).toBe('a');
  });

  it('binds when the pointer is near the outline but outside it', () => {
    const snap = snapArrowPoint({ x: 86, y: 20 }, [target('a', 0, 0)]);
    expect(snap?.elementId).toBe('a');
    // The dot sits on the outline, which is where the arrow will attach.
    expect(snap?.point.x).toBeCloseTo(80, 5);
  });

  it('binds to nothing out in open canvas', () => {
    expect(snapArrowPoint({ x: 400, y: 400 }, [target('a', 0, 0)])).toBeNull();
  });

  it('respects the tolerance it is given', () => {
    const far = { x: 80 + ARROW_SNAP_TOLERANCE + 5, y: 20 };
    expect(snapArrowPoint(far, [target('a', 0, 0)])).toBeNull();
    expect(snapArrowPoint(far, [target('a', 0, 0)], 40)?.elementId).toBe('a');
  });

  it('prefers the nearer of two elements', () => {
    const snap = snapArrowPoint({ x: 190, y: 20 }, [target('a', 0, 0), target('b', 200, 0)]);
    expect(snap?.elementId).toBe('b');
  });

  it('prefers the smaller when the pointer is inside both', () => {
    // A shape sitting on top of a big drawing: the small thing under the
    // pointer is what was aimed at, not the thing it happens to sit on.
    const snap = snapArrowPoint({ x: 100, y: 100 }, [
      target('drawing', 0, 0, 400, 400),
      target('shape', 80, 80, 60, 40),
    ]);
    expect(snap?.elementId).toBe('shape');
  });

  it('will bind both ends of an arrow to one element', () => {
    // Nothing is excluded any more: an arrow whose ends land on the same thing
    // is a self-loop, drawn around it.
    expect(snapArrowPoint({ x: 40, y: 20 }, [target('a', 0, 0)])?.elementId).toBe('a');
  });

  it('keeps the point alongside the binding', () => {
    const endpoint = arrowEndpointAt({ x: 40, y: 20 }, [target('a', 0, 0)]);
    // The point is the fallback for when that element is deleted, so it has to
    // be where the user actually put the end.
    expect(endpoint).toEqual({ x: 40, y: 20, elementId: 'a' });
  });

  it('leaves a free end free', () => {
    expect(arrowEndpointAt({ x: 400, y: 400 }, [target('a', 0, 0)])).toEqual({ x: 400, y: 400 });
  });

  it('keeps the catchment the same size on screen at any zoom', () => {
    const bounds = { width: 960, height: 600 };
    expect(arrowSnapToleranceForView({ width: 960, height: 600 }, bounds)).toBe(
      ARROW_SNAP_TOLERANCE,
    );
    // Zoomed in to half the scene: a screen pixel is worth less scene, so the
    // tolerance in scene units shrinks to match.
    expect(arrowSnapToleranceForView({ width: 480, height: 300 }, bounds)).toBe(
      ARROW_SNAP_TOLERANCE / 2,
    );
    expect(arrowSnapToleranceForView({ width: 960, height: 600 }, { width: 0, height: 0 })).toBe(
      ARROW_SNAP_TOLERANCE,
    );
  });
});

describe('pinning where the arrow was dropped', () => {
  const wide = (id: string): ArrowTarget => ({ id, box: { x: 0, y: 0, width: 200, height: 100 } });

  it('pins an aim at the edge, so the arrow meets it there', () => {
    // This is what makes "attach two thirds of the way down the left edge"
    // stick, instead of the arrow sliding round to face wherever the far end is.
    const snap = snapArrowPoint({ x: 1, y: 70 }, [wide('t')]);
    expect(snap?.at?.u).toBeCloseTo(0, 1);
    expect(snap?.at?.v).toBeCloseTo(0.7, 1);
  });

  it('leaves an aim at the middle of a shape unpinned', () => {
    // Dropped well inside, the arrow keeps aiming at the centre and slides
    // around the outline as the other end moves — the behaviour an edge has.
    expect(snapArrowPoint({ x: 100, y: 50 }, [wide('t')])?.at).toBeUndefined();
  });

  it('always pins on a drawing, and at the point itself', () => {
    // A stroke has no inside worth aiming at, so every drop is a place on it.
    const ink: ArrowTarget = { ...wide('ink-1'), freeform: true };
    const snap = snapArrowPoint({ x: 100, y: 50 }, [ink]);
    expect(snap?.point).toEqual({ x: 100, y: 50 });
    expect(snap?.at).toEqual({ u: 0.5, v: 0.5 });
  });

  it('carries the attachment into the endpoint it builds', () => {
    const endpoint = arrowEndpointAt({ x: 1, y: 70 }, [wide('t')]);
    expect(endpoint.elementId).toBe('t');
    expect(endpoint.at).toBeDefined();
  });

  it('keeps an attachment inside the box even when the aim is outside it', () => {
    // Snapping from just beyond the edge still has to name a fraction the
    // contract accepts, which is nothing outside 0..1.
    const snap = snapArrowPoint({ x: -6, y: -6 }, [wide('t')]);
    expect(snap?.at?.u).toBeGreaterThanOrEqual(0);
    expect(snap?.at?.v).toBeGreaterThanOrEqual(0);
  });
});

describe('finishing a placement', () => {
  const draft = (to: { x: number; y: number }) => ({
    from: { x: 0, y: 0 },
    to,
    route: 'straight' as const,
  });

  it('refuses a press that never travelled', () => {
    // This is what leaves the placement open for a second click instead of
    // dropping an arrow with both ends in one spot.
    expect(isArrowWorthPlacing(draft({ x: 2, y: 2 }))).toBe(false);
    expect(finishArrow(draft({ x: 2, y: 2 }))).toBeNull();
  });

  it('accepts one that did', () => {
    expect(isArrowWorthPlacing(draft({ x: 120, y: 40 }))).toBe(true);
  });

  it('accepts both ends on one element however close the two drops were', () => {
    // A self-loop is drawn around its element, so it has a length of its own
    // even when the pointer barely moved between the two presses.
    expect(
      isArrowWorthPlacing({
        from: { x: 0, y: 0, elementId: 'a' },
        to: { x: 1, y: 1, elementId: 'a' },
        route: 'straight',
      }),
    ).toBe(true);
  });

  it('mints an id, and carries the tool’s styling', () => {
    const arrow = finishArrow(draft({ x: 120, y: 40 }), {
      strokeColor: 'rose',
      strokeWidthPreset: 'thick',
      strokeStyle: 'dashed',
    });
    expect(arrow?.id).toMatch(/^arrow-/);
    expect(arrow?.strokeColor).toBe('rose');
    expect(arrow?.strokeStyle).toBe('dashed');
  });

  it('leaves a solid line unmarked, so the default is absent rather than stored', () => {
    const arrow = finishArrow(draft({ x: 120, y: 40 }), { strokeStyle: 'solid' });
    expect(arrow?.strokeStyle).toBeUndefined();
  });

  it('only records a route when it is not the default', () => {
    expect(draftArrow(draft({ x: 120, y: 40 })).route).toBeUndefined();
    expect(draftArrow({ ...draft({ x: 120, y: 40 }), route: 'elbow' }).route).toBe('elbow');
  });
});

describe('sliding an elbow’s middle leg', () => {
  const elbow = (to: { x: number; y: number }): ArrowElement => ({
    id: 'a1',
    from: { x: 100, y: 100 },
    to,
    route: 'elbow',
  });

  it('reads the pointer across the axis the route led with', () => {
    // A wide run turns at a shared x, so its middle leg is vertical and slides
    // sideways: only the pointer's x means anything.
    const bend = bendForPointer(elbow({ x: 500, y: 200 }), { x: 360, y: 999 });
    expect(bend).toBe(60);
  });

  it('reads the other axis on a tall run', () => {
    const bend = bendForPointer(elbow({ x: 160, y: 600 }), { x: 999, y: 400 });
    expect(bend).toBe(50);
  });

  it('moves the route by exactly what it reports', () => {
    const arrow = elbow({ x: 500, y: 200 });
    const bend = bendForPointer(arrow, { x: 360, y: 150 });
    const moved = arrowGeometry({ ...arrow, bend });
    expect(moved.points[1]?.x).toBe(360);
  });

  it('puts the handle on that leg', () => {
    expect(elbowHandlePoint(elbow({ x: 500, y: 200 }))).toEqual({ x: 300, y: 150 });
  });

  it('offers no handle on a straight arrow', () => {
    expect(elbowHandlePoint({ id: 'a1', from: { x: 0, y: 0 }, to: { x: 80, y: 0 } })).toBeNull();
  });

  it('leaves the bend alone when there is no elbow to slide', () => {
    const straight: ArrowElement = { id: 'a1', from: { x: 0, y: 0 }, to: { x: 80, y: 0 } };
    expect(bendForPointer(straight, { x: 40, y: 90 })).toBe(0);
  });
});
