import { effectiveDiagramNodeSize, type ArrowElement, type DiagramNode } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import {
  groupFrame,
  groupMustScaleUniformly,
  scaleGroup,
  type GroupScene,
} from './studioGroupScale';
import type { StudioInkStroke } from './studioInk';
import { EMPTY_STUDIO_SELECTION, type StudioSelection } from './studioSelection';
import { createTable, scaleTable, tableScaleLimits } from './studioTables';

const left: DiagramNode = { id: 'a', label: 'A', x: 100, y: 100, shape: 'box' };
const right: DiagramNode = { id: 'b', label: 'B', x: 300, y: 200, shape: 'box' };
const pair: GroupScene = { nodes: [left, right], edges: [] };
const both: StudioSelection = { ...EMPTY_STUDIO_SELECTION, nodeIds: ['a', 'b'] };
// Two 120 x 56 boxes: the frame runs from (100, 100) to (420, 256).
const frame = { x: 100, y: 100, width: 320, height: 156 };

function node(scene: GroupScene, id: string) {
  const found = scene.nodes.find((candidate) => candidate.id === id)!;
  return { ...found, ...effectiveDiagramNodeSize(found) };
}

describe('a group frame', () => {
  it('surrounds everything selected', () => {
    expect(groupFrame(pair, both)).toEqual(frame);
  });

  it('is nothing when nothing is selected', () => {
    expect(groupFrame(pair, EMPTY_STUDIO_SELECTION)).toBeNull();
  });
});

describe('scaling a group', () => {
  it('stretches one axis from an edge, moving each member with the frame', () => {
    const scaled = scaleGroup(pair, both, 'e', frame, { x: 320, y: 0 });
    // Twice as wide about the left edge; heights and rows unchanged.
    expect(node(scaled, 'a')).toMatchObject({ x: 100, y: 100, width: 240, height: 56 });
    expect(node(scaled, 'b')).toMatchObject({ x: 500, y: 200, width: 240, height: 56 });
  });

  it('keeps the proportions with Shift', () => {
    const scaled = scaleGroup(pair, both, 'e', frame, { x: 160, y: 0 }, { lockAspect: true });
    // 1.5x on both axes, about the middle of the left edge (178).
    expect(node(scaled, 'a')).toMatchObject({ width: 180, height: 84 });
    expect(node(scaled, 'b').width).toBe(180);
  });

  it('scales about the centre with Alt', () => {
    const scaled = scaleGroup(pair, both, 'se', frame, { x: 80, y: 39 }, { fromCentre: true });
    const after = groupFrame(scaled, both)!;
    // Half as big again, and the centre (260, 178) has not moved.
    expect(after.x + after.width / 2).toBeCloseTo(260, 0);
    expect(after.y + after.height / 2).toBeCloseTo(178, 0);
    expect(after.width).toBeCloseTo(480, 0);
  });

  it('stops shrinking when the smallest member reaches its minimum', () => {
    const scaled = scaleGroup(pair, both, 'se', frame, { x: -1_000, y: -1_000 });
    expect(node(scaled, 'a').width).toBeGreaterThanOrEqual(56);
    expect(node(scaled, 'a').height).toBeGreaterThanOrEqual(32);
  });

  it('stops growing at the edge of the sheet', () => {
    const scaled = scaleGroup(pair, both, 'se', frame, { x: 5_000, y: 5_000 });
    const after = groupFrame(scaled, both)!;
    expect(after.x + after.width).toBeLessThanOrEqual(961);
    expect(after.y + after.height).toBeLessThanOrEqual(601);
  });

  it('never scales a font or a text box taller than its text', () => {
    const text: DiagramNode = {
      id: 't',
      label: 'The quick brown fox jumps',
      x: 100,
      y: 300,
      shape: 'text',
      width: 144,
      height: 56,
      fontSizePreset: 'medium',
    };
    const scene: GroupScene = { nodes: [left, text], edges: [] };
    const selection = { ...EMPTY_STUDIO_SELECTION, nodeIds: ['a', 't'] };
    const box = groupFrame(scene, selection)!;
    const scaled = scaleGroup(scene, selection, 'e', box, { x: box.width, y: 0 });
    // Twice as wide is room for one line, so the box is one line tall.
    expect(node(scaled, 't')).toMatchObject({ width: 288, height: 36, fontSizePreset: 'medium' });
  });

  it('carries the contents of a selected container with it', () => {
    const container: DiagramNode = {
      id: 'c',
      label: 'Group',
      x: 100,
      y: 100,
      shape: 'container',
      width: 200,
      height: 160,
    };
    const child: DiagramNode = { id: 'k', label: 'K', x: 140, y: 140, shape: 'box', parentId: 'c' };
    const scene: GroupScene = { nodes: [container, child, right], edges: [] };
    const selection = { ...EMPTY_STUDIO_SELECTION, nodeIds: ['c', 'b'] };
    const box = groupFrame(scene, selection)!;
    const scaled = scaleGroup(scene, selection, 'se', box, { x: box.width, y: box.height });
    // The child is not selected, but it scales and moves with its container.
    expect(node(scaled, 'k').width).toBe(240);
    expect(node(scaled, 'k').x).toBeGreaterThan(child.x);
  });
});

