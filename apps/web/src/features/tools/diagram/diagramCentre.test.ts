import {
  effectiveDiagramNodeSize,
  type ArrowElement,
  type DiagramNode,
  type PathElement,
} from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import type { StudioInkStroke } from '../studio/studioInk';
import {
  DIAGRAM_CANVAS_HEIGHT,
  DIAGRAM_CANVAS_WIDTH,
  centreStudioContent,
  diagramContentBounds,
  prepareDiagram,
} from './diagramModel';

const box = (id: string, x: number, y: number): DiagramNode => ({ id, label: id, x, y });

const stroke = (id: string, points: [number, number][]): StudioInkStroke =>
  ({ id, points: points.map(([x, y]) => ({ x, y })), strokeColor: 'ink' }) as StudioInkStroke;

describe('centreStudioContent', () => {
  // The case that prompted it: one shape, proposed, reopened in the corner.
  it('puts a single shape in the middle of the sheet', () => {
    const node = box('n1', 24, 24);
    const size = effectiveDiagramNodeSize(node);
    const centred = centreStudioContent({ nodes: [node] });

    expect(centred.nodes[0]).toMatchObject({
      x: Math.round((DIAGRAM_CANVAS_WIDTH - size.width) / 2),
      y: Math.round((DIAGRAM_CANVAS_HEIGHT - size.height) / 2),
    });
  });

  it('moves every kind of element together, so the layout is kept', () => {
    const path: PathElement = {
      id: 'p1',
      anchors: [
        { x: 30, y: 200 },
        { x: 130, y: 220 },
      ],
    };
    const freeArrow: ArrowElement = { id: 'a1', from: { x: 40, y: 260 }, to: { x: 200, y: 260 } };
    const content = {
      nodes: [box('n1', 24, 24), box('n2', 240, 24)],
      ink: [
        stroke('ink-1', [
          [50, 120],
          [90, 160],
        ]),
      ],
      paths: [path],
      arrows: [freeArrow],
    };

    const centred = centreStudioContent(content);
    const dx = centred.nodes[0]!.x - 24;
    const dy = centred.nodes[0]!.y - 24;

    expect(dx).toBeGreaterThan(0);
    expect(dy).toBeGreaterThan(0);
    expect(centred.nodes[1]).toMatchObject({ x: 240 + dx, y: 24 + dy });
    expect(centred.ink![0]!.points[0]).toEqual({ x: 50 + dx, y: 120 + dy });
    expect(centred.paths![0]!.anchors[1]).toMatchObject({ x: 130 + dx, y: 220 + dy });
    expect(centred.arrows![0]!.from).toMatchObject({ x: 40 + dx, y: 260 + dy });

    // And the whole of it is now centred on the sheet.
    const bounds = diagramContentBounds(
      centred.nodes,
      centred.ink!,
      centred.paths,
      [],
      centred.arrows,
    )!;
    expect(Math.abs(bounds.left - (DIAGRAM_CANVAS_WIDTH - bounds.right))).toBeLessThanOrEqual(1);
    expect(Math.abs(bounds.top - (DIAGRAM_CANVAS_HEIGHT - bounds.bottom))).toBeLessThanOrEqual(1);
  });

  // A bound end is drawn from its element; its stored point is a fallback that
  // must travel too, or detaching later would send the end back to the corner.
  it('moves the fallback point of a bound arrow end with everything else', () => {
    const bound: ArrowElement = {
      id: 'a1',
      from: { x: 30, y: 30, elementId: 'n1' },
      to: { x: 300, y: 100 },
    };
    const centred = centreStudioContent({ nodes: [box('n1', 24, 24)], arrows: [bound] });
    const dx = centred.nodes[0]!.x - 24;
    const dy = centred.nodes[0]!.y - 24;

    expect(centred.arrows![0]!.from).toEqual({ x: 30 + dx, y: 30 + dy, elementId: 'n1' });
  });

  it('leaves an empty canvas alone', () => {
    const empty = { nodes: [] };
    expect(centreStudioContent(empty)).toBe(empty);
  });

  // Centring only changes where the artwork sits while it is edited: proposing
  // tucks it back into the corner, so the card on the board is unchanged.
  it('proposes exactly the artifact it started from', () => {
    const original = {
      nodes: [box('n1', 24, 24), box('n2', 260, 90)],
      ink: [
        stroke('ink-1', [
          [40, 40],
          [120, 90],
        ]),
      ],
    };
    const centred = centreStudioContent(original);

    const before = prepareDiagram(original.nodes, [], original.ink);
    const after = prepareDiagram(centred.nodes, [], centred.ink);
    expect(before.ok && after.ok).toBe(true);
    if (before.ok && after.ok) expect(after.artifact).toEqual(before.artifact);
  });
});
