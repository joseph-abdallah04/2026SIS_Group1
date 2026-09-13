import { describe, expect, it } from 'vitest';
import type { ArrowAttach } from '@roundtable/shared';
import {
  ARROW_CAPS,
  arrowBounds,
  attachPointOn,
  arrowCapGeometry,
  arrowGeometry,
  arrowHitTest,
  nearestTOnRoute,
  offsetArrow,
  type ArrowElement,
  type ArrowTarget,
} from '@roundtable/shared';
import { diagramWriteArtifactSchema, diagramArtifactSchema } from '@roundtable/shared/schemas';

import { arrowTargetLookup } from './studioArrowTargets';

const arrow = (overrides: Partial<ArrowElement> = {}): ArrowElement => ({
  id: 'arrow-1',
  from: { x: 100, y: 100 },
  to: { x: 300, y: 100 },
  ...overrides,
});

type ArrowAttachPair = [ArrowAttach, ArrowAttach];

const box = (id: string, x: number, y: number, width = 80, height = 40): ArrowTarget => ({
  id,
  box: { x, y, width, height },
});

describe('arrow geometry', () => {
  it('runs between two free points', () => {
    const geometry = arrowGeometry(arrow());
    expect(geometry.points[0]).toEqual({ x: 100, y: 100 });
    expect(geometry.points.at(-1)).toEqual({ x: 300, y: 100 });
  });

  it('puts the label halfway along the route', () => {
    expect(arrowGeometry(arrow()).label).toEqual({ x: 200, y: 100 });
  });

  it('stops at the edge of a bound element rather than at its centre', () => {
    // A binding is the whole point of snapping: the arrow has to meet the
    // outline, or it disappears under the shape it is pointing at.
    const lookup = arrowTargetLookup({
      nodes: [{ id: 'node-1', label: '', x: 260, y: 80, shape: 'rectangle' }],
    });
    const geometry = arrowGeometry(arrow({ to: { x: 300, y: 100, elementId: 'node-1' } }), lookup);
    const end = geometry.points.at(-1)!;
    // On the left-hand face, where the line to the node's centre crosses it —
    // the same rule an edge already follows, so the two cannot look different.
    expect(end.x).toBeCloseTo(260, 0);
    expect(end.y).toBeGreaterThan(80);
    expect(end.y).toBeLessThan(140);
  });

  it('follows a bound element when it moves', () => {
    const bound = arrow({ to: { x: 300, y: 100, elementId: 'node-1' } });
    const before = arrowGeometry(bound, () => box('node-1', 260, 80));
    const after = arrowGeometry(bound, () => box('node-1', 500, 80));
    expect(after.points.at(-1)!.x).toBeGreaterThan(before.points.at(-1)!.x + 200);
  });

  it('falls back to its stored point when the element it named is gone', () => {
    // Deleting a shape must leave the arrow where it was drawn. Collapsing it
    // to the origin would lose work that has nothing to do with the deletion.
    const geometry = arrowGeometry(
      arrow({ to: { x: 300, y: 100, elementId: 'gone' } }),
      () => undefined,
    );
    expect(geometry.points.at(-1)).toEqual({ x: 300, y: 100 });
  });

  it('meets an ellipse on its curve, not on the box around it', () => {
    const lookup = arrowTargetLookup({
      nodes: [{ id: 'oval', label: '', x: 260, y: 60, shape: 'ellipse' }],
    });
    // Aimed at the corner of the bounding box: on an ellipse that point is
    // outside the outline, so the landing point must be pulled inwards.
    const geometry = arrowGeometry(
      arrow({ from: { x: 100, y: 0 }, to: { x: 300, y: 80, elementId: 'oval' } }),
      lookup,
    );
    const end = geometry.points.at(-1)!;
    expect(end.x).toBeGreaterThan(260);
    expect(end.y).toBeGreaterThan(60);
  });
});