describe('what forces a group to scale uniformly', () => {
  const stroke: StudioInkStroke = {
    id: 'ink',
    points: [
      { x: 500, y: 100 },
      { x: 600, y: 150 },
    ],
  };

  it('is a drawing or a turned element in it', () => {
    expect(groupMustScaleUniformly(pair, both)).toBe(false);
    expect(groupMustScaleUniformly({ ...pair, ink: [stroke] }, { ...both, inkIds: ['ink'] })).toBe(
      true,
    );
    expect(
      groupMustScaleUniformly({ nodes: [{ ...left, rotation: 30 }, right], edges: [] }, both),
    ).toBe(true);
  });

  it('scales a drawing and a shape together without stretching either', () => {
    const scene: GroupScene = { nodes: [left], edges: [], ink: [stroke] };
    const selection = { ...EMPTY_STUDIO_SELECTION, nodeIds: ['a'], inkIds: ['ink'] };
    const box = groupFrame(scene, selection)!;
    // Pulled half as far again along the right edge alone.
    const scaled = scaleGroup(scene, selection, 'e', box, { x: box.width / 2, y: 0 });
    const [ink] = scaled.ink!;
    const xs = ink!.points.map((point) => point.x);
    const ys = ink!.points.map((point) => point.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(150, 0);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(75, 0);
    expect(node(scaled, 'a')).toMatchObject({ width: 180, height: 84 });
  });

  it('keeps a turned drawing turned about the same point of itself', () => {
    const turned: StudioInkStroke = { ...stroke, rotation: 45 };
    const scene: GroupScene = { nodes: [left], edges: [], ink: [turned] };
    const selection = { ...EMPTY_STUDIO_SELECTION, nodeIds: ['a'], inkIds: ['ink'] };
    const box = groupFrame(scene, selection)!;
    const scaled = scaleGroup(scene, selection, 'se', box, { x: 100, y: 100 });
    expect(scaled.ink![0]!.rotation).toBe(45);
  });
});

describe('arrows in a scaled group', () => {
  const bound: ArrowElement = {
    id: 'joined',
    from: { x: 160, y: 128, elementId: 'a' },
    to: { x: 360, y: 228, elementId: 'b' },
  };
  const loose: ArrowElement = {
    id: 'loose',
    from: { x: 100, y: 300 },
    to: { x: 300, y: 300 },
    route: 'elbow',
    bend: 20,
  };

  it('keeps a bound arrow bound, and moves a selected free end with the group', () => {
    const scene: GroupScene = { ...pair, arrows: [bound, loose] };
    const selection = { ...both, arrowIds: ['joined', 'loose'] };
    const box = groupFrame(scene, selection)!;
    const scaled = scaleGroup(scene, selection, 'e', box, { x: box.width, y: 0 });
    const [joined, free] = scaled.arrows!;
    expect(joined!.from.elementId).toBe('a');
    expect(joined!.to.elementId).toBe('b');
    // Twice as wide about the frame's left edge: the free end at 300 goes to 500.
    expect(free!.to.x).toBeCloseTo(box.x + (300 - box.x) * 2, 0);
    // A mostly horizontal elbow's bend runs along x, so it doubles too.
    expect(free!.bend).toBe(40);
  });

  it("scales a bound elbow's bend along the leg it actually slides", () => {
    // B sits below A, so the route sets off downwards and its middle leg is
    // horizontal, sliding up and down. The stored ends are stale fallbacks that
    // run sideways; reading the axis from them doubled the bend on a stretch
    // that never touched y.
    const top: DiagramNode = { id: 'top', label: 'T', x: 100, y: 100, shape: 'box' };
    const bottom: DiagramNode = { id: 'bottom', label: 'B', x: 140, y: 400, shape: 'box' };
    const elbow: ArrowElement = {
      id: 'e',
      from: { x: 0, y: 0, elementId: 'top' },
      to: { x: 500, y: 10, elementId: 'bottom' },
      route: 'elbow',
      bend: 30,
    };
    const scene: GroupScene = { nodes: [top, bottom], edges: [], arrows: [elbow] };
    const selection = { ...EMPTY_STUDIO_SELECTION, nodeIds: ['top', 'bottom'], arrowIds: ['e'] };
    const box = groupFrame(scene, selection)!;
    const scaled = scaleGroup(scene, selection, 'e', box, { x: box.width, y: 0 });
    expect(scaled.arrows![0]!.bend).toBe(30);
  });

  it('leaves an arrow that is not selected alone', () => {
    const scene: GroupScene = { ...pair, arrows: [loose] };
    const scaled = scaleGroup(scene, both, 'e', frame, { x: 320, y: 0 });
    expect(scaled.arrows![0]).toEqual(loose);
  });
});

describe('scaling a table', () => {
  const table = createTable(2, 3, { x: 0, y: 0 });

  it('scales every column and every row by the same factor', () => {
    const scaled = scaleTable(table, 1.5, 2);
    expect(scaled.colWidths).toEqual([144, 144, 144]);
    expect(scaled.rowHeights).toEqual([64, 64]);
  });

  it('stops where the narrowest or widest track hits its limit, keeping proportions', () => {
    const uneven = { ...table, colWidths: [40, 80, 200] };
    const limits = tableScaleLimits(uneven);
    // The 40 column is already at the minimum; the 200 one reaches 400 at 2x.
    expect(limits.minX).toBe(1);
    expect(limits.maxX).toBe(2);
    expect(scaleTable(uneven, 5, 1).colWidths).toEqual([80, 160, 400]);
    expect(scaleTable(uneven, 0.1, 1).colWidths).toEqual([40, 80, 200]);
  });

  it('moves a table with the group, growing about its own centre', () => {
    const placed = { ...createTable(2, 2, { x: 500, y: 100 }), id: 'tbl' };
    const scene: GroupScene = { nodes: [left], edges: [], tables: [placed] };
    const selection = { ...EMPTY_STUDIO_SELECTION, nodeIds: ['a'], tableIds: ['tbl'] };
    const box = groupFrame(scene, selection)!;
    // A quarter wider, which keeps the far edge on the sheet.
    const scaled = scaleGroup(scene, selection, 'e', box, { x: box.width / 4, y: 0 });
    const [grown] = scaled.tables!;
    expect(grown!.colWidths).toEqual([120, 120]);
    expect(grown!.rowHeights).toEqual(placed.rowHeights);
  });
});
