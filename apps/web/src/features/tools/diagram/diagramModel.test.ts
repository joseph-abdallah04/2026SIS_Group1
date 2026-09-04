import type { DiagramNode } from '@roundtable/shared';
import { diagramNodeSchema } from '@roundtable/shared/schemas';
import { describe, expect, it } from 'vitest';

import { DIAGRAM_NODE_LIMIT } from '../artifactLimits';
import {
  DIAGRAM_CANVAS_HEIGHT,
  DIAGRAM_CANVAS_WIDTH,
  DIAGRAM_LABEL_LIMIT,
  DIAGRAM_NODE_HEIGHT,
  DIAGRAM_NODE_WIDTH,
  DIAGRAM_GRID,
  addNode,
  clampNodesInsideContainer,
  clearEdgeStyle,
  clearNodeSize,
  clearNodeStyle,
  containerAtPoint,
  deleteContainerWithContents,
  draggedSelectionRoots,
  alignNodes,
  autoLayoutNodes,
  clientPointToDiagramPoint,
  copyDiagramFragment,
  createNodeId,
  deleteNode,
  deleteNodeWithEdges,
  deleteNodesWithEdges,
  distributeNodes,
  moveNode,
  moveNodesBy,
  nodeIdsInRect,
  normalizeRect,
  pasteDiagramFragment,
  prepareDiagram,
  prepareNodeLabel,
  renameNode,
  reparentNodes,
  resizeNode,
  snapNodePosition,
  styleEdge,
  styleNodes,
  ungroupContainer,
} from './diagramModel';

function buildNodes(count: number): DiagramNode[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `n${index + 1}`,
    label: `Node ${index + 1}`,
    x: 0,
    y: 0,
    shape: 'box' as const,
  }));
}

describe('diagram contract', () => {
  it('accepts and preserves the shape field the editor emits', () => {
    const parsed = diagramNodeSchema.safeParse({
      id: 'n1',
      label: 'Auth',
      x: 24,
      y: 24,
      shape: 'container',
    });

    expect(parsed.success && parsed.data.shape).toBe('container');
  });

  it('still accepts diagrams authored before shapes existed', () => {
    const parsed = diagramNodeSchema.safeParse({ id: 'n1', label: 'Idea', x: 0, y: 0 });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.shape).toBeUndefined();
  });

  it('strips unknown node fields', () => {
    const parsed = diagramNodeSchema.parse({
      id: 'n1',
      label: 'Idea',
      x: 0,
      y: 0,
      colour: 'gold',
    });

    expect(parsed).not.toHaveProperty('colour');
  });
});