describe('elbowed arrows', () => {
  it('turns a right angle between the two ends', () => {
    const geometry = arrowGeometry(arrow({ to: { x: 300, y: 220 }, route: 'elbow' }), undefined);
    expect(geometry.points).toHaveLength(4);
    // Horizontal first, because the run is wider than it is tall.
    expect(geometry.points[1]).toEqual({ x: 200, y: 100 });
    expect(geometry.points[2]).toEqual({ x: 200, y: 220 });
  });

  it('leads with the longer axis', () => {
    // A mostly-vertical arrow starting with a horizontal stub reads as a
    // mistake, so the first leg follows whichever axis has further to go.
    const geometry = arrowGeometry(arrow({ to: { x: 140, y: 400 }, route: 'elbow' }));
    expect(geometry.points[1]).toEqual({ x: 100, y: 250 });
  });

  it('slides the middle leg by the stored bend', () => {
    const geometry = arrowGeometry(arrow({ to: { x: 300, y: 220 }, route: 'elbow', bend: 40 }));
    expect(geometry.points[1]!.x).toBe(240);
    expect(geometry.points[2]!.x).toBe(240);
  });

  it('rounds its corners', () => {
    const geometry = arrowGeometry(arrow({ to: { x: 300, y: 220 }, route: 'elbow' }));
    // A quadratic per corner is what rounds it; a route of straight `L`
    // commands would be the square-cornered version.
    expect(geometry.d).toContain('Q');
  });

  it('leaves a bound element through the face it heads for', () => {
    // The first leg of this elbow runs right, so the arrow must leave through
    // the right-hand face — not through whichever face points at the far end.
    const geometry = arrowGeometry(
      arrow({
        from: { x: 100, y: 100, elementId: 'node-1' },
        to: { x: 400, y: 300 },
        route: 'elbow',
      }),
      () => box('node-1', 60, 80),
    );
    expect(geometry.points[0]!.x).toBeCloseTo(140, 0);
    expect(geometry.points[0]!.y).toBeCloseTo(100, 0);
  });
});

describe('attaching to a chosen point', () => {
  const solid = (id: string): ArrowTarget => ({
    id,
    box: { x: 100, y: 100, width: 200, height: 100 },
  });

  it('puts a fraction on the element’s outline', () => {
    // Halfway down the left edge.
    const { point } = attachPointOn(solid('t'), { u: 0, v: 0.5 });
    expect(point).toEqual({ x: 100, y: 150 });
  });

  it('holds that place when the element grows', () => {
    // A table gaining a row is the case this exists for: the arrow has to stay
    // on the left edge rather than jumping to wherever the centre ray now goes.
    const taller: ArrowTarget = { id: 't', box: { x: 100, y: 100, width: 200, height: 300 } };
    expect(attachPointOn(taller, { u: 0, v: 0.5 }).point).toEqual({ x: 100, y: 250 });
  });

  it('pushes a fraction out onto a shaped outline', () => {
    // On an ellipse the corner of the box is outside the shape, so the point
    // has to come back in to the curve.
    const oval: ArrowTarget = { ...solid('t'), shape: 'ellipse' };
    const { point } = attachPointOn(oval, { u: 0, v: 0 });
    expect(point.x).toBeGreaterThan(100);
    expect(point.y).toBeGreaterThan(100);
  });

  it('lands on a drawing rather than on the box around it', () => {
    // The box around a stroke is mostly empty. An arrow stopping at its edge
    // would point at blank canvas beside the line it meant.
    const ink: ArrowTarget = { ...solid('ink-1'), freeform: true };
    expect(attachPointOn(ink, { u: 0.5, v: 0.5 }).point).toEqual({ x: 200, y: 150 });
  });

  it('routes to the attachment instead of the face the far end is on', () => {
    const lookup = () => solid('t');
    const fromAbove: ArrowElement = {
      id: 'a1',
      from: { x: 200, y: 0 },
      to: { x: 200, y: 150, elementId: 't', at: { u: 0, v: 0.5 } },
    };
    // Coming from straight above, the centre ray would land on the top edge.
    expect(arrowGeometry(fromAbove, lookup).points.at(-1)).toEqual({ x: 100, y: 150 });
  });

  it('still aims at the centre when no attachment is named', () => {
    const lookup = () => solid('t');
    const plain: ArrowElement = {
      id: 'a1',
      from: { x: 200, y: 0 },
      to: { x: 200, y: 150, elementId: 't' },
    };
    expect(arrowGeometry(plain, lookup).points.at(-1)).toEqual({ x: 200, y: 100 });
  });
});

