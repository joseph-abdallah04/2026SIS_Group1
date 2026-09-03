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
  addNode,
  autoLayoutNodes,
  clientPointToDiagramPoint,
  createNodeId,
  deleteNode,
  deleteNodeWithEdges,
  moveNode,
  prepareDiagram,
  prepareNodeLabel,
  renameNode,
  snapNodePosition,
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