describe('diagram node model', () => {
  it('creates ids that never collide with an inherited diagram', () => {
    const inherited: DiagramNode[] = [{ id: 'n1', label: 'Kept', x: 0, y: 0 }];
    const id = createNodeId(inherited);

    expect(id).not.toBe('n1');
    expect(inherited.some((node) => node.id === id)).toBe(false);
  });

  it('places each new node in a free slot rather than stacking', () => {
    const first = addNode([], 'box');
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = addNode(first.nodes, 'container');
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const [nodeOne, nodeTwo] = second.nodes;
    expect(nodeOne && nodeTwo && (nodeOne.x !== nodeTwo.x || nodeOne.y !== nodeTwo.y)).toBe(true);
  });

  it('refuses to exceed the shared node cap', () => {
    expect(addNode(buildNodes(DIAGRAM_NODE_LIMIT), 'box')).toEqual({
      ok: false,
      error: `A diagram can hold ${DIAGRAM_NODE_LIMIT} elements at most.`,
    });
  });

  it('snaps and clamps a node dragged outside the canvas', () => {
    expect(snapNodePosition({ x: -40, y: 5_000 })).toEqual({
      x: 0,
      y: DIAGRAM_CANVAS_HEIGHT - DIAGRAM_NODE_HEIGHT,
    });
    expect(snapNodePosition({ x: 101, y: 99 })).toEqual({ x: 104, y: 96 });
    expect(snapNodePosition({ x: DIAGRAM_CANVAS_WIDTH + 10, y: 0 }).x).toBe(
      DIAGRAM_CANVAS_WIDTH - DIAGRAM_NODE_WIDTH,
    );
  });

  it('moves only the targeted node', () => {
    const nodes = buildNodes(2);
    const moved = moveNode(nodes, 'n2', { x: 200, y: 120 });

    expect(moved[0]).toEqual(nodes[0]);
    expect(moved[1]).toMatchObject({ id: 'n2', x: 200, y: 120 });
  });

  it('keeps legacy nodes within their original 72x32 bounds', () => {
    const legacy: DiagramNode = { id: 'legacy', label: 'Idea', x: 0, y: 0 };
    const [moved] = moveNode([legacy], legacy.id, { x: 5_000, y: 5_000 });

    expect(moved).toMatchObject({
      x: DIAGRAM_CANVAS_WIDTH - 72,
      y: DIAGRAM_CANVAS_HEIGHT - 32,
    });
  });

  it('collapses whitespace and caps labels at the readable limit', () => {
    expect(prepareNodeLabel('  Auth    service  ')).toBe('Auth service');
    expect(prepareNodeLabel('a'.repeat(80))).toHaveLength(DIAGRAM_LABEL_LIMIT);

    expect(renameNode(buildNodes(1), 'n1', 'Gateway')[0]?.label).toBe('Gateway');
  });

  it('preserves spaces while editing and normalizes them at submission', () => {
    const editing = renameNode(buildNodes(1), 'n1', 'Auth ');
    expect(editing[0]?.label).toBe('Auth ');

    const prepared = prepareDiagram(editing, []);
    expect(prepared.ok && prepared.artifact.nodes[0]?.label).toBe('Auth');
  });

  it('maps a scaled browser surface into diagram coordinates', () => {
    expect(
      clientPointToDiagramPoint({ x: 500, y: 320 }, { left: 20, top: 20, width: 960, height: 600 }),
    ).toEqual({ x: 480, y: 300 });
  });

  it('deletes only the targeted node', () => {
    expect(deleteNode(buildNodes(3), 'n2').map((node) => node.id)).toEqual(['n1', 'n3']);
  });

  it('removes inherited edges attached to a deleted node', () => {
    expect(
      deleteNodeWithEdges(
        buildNodes(3),
        [
          { from: 'n1', to: 'n2' },
          { from: 'n2', to: 'n3' },
          { from: 'n1', to: 'n3' },
        ],
        'n2',
      ).edges,
    ).toEqual([{ from: 'n1', to: 'n3' }]);
  });

  it('auto-layout preserves node identity while arranging every node on canvas', () => {
    const nodes = buildNodes(9).map((node, index) => ({
      ...node,
      shape: index % 2 === 0 ? ('container' as const) : ('text' as const),
    }));
    const arranged = autoLayoutNodes(nodes);

    expect(arranged.map(({ id, label, shape }) => ({ id, label, shape }))).toEqual(
      nodes.map(({ id, label, shape }) => ({ id, label, shape })),
    );
    expect(new Set(arranged.map((node) => `${node.x},${node.y}`)).size).toBe(nodes.length);
    expect(
      arranged.every(
        (node) =>
          node.x >= 0 &&
          node.y >= 0 &&
          node.x + DIAGRAM_NODE_WIDTH <= DIAGRAM_CANVAS_WIDTH &&
          node.y + DIAGRAM_NODE_HEIGHT <= DIAGRAM_CANVAS_HEIGHT,
      ),
    ).toBe(true);
  });
});

describe('prepareDiagram', () => {
  it('rejects an empty diagram before any write is attempted', () => {
    expect(prepareDiagram([], [])).toEqual({
      ok: false,
      error: 'Add at least one element before proposing this diagram.',
    });
  });

  it('rejects a node whose label was cleared', () => {
    expect(prepareDiagram([{ id: 'n1', label: '   ', x: 0, y: 0 }], [])).toEqual({
      ok: false,
      error: 'Give every element a label before proposing.',
    });
  });

  it('produces a valid artifact and preserves shapes', () => {
    const added = addNode([], 'text');
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    const prepared = prepareDiagram(added.nodes, []);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    expect(prepared.artifact.nodes[0]?.shape).toBe('text');
    expect(prepared.artifact.edges).toEqual([]);
  });
});

function box(id: string, x: number, y: number): DiagramNode {
  return { id, label: id, x, y, shape: 'box' };
}