describe('an arrow that points at its own element', () => {
  const box: ArrowTarget = { id: 'n1', box: { x: 100, y: 100, width: 120, height: 60 } };
  const loop: ArrowElement = {
    id: 'a1',
    from: { x: 0, y: 0, elementId: 'n1' },
    to: { x: 0, y: 0, elementId: 'n1' },
    route: 'elbow',
  };

  it('goes around the element rather than across it', () => {
    const geometry = arrowGeometry(loop, () => box);
    // Every point is on or outside the element: a route drawn between two
    // points on one outline would otherwise cut through the thing it describes.
    for (const point of geometry.points) {
      const inside =
        point.x > box.box.x + 0.5 &&
        point.x < box.box.x + box.box.width - 0.5 &&
        point.y > box.box.y + 0.5 &&
        point.y < box.box.y + box.box.height - 0.5;
      expect(inside).toBe(false);
    }
  });

  it('leaves and returns on the element’s edge', () => {
    const geometry = arrowGeometry(loop, () => box);
    // Out of the top, round the ring, back in on the right.
    expect(geometry.points[0]).toEqual({ x: 190, y: 100 });
    expect(geometry.points.at(-1)).toEqual({ x: 220, y: 145 });
    expect(geometry.points.length).toBeGreaterThan(3);
  });

  it('stays square, so every leg runs along an axis', () => {
    // An elbowed loop is a square route around the element; a diagonal leg
    // would mean it had cut a corner, and corners are where it goes around.
    const geometry = arrowGeometry(loop, () => box);
    for (let index = 1; index < geometry.points.length; index += 1) {
      const a = geometry.points[index - 1]!;
      const b = geometry.points[index]!;
      expect(Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5).toBe(true);
    }
  });

  it('goes around even when its ends are on opposite faces', () => {
    // Stepping out from each face and joining the two would cut straight back
    // across the element. Walking the ring is what stops that.
    const across = arrowGeometry(
      {
        ...loop,
        from: { x: 0, y: 0, elementId: 'n1', at: { u: 0, v: 0.5 } },
        to: { x: 0, y: 0, elementId: 'n1', at: { u: 1, v: 0.5 } },
      },
      () => box,
    );
    for (const point of across.points) {
      const inside =
        point.x > box.box.x + 0.5 &&
        point.x < box.box.x + box.box.width - 0.5 &&
        point.y > box.box.y + 0.5 &&
        point.y < box.box.y + box.box.height - 0.5;
      expect(inside).toBe(false);
    }
  });

  it('leaves a straight self-arrow straight', () => {
    // Asked for straight, it stays the line between its two ends rather than
    // becoming a loop.
    const straight = arrowGeometry({ ...loop, route: 'straight' }, () => box);
    expect(straight.points).toHaveLength(2);
  });

  it('honours attachments when they are given', () => {
    const onTop = arrowGeometry(
      {
        ...loop,
        from: { x: 0, y: 0, elementId: 'n1', at: { u: 0.25, v: 0 } },
        to: { x: 0, y: 0, elementId: 'n1', at: { u: 0.75, v: 0 } },
      },
      () => box,
    );
    expect(onTop.points[0]).toEqual({ x: 130, y: 100 });
    expect(onTop.points.at(-1)).toEqual({ x: 190, y: 100 });
  });

  it('points its head back at the element', () => {
    const geometry = arrowGeometry(loop, () => box);
    // The route leaves rightwards, so the head at the end comes back leftwards.
    expect(Math.abs(geometry.end.angle)).toBeGreaterThan(Math.PI / 2);
  });

  it('draws without collapsing', () => {
    const geometry = arrowGeometry(loop, () => box);
    expect(geometry.d).not.toContain('NaN');
    expect(geometry.d.length).toBeGreaterThan(20);
  });
});

describe('an elbow meets what it is attached to square on', () => {
  const boxAt = (id: string, x: number, y: number): ArrowTarget => ({
    id,
    box: { x, y, width: 120, height: 60 },
  });

  /** The direction of a leg, as an axis, or null when it is not axis-aligned. */
  const axisOf = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    if (Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 0.5) return 'h';
    if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 0.5) return 'v';
    return null;
  };

  /** Which face of a box a point sits on. */
  const faceOf = (box: ArrowTarget['box'], p: { x: number; y: number }) => {
    const gaps = [
      ['left', Math.abs(p.x - box.x)],
      ['right', Math.abs(p.x - (box.x + box.width))],
      ['top', Math.abs(p.y - box.y)],
      ['bottom', Math.abs(p.y - (box.y + box.height))],
    ] as const;
    return gaps.reduce((best, current) => (current[1] < best[1] ? current : best))[0];
  };

  // A ring of positions for the far element: every direction, near and far.
  const places: [number, number][] = [
    [400, 0],
    [400, 200],
    [0, 300],
    [-400, 200],
    [-400, 0],
    [-400, -200],
    [0, -300],
    [400, -200],
    [200, 40],
    [-200, -40],
  ];

  it('leaves and arrives perpendicular to the face, wherever the far end is', () => {
    // The complaint this fixes: at some angles the first or last leg ran along
    // the very edge it was attached to, so the arrow grazed the element
    // instead of pointing at it.
    for (const [dx, dy] of places) {
      const from = boxAt('a', 0, 0);
      const to = boxAt('b', dx, dy);
      const geometry = arrowGeometry(
        {
          id: 'a1',
          from: { x: 0, y: 0, elementId: 'a' },
          to: { x: 0, y: 0, elementId: 'b' },
          route: 'elbow',
        },
        (id) => (id === 'a' ? from : to),
      );

      const points = geometry.points;
      const firstAxis = axisOf(points[0]!, points[1]!);
      const lastAxis = axisOf(points[points.length - 2]!, points[points.length - 1]!);
      const startFace = faceOf(from.box, points[0]!);
      const endFace = faceOf(to.box, points[points.length - 1]!);

      const wanted = (face: string) => (face === 'left' || face === 'right' ? 'h' : 'v');
      expect({ dx, dy, axis: firstAxis }).toEqual({ dx, dy, axis: wanted(startFace) });
      expect({ dx, dy, axis: lastAxis }).toEqual({ dx, dy, axis: wanted(endFace) });
    }
  });

  it('keeps every leg on an axis', () => {
    for (const [dx, dy] of places) {
      const geometry = arrowGeometry(
        {
          id: 'a1',
          from: { x: 0, y: 0, elementId: 'a' },
          to: { x: 0, y: 0, elementId: 'b' },
          route: 'elbow',
        },
        (id) => (id === 'a' ? boxAt('a', 0, 0) : boxAt('b', dx, dy)),
      );
      for (let index = 1; index < geometry.points.length; index += 1) {
        expect({
          dx,
          dy,
          axis: axisOf(geometry.points[index - 1]!, geometry.points[index]!),
        }).toEqual({ dx, dy, axis: expect.stringMatching(/^[hv]$/) });
      }
    }
  });
});