describe('diagram selection geometry', () => {
  it('sweeps every node the marquee touches, not only fully enclosed ones', () => {
    const nodes = [box('a', 24, 24), box('b', 400, 24), box('c', 24, 400)];

    // The rectangle only clips the right edge of `a` and the left edge of `b`.
    expect(nodeIdsInRect(nodes, { x: 140, y: 40, width: 280, height: 10 })).toEqual(['a', 'b']);
    expect(nodeIdsInRect(nodes, { x: 0, y: 0, width: 900, height: 600 })).toEqual(['a', 'b', 'c']);
    expect(nodeIdsInRect(nodes, { x: 600, y: 500, width: 40, height: 40 })).toEqual([]);
  });

  it('normalizes a rectangle dragged in any direction', () => {
    expect(normalizeRect({ x: 300, y: 200 }, { x: 100, y: 50 })).toEqual({
      x: 100,
      y: 50,
      width: 200,
      height: 150,
    });
  });
});

describe('moveNodesBy', () => {
  it('moves the whole selection as one rigid group', () => {
    const nodes = [box('a', 24, 24), box('b', 200, 120), box('c', 400, 400)];
    const origins = { a: { x: 24, y: 24 }, b: { x: 200, y: 120 } };

    const moved = moveNodesBy(nodes, origins, { x: 80, y: 40 }, 'a');

    expect(moved[0]).toMatchObject({ x: 104, y: 64 });
    expect(moved[1]).toMatchObject({ x: 280, y: 160 });
    // The unselected node is untouched.
    expect(moved[2]).toMatchObject({ x: 400, y: 400 });
  });

  it('clamps the shared delta so no member of the selection leaves the sheet', () => {
    const nodes = [box('a', 24, 24), box('b', 800, 500)];
    const origins = { a: { x: 24, y: 24 }, b: { x: 800, y: 500 } };

    const moved = moveNodesBy(nodes, origins, { x: 5_000, y: 5_000 }, 'a');

    // `b` stops at the edge and `a` keeps exactly the same relative offset.
    expect(moved[1]).toMatchObject({
      x: DIAGRAM_CANVAS_WIDTH - 120,
      y: DIAGRAM_CANVAS_HEIGHT - 56,
    });
    expect(moved[0]!.x - moved[1]!.x).toBe(24 - 800);
    expect(moved[0]!.y - moved[1]!.y).toBe(24 - 500);
  });

  it('keeps unsnapped positions whole and inside the sheet', () => {
    const nodes = [box('a', 24, 24)];
    const origins = { a: { x: 24, y: 24 } };

    const snapped = moveNodesBy(nodes, origins, { x: 11.4, y: 3.2 }, 'a', true);
    expect(snapped[0]).toMatchObject({ x: 32, y: 24 });

    const free = moveNodesBy(nodes, origins, { x: 11.4, y: 3.2 }, 'a', false);
    expect(free[0]).toMatchObject({ x: 35, y: 27 });
    expect(Number.isInteger(free[0]!.x)).toBe(true);
    expect(Number.isInteger(free[0]!.y)).toBe(true);
  });

  it('leaves the graph alone when the anchor is not part of the drag', () => {
    const nodes = [box('a', 24, 24)];
    expect(moveNodesBy(nodes, {}, { x: 40, y: 40 }, 'a')).toEqual(nodes);
  });

  it('nudges a legacy node against its own 72x32 bounds', () => {
    const legacy: DiagramNode = { id: 'legacy', label: 'Idea', x: 100, y: 100 };

    const moved = moveNodesBy(
      [legacy],
      { legacy: { x: 100, y: 100 } },
      { x: 5_000, y: 5_000 },
      'legacy',
    );

    expect(moved[0]).toMatchObject({
      x: DIAGRAM_CANVAS_WIDTH - 72,
      y: DIAGRAM_CANVAS_HEIGHT - 32,
    });
  });
});