describe('an elbow goes around what it joins', () => {
  const boxAt = (id: string, x: number, y: number): ArrowTarget => ({
    id,
    box: { x, y, width: 120, height: 60 },
  });

  /** How many times the route changes axis. */
  const bendsIn = (points: readonly { x: number; y: number }[]) => {
    let bends = 0;
    for (let index = 2; index < points.length; index += 1) {
      const before = axisBetween(points[index - 2]!, points[index - 1]!);
      const after = axisBetween(points[index - 1]!, points[index]!);
      if (before && after && before !== after) bends += 1;
    }
    return bends;
  };

  const axisBetween = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.abs(a.y - b.y) < 0.5 ? 'h' : Math.abs(a.x - b.x) < 0.5 ? 'v' : null;

  /** Samples along every leg, so a leg passing over a box is caught too. */
  const crossings = (points: readonly { x: number; y: number }[], boxes: ArrowTarget[]) => {
    const hits: string[] = [];
    for (let index = 1; index < points.length; index += 1) {
      const a = points[index - 1]!;
      const b = points[index]!;
      for (let t = 0; t <= 1; t += 0.05) {
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        for (const box of boxes) {
          const inside =
            x > box.box.x + 0.5 &&
            x < box.box.x + box.box.width - 0.5 &&
            y > box.box.y + 0.5 &&
            y < box.box.y + box.box.height - 0.5;
          if (inside) hits.push(box.id);
        }
      }
    }
    return [...new Set(hits)];
  };

  const faces: ArrowAttach[] = [
    { u: 0, v: 0.5 },
    { u: 1, v: 0.5 },
    { u: 0.5, v: 0 },
    { u: 0.5, v: 1 },
  ];
  const places: [number, number][] = [
    [400, 0],
    [400, 220],
    [0, 300],
    [-400, 220],
    [-400, 0],
    [-400, -220],
    [0, -300],
    [400, -220],
    [220, 90],
  ];

  it('never cuts through either element, from any face to any face', () => {
    // The complaint this fixes: an end pinned to a face that points away from
    // the far element left along that face and then came straight back across
    // the element it had just left.
    for (const [dx, dy] of places) {
      const from = boxAt('a', 0, 0);
      const to = boxAt('b', dx, dy);
      for (const fromAt of faces) {
        for (const toAt of faces) {
          const geometry = arrowGeometry(
            {
              id: 'a1',
              from: { x: 0, y: 0, elementId: 'a', at: fromAt },
              to: { x: 0, y: 0, elementId: 'b', at: toAt },
              route: 'elbow',
            },
            (id) => (id === 'a' ? from : to),
          );
          expect({ dx, dy, fromAt, toAt, through: crossings(geometry.points, [from, to]) }).toEqual(
            {
              dx,
              dy,
              fromAt,
              toAt,
              through: [],
            },
          );
        }
      }
    }
  });

  it('still leaves and arrives along the face it is pinned to', () => {
    // Going around must not cost the thing that made it readable.
    const from = boxAt('a', 0, 0);
    const to = boxAt('b', 400, 220);
    const geometry = arrowGeometry(
      {
        id: 'a1',
        from: { x: 0, y: 0, elementId: 'a', at: { u: 0, v: 0.5 } },
        to: { x: 0, y: 0, elementId: 'b', at: { u: 1, v: 0.5 } },
        route: 'elbow',
      },
      (id) => (id === 'a' ? from : to),
    );
    const points = geometry.points;
    // Pinned to the left face of A, so it must set off leftwards.
    expect(points[1]!.x).toBeLessThan(points[0]!.x);
    expect(points[1]!.y).toBeCloseTo(points[0]!.y, 5);
    // Pinned to the right face of B, so it must arrive from the right.
    expect(points[points.length - 2]!.x).toBeGreaterThan(points[points.length - 1]!.x);
  });

  it('keeps every leg on an axis while going around', () => {
    const from = boxAt('a', 0, 0);
    const to = boxAt('b', 300, 0);
    const geometry = arrowGeometry(
      {
        id: 'a1',
        from: { x: 0, y: 0, elementId: 'a', at: { u: 0, v: 0.5 } },
        to: { x: 0, y: 0, elementId: 'b', at: { u: 1, v: 0.5 } },
        route: 'elbow',
      },
      (id) => (id === 'a' ? from : to),
    );
    for (let index = 1; index < geometry.points.length; index += 1) {
      const a = geometry.points[index - 1]!;
      const b = geometry.points[index]!;
      expect(Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5).toBe(true);
    }
  });

  it('takes the plain route when nothing is in the way', () => {
    // Going around is for when it is needed. Two faces looking at each other
    // across open canvas should still be a couple of turns, not a detour.
    const from = boxAt('a', 0, 0);
    const to = boxAt('b', 400, 220);
    const geometry = arrowGeometry(
      {
        id: 'a1',
        from: { x: 0, y: 0, elementId: 'a', at: { u: 1, v: 0.5 } },
        to: { x: 0, y: 0, elementId: 'b', at: { u: 0, v: 0.5 } },
        route: 'elbow',
      },
      (id) => (id === 'a' ? from : to),
    );
    expect(bendsIn(geometry.points)).toBeLessThanOrEqual(2);
  });

  it('spends a bend rather than a long way round', () => {
    // Pinned to faces that both point away, it has to go around — but it is
    // still the cheapest way around rather than a tour of the canvas.
    const from = boxAt('a', 0, 0);
    const to = boxAt('b', 300, 0);
    const geometry = arrowGeometry(
      {
        id: 'a1',
        from: { x: 0, y: 0, elementId: 'a', at: { u: 0, v: 0.5 } },
        to: { x: 0, y: 0, elementId: 'b', at: { u: 1, v: 0.5 } },
        route: 'elbow',
      },
      (id) => (id === 'a' ? from : to),
    );
    expect(bendsIn(geometry.points)).toBeLessThanOrEqual(4);
  });
});

describe('a loop stays outside its element', () => {
  const box: ArrowTarget = { id: 'n1', box: { x: 100, y: 100, width: 120, height: 60 } };
  const faces: ArrowAttachPair[] = [
    [
      { u: 0, v: 0.5 },
      { u: 1, v: 0.5 },
    ],
    [
      { u: 0.5, v: 0 },
      { u: 0.5, v: 1 },
    ],
    [
      { u: 0, v: 0.2 },
      { u: 0.5, v: 1 },
    ],
    [
      { u: 1, v: 0.8 },
      { u: 0.2, v: 0 },
    ],
    [
      { u: 0.5, v: 1 },
      { u: 0, v: 0.9 },
    ],
    [
      { u: 0.9, v: 0 },
      { u: 1, v: 0.1 },
    ],
  ];

  it('never crosses the element, from any pair of faces', () => {
    for (const [fromAt, toAt] of faces) {
      const geometry = arrowGeometry(
        {
          id: 'a1',
          from: { x: 0, y: 0, elementId: 'n1', at: fromAt },
          to: { x: 0, y: 0, elementId: 'n1', at: toAt },
          route: 'elbow',
        },
        () => box,
      );
      // Sample along every leg, not just the corners: a leg that passes over
      // the element has both its ends outside it.
      for (let index = 1; index < geometry.points.length; index += 1) {
        const a = geometry.points[index - 1]!;
        const b = geometry.points[index]!;
        for (let t = 0; t <= 1; t += 0.1) {
          const x = a.x + (b.x - a.x) * t;
          const y = a.y + (b.y - a.y) * t;
          const inside =
            x > box.box.x + 0.5 &&
            x < box.box.x + box.box.width - 0.5 &&
            y > box.box.y + 0.5 &&
            y < box.box.y + box.box.height - 0.5;
          expect({ fromAt, toAt, inside }).toEqual({ fromAt, toAt, inside: false });
        }
      }
    }
  });
});