describe('align and distribute', () => {
  const mixed = [box('a', 24, 24), box('b', 200, 120), box('c', 400, 300)];

  it('aligns to the selection bounding box', () => {
    expect(alignNodes(mixed, ['a', 'b', 'c'], 'left').map((node) => node.x)).toEqual([24, 24, 24]);
    expect(alignNodes(mixed, ['a', 'b', 'c'], 'right').map((node) => node.x)).toEqual([
      400, 400, 400,
    ]);
    expect(alignNodes(mixed, ['a', 'b', 'c'], 'top').map((node) => node.y)).toEqual([24, 24, 24]);
    expect(alignNodes(mixed, ['a', 'b', 'c'], 'bottom').map((node) => node.y)).toEqual([
      300, 300, 300,
    ]);
  });

  it('aligns different shapes on their centres, not their corners', () => {
    const nodes: DiagramNode[] = [box('a', 0, 0), { id: 'b', label: 'b', x: 0, y: 200 }];

    const aligned = alignNodes(nodes, ['a', 'b'], 'centerX');

    expect(aligned[0]!.x + 120 / 2).toBe(aligned[1]!.x + 72 / 2);
  });

  it('ignores an alignment that has fewer than two members', () => {
    expect(alignNodes(mixed, ['a'], 'left')).toEqual(mixed);
  });

  it('spaces a distributed row with equal gaps between boxes', () => {
    const nodes = [box('a', 0, 0), box('b', 100, 0), box('c', 600, 0)];

    const spread = distributeNodes(nodes, ['a', 'b', 'c'], 'horizontal');

    const gapOne = spread[1]!.x - (spread[0]!.x + 120);
    const gapTwo = spread[2]!.x - (spread[1]!.x + 120);
    expect(gapOne).toBe(gapTwo);
    // The outermost two never move.
    expect(spread[0]!.x).toBe(0);
    expect(spread[2]!.x).toBe(600);
  });

  it('needs three nodes before distributing', () => {
    const nodes = [box('a', 0, 0), box('b', 100, 0)];
    expect(distributeNodes(nodes, ['a', 'b'], 'horizontal')).toEqual(nodes);
  });
});

describe('copy and paste', () => {
  const nodes = [box('n1', 24, 24), box('n2', 200, 24), box('n3', 400, 24)];
  const edges = [
    { from: 'n1', to: 'n2', label: 'calls' },
    { from: 'n2', to: 'n3' },
  ];

  it('copies an arrow only when both of its endpoints are selected', () => {
    expect(copyDiagramFragment(nodes, edges, ['n1', 'n2'])).toEqual({
      nodes: [nodes[0], nodes[1]],
      edges: [{ from: 'n1', to: 'n2', label: 'calls' }],
    });
    expect(copyDiagramFragment(nodes, edges, ['n1', 'n3']).edges).toEqual([]);
  });

  it('pastes with fresh ids, an offset, and remapped internal arrows', () => {
    const fragment = copyDiagramFragment(nodes, edges, ['n1', 'n2']);

    const pasted = pasteDiagramFragment(nodes, edges, fragment, { x: 16, y: 16 });
    expect(pasted.ok).toBe(true);
    if (!pasted.ok) return;

    expect(pasted.addedIds).toHaveLength(2);
    expect(new Set(pasted.nodes.map((node) => node.id)).size).toBe(pasted.nodes.length);
    // No pasted id collides with the diagram it landed in.
    expect(pasted.addedIds.some((id) => nodes.some((node) => node.id === id))).toBe(false);

    const copiedEdge = pasted.edges.at(-1)!;
    expect(copiedEdge).toEqual({
      from: pasted.addedIds[0],
      to: pasted.addedIds[1],
      label: 'calls',
    });

    const first = pasted.nodes.find((node) => node.id === pasted.addedIds[0]);
    expect(first).toMatchObject({ x: 24 + 16, y: 24 + 16, label: 'n1' });
  });

  it('pastes a valid artifact through the real contract', () => {
    const fragment = copyDiagramFragment(nodes, edges, ['n1', 'n2']);
    const pasted = pasteDiagramFragment(nodes, edges, fragment, {
      x: DIAGRAM_GRID,
      y: DIAGRAM_GRID,
    });
    expect(pasted.ok).toBe(true);
    if (!pasted.ok) return;

    expect(prepareDiagram(pasted.nodes, pasted.edges).ok).toBe(true);
  });

  it('refuses a paste that would exceed the element limit', () => {
    const full = buildNodes(DIAGRAM_NODE_LIMIT);
    const fragment = copyDiagramFragment(full, [], [full[0]!.id]);

    expect(pasteDiagramFragment(full, [], fragment, { x: 8, y: 8 })).toEqual({
      ok: false,
      error: `A diagram can hold ${DIAGRAM_NODE_LIMIT} elements at most.`,
    });
  });

  it('refuses an empty paste', () => {
    expect(pasteDiagramFragment(nodes, edges, { nodes: [], edges: [] }, { x: 8, y: 8 })).toEqual({
      ok: false,
      error: 'Copy at least one element first.',
    });
  });
});