describe('arrow caps', () => {
  it('defaults to a bare tail and an open head', () => {
    const geometry = arrowGeometry(arrow());
    expect(geometry.start.cap).toBe('none');
    expect(geometry.start.d).toBe('');
    expect(geometry.end.cap).toBe('line');
    expect(geometry.end.d).not.toBe('');
  });

  it('draws every cap in the set', () => {
    for (const cap of ARROW_CAPS) {
      const geometry = arrowCapGeometry(cap, { x: 10, y: 10 }, 0, 3);
      expect(geometry.cap).toBe(cap);
      if (cap !== 'none') expect(geometry.d.length).toBeGreaterThan(0);
    }
  });

  it('closes the shapes that enclose an area and leaves the pen strokes open', () => {
    const closed = (cap: Parameters<typeof arrowCapGeometry>[0]) =>
      arrowCapGeometry(cap, { x: 0, y: 0 }, 0, 3).closed;
    expect(closed('triangle')).toBe(true);
    expect(closed('diamondHollow')).toBe(true);
    expect(closed('circle')).toBe(true);
    // These two are drawn, not filled: a hollow fill on them would paint a
    // wedge of canvas colour over whatever the arrow crosses.
    expect(closed('line')).toBe(false);
    expect(closed('bar')).toBe(false);
  });

  it('marks the hollow variants as unfilled', () => {
    const filled = (cap: Parameters<typeof arrowCapGeometry>[0]) =>
      arrowCapGeometry(cap, { x: 0, y: 0 }, 0, 3).filled;
    expect(filled('triangle')).toBe(true);
    expect(filled('triangleHollow')).toBe(false);
    expect(filled('diamond')).toBe(true);
    expect(filled('diamondHollow')).toBe(false);
    expect(filled('circle')).toBe(true);
    expect(filled('circleHollow')).toBe(false);
  });

  it('stops the line short of a cap that would show it through', () => {
    // A hollow head with the line running to the tip has a stripe across it.
    const solid = arrowGeometry(arrow({ endCap: 'triangleHollow' }));
    expect(solid.end.inset).toBeGreaterThan(0);
    const lastPoint = Number(solid.d.split(' ').at(-2));
    expect(lastPoint).toBeLessThan(300);
  });

  it('points a cap back down the leg it sits on', () => {
    const geometry = arrowGeometry(arrow({ startCap: 'triangle' }));
    // The arrow runs left to right, so the tail cap faces left: pi radians.
    expect(Math.abs(geometry.start.angle)).toBeCloseTo(Math.PI, 5);
    expect(geometry.end.angle).toBeCloseTo(0, 5);
  });

  it('grows the cap with the line but not in step with it', () => {
    const thin = arrowCapGeometry('triangle', { x: 0, y: 0 }, 0, 1);
    const thick = arrowCapGeometry('triangle', { x: 0, y: 0 }, 0, 6);
    expect(thick.inset).toBeGreaterThan(thin.inset);
    expect(thick.inset).toBeLessThan(thin.inset * 6);
  });

  it('keeps a very short arrow drawable', () => {
    // Two caps whose insets exceed the whole line would invert it.
    const geometry = arrowGeometry(
      arrow({ to: { x: 104, y: 100 }, startCap: 'diamond', endCap: 'diamond' }),
    );
    expect(geometry.d).not.toContain('NaN');
    expect(geometry.points).toHaveLength(2);
  });
});

describe('where a label sits on the line', () => {
  const straight: ArrowElement = {
    id: 'a1',
    from: { x: 0, y: 100 },
    to: { x: 200, y: 100 },
    label: 'calls',
  };

  it('sits halfway along by default', () => {
    expect(arrowGeometry(straight).label).toEqual({ x: 100, y: 100 });
  });

  it('moves along the line with labelT', () => {
    expect(arrowGeometry({ ...straight, labelT: 0.25 }).label.x).toBe(50);
    expect(arrowGeometry({ ...straight, labelT: 1 }).label.x).toBe(200);
  });

  it('steps off the line when it is given a side', () => {
    const above = arrowGeometry({ ...straight, labelSide: 'above' }).label;
    const below = arrowGeometry({ ...straight, labelSide: 'below' }).label;
    expect(above.y).toBeLessThan(100);
    expect(below.y).toBeGreaterThan(100);
    expect(above.x).toBe(100);
  });

  it('steps sideways on a leg that runs vertically', () => {
    // The text does not rotate with the line, so "above" has to mean the
    // reader's above: beside a vertical leg rather than along it.
    const vertical: ArrowElement = {
      ...straight,
      from: { x: 100, y: 0 },
      to: { x: 100, y: 200 },
      labelSide: 'above',
    };
    const label = arrowGeometry(vertical).label;
    expect(label.x).toBeLessThan(100);
    expect(label.y).toBe(100);
  });

  it('keeps its place on the route rather than in space', () => {
    // A fraction, so re-routing the arrow carries the label with it instead of
    // leaving it behind where the line used to be.
    const longer = arrowGeometry({ ...straight, to: { x: 400, y: 100 }, labelT: 0.25 }).label;
    expect(longer.x).toBe(100);
  });

  it('reads a point back as the fraction along the route', () => {
    const geometry = arrowGeometry(straight);
    expect(nearestTOnRoute(geometry.points, { x: 150, y: 130 })).toBeCloseTo(0.75, 5);
    // Off either end, it clamps rather than running past the line.
    expect(nearestTOnRoute(geometry.points, { x: -80, y: 100 })).toBe(0);
    expect(nearestTOnRoute(geometry.points, { x: 900, y: 100 })).toBe(1);
  });

  it('follows the corner of an elbow rather than cutting across it', () => {
    const elbow = arrowGeometry({ ...straight, to: { x: 200, y: 300 }, route: 'elbow' });
    const t = nearestTOnRoute(elbow.points, elbow.points[1]!);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(1);
  });
});

describe('picking an arrow up', () => {
  it('measures the box around the whole route', () => {
    const geometry = arrowGeometry(arrow({ to: { x: 300, y: 220 }, route: 'elbow' }));
    expect(arrowBounds(geometry.points)).toEqual({ x: 100, y: 100, width: 200, height: 120 });
  });

  it('is hit near the line and missed away from it', () => {
    const geometry = arrowGeometry(arrow());
    expect(arrowHitTest({ x: 200, y: 104 }, geometry.points, 6)).toBe(true);
    expect(arrowHitTest({ x: 200, y: 140 }, geometry.points, 6)).toBe(false);
  });

  it('is hit along an elbow leg, not just near its ends', () => {
    const geometry = arrowGeometry(arrow({ to: { x: 300, y: 220 }, route: 'elbow' }));
    expect(arrowHitTest({ x: 200, y: 180 }, geometry.points, 6)).toBe(true);
  });

  it('carries both stored points when moved', () => {
    const moved = offsetArrow(arrow({ to: { x: 300, y: 100, elementId: 'node-1' } }), 10, -5);
    expect(moved.from).toEqual({ x: 110, y: 95 });
    // The binding survives the move: only the fallback point shifted.
    expect(moved.to).toEqual({ x: 310, y: 95, elementId: 'node-1' });
  });
});

const artifact = (arrows: unknown) => ({
  type: 'diagram',
  nodes: [{ id: 'node-1', label: 'A', x: 10, y: 10 }],
  edges: [],
  arrows,
});