describe('deleteNodesWithEdges', () => {
  it('removes every selected node and each arrow that touched one', () => {
    const nodes = [box('n1', 0, 0), box('n2', 100, 0), box('n3', 200, 0)];
    const edges = [
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3' },
      { from: 'n3', to: 'n1' },
    ];

    expect(deleteNodesWithEdges(nodes, edges, ['n1', 'n2'])).toEqual({
      nodes: [nodes[2]],
      edges: [],
    });
  });
});

describe('placement without snapping', () => {
  it('drops a node at the exact cursor position when snapping is off', () => {
    const snapped = addNode([], 'box', { x: 301, y: 205 }, true);
    expect(snapped.ok && snapped.nodes[0]).toMatchObject({ x: 304, y: 208 });

    const free = addNode([], 'box', { x: 301, y: 205 }, false);
    expect(free.ok && free.nodes[0]).toMatchObject({ x: 301, y: 205 });
  });

  it('still clamps an unsnapped drop to the sheet', () => {
    const free = addNode([], 'box', { x: 5_000, y: -50 }, false);
    expect(free.ok && free.nodes[0]).toMatchObject({
      x: DIAGRAM_CANVAS_WIDTH - DIAGRAM_NODE_WIDTH,
      y: 0,
    });
  });
});

describe('resizeNode', () => {
  const start = { x: 100, y: 100, width: 120, height: 56 };
  const node: DiagramNode = { id: 'n1', label: 'A', x: 100, y: 100, shape: 'box' };

  it('grows from the bottom-right without moving the origin', () => {
    const [resized] = resizeNode([node], 'n1', 'se', start, { x: 40, y: 24 });
    expect(resized).toMatchObject({ x: 100, y: 100, width: 160, height: 80 });
  });

  it('moves the origin when the top-left corner is dragged', () => {
    const [resized] = resizeNode([node], 'n1', 'nw', start, { x: -40, y: -24 });
    // The bottom-right stays pinned at (220, 156).
    expect(resized).toMatchObject({ x: 60, y: 76, width: 160, height: 80 });
    expect(resized!.x + resized!.width!).toBe(start.x + start.width);
    expect(resized!.y + resized!.height!).toBe(start.y + start.height);
  });

  it('never shrinks below the readable minimum', () => {
    const [resized] = resizeNode([node], 'n1', 'se', start, { x: -1_000, y: -1_000 });
    expect(resized).toMatchObject({ width: 56, height: 32 });
  });

  it('never grows past the maximum or off the sheet', () => {
    const [huge] = resizeNode([node], 'n1', 'se', start, { x: 5_000, y: 5_000 });
    expect(huge).toMatchObject({ width: 480, height: 320 });

    const atEdge = { x: 900, y: 560, width: 56, height: 32 };
    const [clamped] = resizeNode(
      [{ ...node, x: 900, y: 560, width: 56, height: 32 }],
      'n1',
      'se',
      atEdge,
      { x: 5_000, y: 5_000 },
    );
    expect(clamped!.x + clamped!.width!).toBe(DIAGRAM_CANVAS_WIDTH);
    expect(clamped!.y + clamped!.height!).toBe(DIAGRAM_CANVAS_HEIGHT);
  });

  it('holds the aspect ratio when it is locked, and skips the grid to do it', () => {
    const [locked] = resizeNode([node], 'n1', 'se', start, { x: 120, y: 0 }, true, true);
    expect(locked).toMatchObject({ width: 240, height: 112 });
    expect(locked!.width! / locked!.height!).toBeCloseTo(start.width / start.height, 6);
  });

  it('snaps the new size to the grid, or lands exactly with snapping off', () => {
    const [snapped] = resizeNode([node], 'n1', 'se', start, { x: 41, y: 25 }, true);
    expect(snapped).toMatchObject({ width: 160, height: 80 });

    const [free] = resizeNode([node], 'n1', 'se', start, { x: 41, y: 25 }, false);
    expect(free).toMatchObject({ width: 161, height: 81 });
  });

  it('produces a size the write contract accepts', () => {
    const resized = resizeNode([node], 'n1', 'se', start, { x: 40, y: 24 });
    expect(prepareDiagram(resized, []).ok).toBe(true);
  });

  it('drops the stored size again on reset', () => {
    const resized = resizeNode([node], 'n1', 'se', start, { x: 40, y: 24 });
    const [reset] = clearNodeSize(resized, 'n1');
    expect(reset).not.toHaveProperty('width');
    expect(reset).not.toHaveProperty('height');
  });

  it('clamps a resized node against its own size, not its shape default', () => {
    const wide: DiagramNode = {
      id: 'w',
      label: 'W',
      x: 0,
      y: 0,
      shape: 'box',
      width: 400,
      height: 56,
    };

    const [moved] = moveNodesBy([wide], { w: { x: 0, y: 0 } }, { x: 5_000, y: 0 }, 'w');

    expect(moved!.x).toBe(DIAGRAM_CANVAS_WIDTH - 400);
  });
});