describe('the arrow write path', () => {
  it('accepts an arrow bound to an element the diagram contains', () => {
    const parsed = diagramWriteArtifactSchema.safeParse(
      artifact([{ id: 'a1', from: { x: 0, y: 0 }, to: { x: 50, y: 50, elementId: 'node-1' } }]),
    );
    expect(parsed.success).toBe(true);
  });

  it('refuses a binding to an element that is not there', () => {
    const parsed = diagramWriteArtifactSchema.safeParse(
      artifact([{ id: 'a1', from: { x: 0, y: 0 }, to: { x: 50, y: 50, elementId: 'ghost' } }]),
    );
    expect(parsed.success).toBe(false);
  });

  it('refuses an arrow bound to another arrow', () => {
    // Two arrows bound to each other would each need the other resolved first.
    const parsed = diagramWriteArtifactSchema.safeParse(
      artifact([
        { id: 'a1', from: { x: 0, y: 0 }, to: { x: 50, y: 50 } },
        { id: 'a2', from: { x: 0, y: 0 }, to: { x: 50, y: 50, elementId: 'a1' } },
      ]),
    );
    expect(parsed.success).toBe(false);
  });

  it('accepts both ends on the same element, which is a self-loop', () => {
    const parsed = diagramWriteArtifactSchema.safeParse(
      artifact([
        {
          id: 'a1',
          from: { x: 0, y: 0, elementId: 'node-1' },
          to: { x: 50, y: 50, elementId: 'node-1' },
        },
      ]),
    );
    expect(parsed.success).toBe(true);
  });

  it('accepts an attachment inside the element’s box', () => {
    const parsed = diagramWriteArtifactSchema.safeParse(
      artifact([
        {
          id: 'a1',
          from: { x: 0, y: 0 },
          to: { x: 50, y: 50, elementId: 'node-1', at: { u: 0, v: 0.75 } },
        },
      ]),
    );
    expect(parsed.success).toBe(true);
  });

  it('accepts a label placed along the line and to one side', () => {
    const parsed = diagramWriteArtifactSchema.safeParse(
      artifact([
        {
          id: 'a1',
          from: { x: 0, y: 0 },
          to: { x: 50, y: 50 },
          label: 'calls',
          labelT: 0.25,
          labelSide: 'above',
        },
      ]),
    );
    expect(parsed.success).toBe(true);
  });

  it('refuses a label placed off the end of its own line', () => {
    const parsed = diagramWriteArtifactSchema.safeParse(
      artifact([{ id: 'a1', from: { x: 0, y: 0 }, to: { x: 50, y: 50 }, labelT: 1.4 }]),
    );
    expect(parsed.success).toBe(false);
  });

  it('refuses an attachment outside it', () => {
    // A fraction past the box would put the arrow somewhere the element is not.
    const parsed = diagramWriteArtifactSchema.safeParse(
      artifact([
        {
          id: 'a1',
          from: { x: 0, y: 0 },
          to: { x: 50, y: 50, elementId: 'node-1', at: { u: 1.4, v: 0 } },
        },
      ]),
    );
    expect(parsed.success).toBe(false);
  });

  it('refuses an id another element already uses', () => {
    const parsed = diagramWriteArtifactSchema.safeParse(
      artifact([{ id: 'node-1', from: { x: 0, y: 0 }, to: { x: 50, y: 50 } }]),
    );
    expect(parsed.success).toBe(false);
  });

  it('refuses a bend on a straight arrow', () => {
    const parsed = diagramWriteArtifactSchema.safeParse(
      artifact([{ id: 'a1', from: { x: 0, y: 0 }, to: { x: 50, y: 50 }, bend: 20 }]),
    );
    expect(parsed.success).toBe(false);
  });

  it('accepts a bend on an elbowed one', () => {
    const parsed = diagramWriteArtifactSchema.safeParse(
      artifact([
        { id: 'a1', from: { x: 0, y: 0 }, to: { x: 50, y: 50 }, route: 'elbow', bend: 20 },
      ]),
    );
    expect(parsed.success).toBe(true);
  });

  it('refuses a cap this build does not know', () => {
    const parsed = diagramWriteArtifactSchema.safeParse(
      artifact([{ id: 'a1', from: { x: 0, y: 0 }, to: { x: 50, y: 50 }, endCap: 'crowsfoot' }]),
    );
    expect(parsed.success).toBe(false);
  });

  it('lets the paint order name an arrow', () => {
    const parsed = diagramWriteArtifactSchema.safeParse({
      ...artifact([{ id: 'a1', from: { x: 0, y: 0 }, to: { x: 50, y: 50 } }]),
      z: ['a1', 'node-1'],
    });
    expect(parsed.success).toBe(true);
  });
});

describe('the arrow read path', () => {
  it('keeps an arrow whose cap this build does not recognise', () => {
    // The lenient read is what stops a future build's diagram taking the board
    // down: the arrow loads with the default cap rather than vanishing.
    const parsed = diagramArtifactSchema.safeParse(
      artifact([{ id: 'a1', from: { x: 0, y: 0 }, to: { x: 50, y: 50 }, endCap: 'crowsfoot' }]),
    );
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.arrows?.[0]?.endCap).toBeUndefined();
  });

  it('leaves a pre-v4.2 diagram without arrows', () => {
    const parsed = diagramArtifactSchema.safeParse({
      type: 'diagram',
      nodes: [{ id: 'n', label: 'A', x: 0, y: 0 }],
      edges: [],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.arrows).toBeUndefined();
  });
});