describe('style setters', () => {
  const nodes: DiagramNode[] = [
    { id: 'n1', label: 'A', x: 0, y: 0, shape: 'box' },
    { id: 'n2', label: 'B', x: 200, y: 0, shape: 'box' },
  ];
  const edges = [{ from: 'n1', to: 'n2', label: 'calls' }];

  it('styles every node in the selection and leaves the rest alone', () => {
    const styled = styleNodes(nodes, ['n1'], { fillColor: 'blue', fontSizePreset: 'large' });
    expect(styled[0]).toMatchObject({ fillColor: 'blue', fontSizePreset: 'large' });
    expect(styled[1]).not.toHaveProperty('fillColor');
  });

  it('clears only the style fields, keeping identity, position and size', () => {
    const styled = styleNodes([{ ...nodes[0]!, width: 200, height: 90 }], ['n1'], {
      fillColor: 'rose',
      strokeColor: 'rose',
      strokeWidthPreset: 'thick',
      fontSizePreset: 'small',
    });

    const [cleared] = clearNodeStyle(styled, ['n1']);

    expect(cleared).toEqual({
      id: 'n1',
      label: 'A',
      x: 0,
      y: 0,
      shape: 'box',
      width: 200,
      height: 90,
    });
  });

  it('styles and clears one arrow without touching its endpoints or label', () => {
    const styled = styleEdge(
      edges,
      { from: 'n1', to: 'n2' },
      {
        strokeColor: 'violet',
        strokeStyle: 'dashed',
      },
    );
    expect(styled[0]).toMatchObject({ strokeColor: 'violet', strokeStyle: 'dashed' });

    expect(clearEdgeStyle(styled, { from: 'n1', to: 'n2' })[0]).toEqual({
      from: 'n1',
      to: 'n2',
      label: 'calls',
    });
  });

  it('carries v2 fields through to the proposed artifact unchanged', () => {
    const styled = styleNodes([{ ...nodes[0]!, width: 200, height: 90 }], ['n1'], {
      fillColor: 'green',
      strokeColor: 'green',
      strokeWidthPreset: 'thin',
      fontSizePreset: 'large',
    });

    const prepared = prepareDiagram(styled, []);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    expect(prepared.artifact.nodes[0]).toMatchObject({
      width: 200,
      height: 90,
      fillColor: 'green',
      strokeColor: 'green',
      strokeWidthPreset: 'thin',
      fontSizePreset: 'large',
    });
  });
});

describe('semantic containers', () => {
  // A 184x112 container at (100, 100) holding one box at (120, 120).
  function grouped(): DiagramNode[] {
    return [
      { id: 'c1', label: 'Platform', x: 100, y: 100, shape: 'container' },
      { id: 'n1', label: 'API', x: 120, y: 120, shape: 'box', parentId: 'c1' },
      { id: 'n2', label: 'Outside', x: 600, y: 400, shape: 'box' },
    ];
  }

  describe('containerAtPoint', () => {
    it('finds the container a point falls inside', () => {
      expect(containerAtPoint(grouped(), { x: 150, y: 150 })?.id).toBe('c1');
      expect(containerAtPoint(grouped(), { x: 10, y: 10 })).toBeNull();
    });

    it('never offers a non-container as a drop target', () => {
      const nodes: DiagramNode[] = [{ id: 'n1', label: 'A', x: 0, y: 0, shape: 'box' }];
      expect(containerAtPoint(nodes, { x: 60, y: 28 })).toBeNull();
    });

    it('prefers the most deeply nested container', () => {
      const nodes: DiagramNode[] = [
        { id: 'outer', label: 'Outer', x: 0, y: 0, shape: 'container', width: 400, height: 300 },
        {
          id: 'inner',
          label: 'Inner',
          x: 40,
          y: 40,
          shape: 'container',
          width: 200,
          height: 150,
          parentId: 'outer',
        },
      ];
      expect(containerAtPoint(nodes, { x: 100, y: 100 })?.id).toBe('inner');
      expect(containerAtPoint(nodes, { x: 350, y: 250 })?.id).toBe('outer');
    });

    it('excludes the nodes being dragged so nothing lands inside itself', () => {
      const nodes = grouped();
      expect(containerAtPoint(nodes, { x: 150, y: 150 }, ['c1'])).toBeNull();
    });
  });

  describe('reparentNodes', () => {
    it('assigns and clears a parent', () => {
      const assigned = reparentNodes(grouped(), ['n2'], 'c1');
      expect(assigned.find((node) => node.id === 'n2')?.parentId).toBe('c1');

      const cleared = reparentNodes(assigned, ['n2'], null);
      expect(cleared.find((node) => node.id === 'n2')).not.toHaveProperty('parentId');
    });

    it('refuses a parent that is not a container', () => {
      const nodes = reparentNodes(grouped(), ['n2'], 'n1');
      expect(nodes.find((node) => node.id === 'n2')).not.toHaveProperty('parentId');
    });

    it('refuses a parent that does not exist', () => {
      const nodes = reparentNodes(grouped(), ['n2'], 'ghost');
      expect(nodes.find((node) => node.id === 'n2')).not.toHaveProperty('parentId');
    });

    it('refuses to nest a container inside its own descendant', () => {
      const nodes: DiagramNode[] = [
        { id: 'outer', label: 'Outer', x: 0, y: 0, shape: 'container' },
        { id: 'inner', label: 'Inner', x: 10, y: 10, shape: 'container', parentId: 'outer' },
      ];

      const attempted = reparentNodes(nodes, ['outer'], 'inner');

      expect(attempted.find((node) => node.id === 'outer')).not.toHaveProperty('parentId');
      expect(prepareDiagram(attempted, []).ok).toBe(true);
    });

    it('refuses to parent a node to itself', () => {
      const nodes = reparentNodes(grouped(), ['c1'], 'c1');
      expect(nodes.find((node) => node.id === 'c1')).not.toHaveProperty('parentId');
    });

    it('produces a grouping the write contract accepts', () => {
      const grouped2 = reparentNodes(grouped(), ['n2'], 'c1');
      const prepared = prepareDiagram(grouped2, []);
      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;
      expect(prepared.artifact.nodes.find((node) => node.id === 'n2')?.parentId).toBe('c1');
    });
  });

  describe('draggedSelectionRoots', () => {
    it('drops members that are already carried by another member', () => {
      expect(draggedSelectionRoots(grouped(), ['c1', 'n1'])).toEqual(['c1']);
      expect(draggedSelectionRoots(grouped(), ['n1'])).toEqual(['n1']);
      expect(draggedSelectionRoots(grouped(), ['n1', 'n2']).sort()).toEqual(['n1', 'n2']);
    });
  });

  describe('clampNodesInsideContainer', () => {
    it('pulls a child back inside after the container shrinks', () => {
      const nodes: DiagramNode[] = [
        { id: 'c1', label: 'C', x: 100, y: 100, shape: 'container', width: 100, height: 80 },
        { id: 'n1', label: 'N', x: 400, y: 400, shape: 'box', parentId: 'c1' },
      ];

      const [, child] = clampNodesInsideContainer(nodes, 'c1');

      // The 120x56 box is wider than the 100-wide container, so it pins to the left.
      expect(child).toMatchObject({ x: 100, y: 124 });
    });

    it('leaves a child that already fits exactly where it was', () => {
      const nodes = grouped();
      expect(clampNodesInsideContainer(nodes, 'c1')[1]).toBe(nodes[1]);
    });

    it('clamps nested descendants, not just direct children', () => {
      const nodes: DiagramNode[] = [
        { id: 'outer', label: 'O', x: 0, y: 0, shape: 'container', width: 200, height: 200 },
        { id: 'inner', label: 'I', x: 10, y: 10, shape: 'container', parentId: 'outer' },
        { id: 'leaf', label: 'L', x: 900, y: 500, shape: 'box', parentId: 'inner' },
      ];

      const clamped = clampNodesInsideContainer(nodes, 'outer');

      expect(clamped.find((node) => node.id === 'leaf')?.x).toBeLessThanOrEqual(200);
    });

    it('ignores a target that is not a container', () => {
      const nodes = grouped();
      expect(clampNodesInsideContainer(nodes, 'n1')).toEqual(nodes);
    });
  });

  describe('deleting a container', () => {
    const edges = [{ from: 'n1', to: 'n2' }];

    it('removes the whole subtree when contents go with it', () => {
      const result = deleteContainerWithContents(grouped(), edges, 'c1');

      expect(result.nodes.map((node) => node.id)).toEqual(['n2']);
      // The arrow lost an endpoint and goes with it.
      expect(result.edges).toEqual([]);
    });

    it('keeps the contents and lifts them out when ungrouped', () => {
      const result = ungroupContainer(grouped(), edges, 'c1');

      expect(result.nodes.map((node) => node.id).sort()).toEqual(['n1', 'n2']);
      expect(result.nodes.find((node) => node.id === 'n1')).not.toHaveProperty('parentId');
      // Both endpoints survived, so the arrow does too.
      expect(result.edges).toEqual(edges);
    });

    it('lifts children to the grandparent when a nested container is ungrouped', () => {
      const nodes: DiagramNode[] = [
        { id: 'outer', label: 'O', x: 0, y: 0, shape: 'container' },
        { id: 'inner', label: 'I', x: 10, y: 10, shape: 'container', parentId: 'outer' },
        { id: 'leaf', label: 'L', x: 20, y: 20, shape: 'box', parentId: 'inner' },
      ];

      const result = ungroupContainer(nodes, [], 'inner');

      expect(result.nodes.find((node) => node.id === 'leaf')?.parentId).toBe('outer');
      expect(prepareDiagram(result.nodes, result.edges).ok).toBe(true);
    });

    it('never leaves a survivor pointing at a container that is gone', () => {
      const result = deleteNodesWithEdges(grouped(), [], ['c1']);

      expect(result.nodes.find((node) => node.id === 'n1')).not.toHaveProperty('parentId');
      expect(prepareDiagram(result.nodes, result.edges).ok).toBe(true);
    });
  });

  describe('copying a group', () => {
    it('keeps the grouping when the container is copied too', () => {
      const nodes = grouped();
      const fragment = copyDiagramFragment(nodes, [], ['c1', 'n1']);

      const pasted = pasteDiagramFragment(nodes, [], fragment, { x: 16, y: 16 });
      expect(pasted.ok).toBe(true);
      if (!pasted.ok) return;

      const [containerCopy, childCopy] = pasted.addedIds;
      expect(pasted.nodes.find((node) => node.id === childCopy)?.parentId).toBe(containerCopy);
      expect(prepareDiagram(pasted.nodes, pasted.edges).ok).toBe(true);
    });

    it('drops a parent reference the copy left behind', () => {
      const nodes = grouped();
      const fragment = copyDiagramFragment(nodes, [], ['n1']);

      const pasted = pasteDiagramFragment(nodes, [], fragment, { x: 16, y: 16 });
      expect(pasted.ok).toBe(true);
      if (!pasted.ok) return;

      // The copy would otherwise still claim the original's container.
      const copy = pasted.nodes.find((node) => node.id === pasted.addedIds[0]);
      expect(copy).not.toHaveProperty('parentId');
      expect(prepareDiagram(pasted.nodes, pasted.edges).ok).toBe(true);
    });
  });

  describe('layout with groups', () => {
    it('keeps every node on the sheet after Arrange, containers included', () => {
      const arranged = autoLayoutNodes(grouped());
      for (const node of arranged) {
        expect(node.x).toBeGreaterThanOrEqual(0);
        expect(node.y).toBeGreaterThanOrEqual(0);
      }
      // Arrange is positional only; it never changes who belongs to whom.
      expect(arranged.find((node) => node.id === 'n1')?.parentId).toBe('c1');
    });
  });
});
