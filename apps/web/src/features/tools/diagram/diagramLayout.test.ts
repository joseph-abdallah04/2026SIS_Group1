import type { DiagramEdge, DiagramNode } from '@roundtable/shared';
import { diagramEdgeRoutes, effectiveDiagramNodeSize } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { DIAGRAM_CANVAS_HEIGHT, DIAGRAM_CANVAS_WIDTH, prepareDiagram } from './diagramModel';
import { layoutDiagram } from './diagramLayout';

function node(id: string, over: Partial<DiagramNode> = {}): DiagramNode {
  return { id, label: id, x: 0, y: 0, shape: 'box', ...over };
}

function edge(from: string, to: string): DiagramEdge {
  return { from, to };
}

function at(nodes: readonly DiagramNode[], id: string): DiagramNode {
  const found = nodes.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

function overlaps(a: DiagramNode, b: DiagramNode): boolean {
  const sizeA = effectiveDiagramNodeSize(a);
  const sizeB = effectiveDiagramNodeSize(b);
  return (
    a.x < b.x + sizeB.width &&
    b.x < a.x + sizeA.width &&
    a.y < b.y + sizeB.height &&
    b.y < a.y + sizeA.height
  );
}

function expectNoOverlaps(nodes: readonly DiagramNode[]) {
  const leaves = nodes.filter((candidate) => candidate.shape !== 'container');
  for (let i = 0; i < leaves.length; i += 1) {
    for (let j = i + 1; j < leaves.length; j += 1) {
      expect(overlaps(leaves[i]!, leaves[j]!)).toBe(false);
    }
  }
}

function expectOnSheet(nodes: readonly DiagramNode[]) {
  for (const item of nodes) {
    const size = effectiveDiagramNodeSize(item);
    expect(item.x).toBeGreaterThanOrEqual(0);
    expect(item.y).toBeGreaterThanOrEqual(0);
    expect(item.x + size.width).toBeLessThanOrEqual(DIAGRAM_CANVAS_WIDTH);
    expect(item.y + size.height).toBeLessThanOrEqual(DIAGRAM_CANVAS_HEIGHT);
  }
}

/** Counts arrow segments that visually cross each other. */
function countCrossings(nodes: readonly DiagramNode[], edges: readonly DiagramEdge[]): number {
  const routes = diagramEdgeRoutes(nodes, edges).filter((route) => route !== null);
  const side = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number =>
    Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));

  let crossings = 0;
  for (let i = 0; i < routes.length; i += 1) {
    for (let j = i + 1; j < routes.length; j += 1) {
      const a = routes[i]!;
      const b = routes[j]!;
      // Arrows meeting at a shared node are not a crossing.
      const shares =
        (a.x1 === b.x1 && a.y1 === b.y1) ||
        (a.x2 === b.x2 && a.y2 === b.y2) ||
        (a.x1 === b.x2 && a.y1 === b.y2) ||
        (a.x2 === b.x1 && a.y2 === b.y1);
      if (shares) continue;
      const d1 = side(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1);
      const d2 = side(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2);
      const d3 = side(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1);
      const d4 = side(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2);
      if (d1 * d2 < 0 && d3 * d4 < 0) crossings += 1;
    }
  }
  return crossings;
}

describe('graph-aware arrange', () => {
  it('ranks a chain along the flow direction', () => {
    const nodes = [node('a'), node('b'), node('c')];
    const edges = [edge('a', 'b'), edge('b', 'c')];

    const laid = layoutDiagram(nodes, edges, 'TB');

    expect(at(laid, 'a').y).toBeLessThan(at(laid, 'b').y);
    expect(at(laid, 'b').y).toBeLessThan(at(laid, 'c').y);
    // A single chain stays on one column.
    expect(at(laid, 'a').x).toBe(at(laid, 'b').x);
    expectNoOverlaps(laid);
  });

  it('flips the flow axis for left-to-right', () => {
    const nodes = [node('a'), node('b'), node('c')];
    const edges = [edge('a', 'b'), edge('b', 'c')];

    const laid = layoutDiagram(nodes, edges, 'LR');

    expect(at(laid, 'a').x).toBeLessThan(at(laid, 'b').x);
    expect(at(laid, 'b').x).toBeLessThan(at(laid, 'c').x);
    expect(at(laid, 'a').y).toBe(at(laid, 'b').y);
  });

  it('spreads a tree across one rank under its root', () => {
    const nodes = [node('r'), node('a'), node('b'), node('c')];
    const edges = [edge('r', 'a'), edge('r', 'b'), edge('r', 'c')];

    const laid = layoutDiagram(nodes, edges, 'TB');

    const children = ['a', 'b', 'c'].map((id) => at(laid, id));
    expect(new Set(children.map((child) => child.y)).size).toBe(1);
    expect(at(laid, 'r').y).toBeLessThan(children[0]!.y);
    expectNoOverlaps(laid);
    expect(countCrossings(laid, edges)).toBe(0);
  });

  it('puts a diamond join on the rank below both of its branches', () => {
    const nodes = [node('a'), node('b'), node('c'), node('d')];
    const edges = [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')];

    const laid = layoutDiagram(nodes, edges, 'TB');

    expect(at(laid, 'b').y).toBe(at(laid, 'c').y);
    expect(at(laid, 'd').y).toBeGreaterThan(at(laid, 'b').y);
    expect(countCrossings(laid, edges)).toBe(0);
    expectNoOverlaps(laid);
  });

  it('lays a star out without crossings', () => {
    const nodes = ['hub', 'a', 'b', 'c', 'd', 'e'].map((id) => node(id));
    const edges = ['a', 'b', 'c', 'd', 'e'].map((id) => edge('hub', id));

    const laid = layoutDiagram(nodes, edges, 'TB');

    expect(countCrossings(laid, edges)).toBe(0);
    expectNoOverlaps(laid);
    expectOnSheet(laid);
  });

  it('terminates on a cycle and still ranks every node', () => {
    const nodes = [node('a'), node('b'), node('c')];
    const edges = [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')];

    const laid = layoutDiagram(nodes, edges, 'TB');

    // The back edge is ignored for ranking, so the cycle reads as a chain.
    expect(at(laid, 'a').y).toBeLessThan(at(laid, 'b').y);
    expect(at(laid, 'b').y).toBeLessThan(at(laid, 'c').y);
    expectNoOverlaps(laid);
  });

  it('treats a reciprocal pair as one step, not two overlapping ranks', () => {
    const nodes = [node('a'), node('b')];
    const edges = [edge('a', 'b'), edge('b', 'a')];

    const laid = layoutDiagram(nodes, edges, 'TB');

    expect(at(laid, 'a').y).toBeLessThan(at(laid, 'b').y);
    expectNoOverlaps(laid);
  });

  it('separates disconnected components instead of piling them up', () => {
    const nodes = ['a', 'b', 'c', 'd'].map((id) => node(id));
    const edges = [edge('a', 'b'), edge('c', 'd')];

    const laid = layoutDiagram(nodes, edges, 'TB');

    expectNoOverlaps(laid);
    // Both chains flow downward on their own columns.
    expect(at(laid, 'a').x).not.toBe(at(laid, 'c').x);
    expect(at(laid, 'a').y).toBe(at(laid, 'c').y);
  });

  it('falls back to a compact grid when there are no arrows at all', () => {
    const few = ['a', 'b', 'c', 'd', 'e'].map((id) => node(id));

    const laidFew = layoutDiagram(few, [], 'TB');

    expectNoOverlaps(laidFew);
    expectOnSheet(laidFew);
    // Five boxes fit across the sheet, so they stay on one row.
    expect(new Set(laidFew.map((item) => item.y)).size).toBe(1);

    const many = Array.from({ length: 12 }, (_, index) => node(`n${index}`));

    const laidMany = layoutDiagram(many, [], 'TB');

    expectNoOverlaps(laidMany);
    expectOnSheet(laidMany);
    // Once a row is full the grid wraps rather than running off the sheet.
    expect(new Set(laidMany.map((item) => item.y)).size).toBeGreaterThan(1);
  });

  it('mixes connected and isolated nodes without overlapping them', () => {
    const nodes = ['a', 'b', 'loose1', 'loose2'].map((id) => node(id));
    const edges = [edge('a', 'b')];

    const laid = layoutDiagram(nodes, edges, 'TB');

    expectNoOverlaps(laid);
    expectOnSheet(laid);
  });

  it('honours each node’s real size and shape', () => {
    const nodes = [
      node('wide', { width: 400, height: 60 }),
      node('tall', { shape: 'container', width: 200, height: 300 }),
      node('round', { shape: 'ellipse' }),
    ];
    const edges = [edge('wide', 'tall'), edge('wide', 'round')];

    const laid = layoutDiagram(nodes, edges, 'TB');

    expectNoOverlaps(laid);
    expectOnSheet(laid);
    // Sizes are never rewritten for a node that holds nothing.
    expect(at(laid, 'wide')).toMatchObject({ width: 400, height: 60 });
  });

  it('is deterministic: the same diagram always lands the same way', () => {
    const nodes = ['a', 'b', 'c', 'd', 'e'].map((id) => node(id));
    const edges = [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd'), edge('d', 'e')];

    const first = layoutDiagram(nodes, edges, 'TB');
    const second = layoutDiagram(nodes, edges, 'TB');
    const third = layoutDiagram(first, edges, 'TB');

    expect(second).toEqual(first);
    // Running Arrange twice does not drift.
    expect(third).toEqual(first);
  });

  it('reduces crossings compared with the order the nodes were authored in', () => {
    // Authored so the obvious ordering crosses: the first source points at the
    // last target and vice versa.
    const nodes = ['s1', 's2', 't1', 't2'].map((id) => node(id));
    const edges = [edge('s1', 't2'), edge('s2', 't1')];

    const laid = layoutDiagram(nodes, edges, 'TB');

    expect(countCrossings(laid, edges)).toBe(0);
  });

  it('keeps everything on the sheet even for a wide graph', () => {
    const nodes = Array.from({ length: 24 }, (_, index) => node(`n${index}`));
    const edges = Array.from({ length: 23 }, (_, index) => edge(`n${index}`, `n${index + 1}`));

    const laid = layoutDiagram(nodes, edges, 'LR');

    expectOnSheet(laid);
  });

  it('falls back to the grid when a chain is longer than the sheet', () => {
    // 24 ranks of 56px plus gaps is far taller than the 600px sheet, so ranking
    // it would stack every node on top of the last. The grid takes over.
    const nodes = Array.from({ length: 24 }, (_, index) => node(`n${index}`));
    const edges = Array.from({ length: 23 }, (_, index) => edge(`n${index}`, `n${index + 1}`));

    const laid = layoutDiagram(nodes, edges, 'TB');

    expectNoOverlaps(laid);
    expectOnSheet(laid);
  });

  it('produces an artifact the write contract accepts', () => {
    const nodes = [node('a'), node('b'), node('c')];
    const edges = [edge('a', 'b'), edge('b', 'c')];

    expect(prepareDiagram(layoutDiagram(nodes, edges, 'TB'), edges).ok).toBe(true);
  });

  it('never touches identity, arrows, styling or grouping', () => {
    const nodes = [
      node('c1', { shape: 'container' }),
      node('a', { parentId: 'c1', fillColor: 'blue', strokeWidthPreset: 'thick' }),
      node('b', { parentId: 'c1' }),
    ];
    const edges = [edge('a', 'b')];

    const laid = layoutDiagram(nodes, edges, 'TB');

    expect(laid.map((item) => item.id)).toEqual(['c1', 'a', 'b']);
    expect(at(laid, 'a')).toMatchObject({
      parentId: 'c1',
      fillColor: 'blue',
      strokeWidthPreset: 'thick',
      label: 'a',
    });
  });

  describe('with containers', () => {
    function grouped(): DiagramNode[] {
      return [
        node('g', { shape: 'container' }),
        node('a', { parentId: 'g' }),
        node('b', { parentId: 'g' }),
        node('outside'),
      ];
    }

    it('lays children out inside their container and grows it to fit', () => {
      const laid = layoutDiagram(grouped(), [edge('a', 'b')], 'TB');

      const container = at(laid, 'g');
      const size = effectiveDiagramNodeSize(container);
      for (const id of ['a', 'b']) {
        const child = at(laid, id);
        const childSize = effectiveDiagramNodeSize(child);
        expect(child.x).toBeGreaterThanOrEqual(container.x);
        expect(child.y).toBeGreaterThanOrEqual(container.y);
        expect(child.x + childSize.width).toBeLessThanOrEqual(container.x + size.width);
        expect(child.y + childSize.height).toBeLessThanOrEqual(container.y + size.height);
      }
      // Two stacked boxes need more than the container's 112 default height.
      expect(size.height).toBeGreaterThan(112);
    });

    it('keeps a container’s contents with it when the container is placed', () => {
      const laid = layoutDiagram(grouped(), [edge('a', 'b')], 'TB');
      expectOnSheet(laid);
      expect(prepareDiagram(laid, [edge('a', 'b')]).ok).toBe(true);
    });

    it('lays nested containers out from the inside out', () => {
      const nodes = [
        node('outer', { shape: 'container' }),
        node('inner', { shape: 'container', parentId: 'outer' }),
        node('leaf1', { parentId: 'inner' }),
        node('leaf2', { parentId: 'inner' }),
      ];

      const laid = layoutDiagram(nodes, [edge('leaf1', 'leaf2')], 'TB');

      const outer = at(laid, 'outer');
      const inner = at(laid, 'inner');
      const outerSize = effectiveDiagramNodeSize(outer);
      const innerSize = effectiveDiagramNodeSize(inner);
      expect(inner.x).toBeGreaterThanOrEqual(outer.x);
      expect(inner.x + innerSize.width).toBeLessThanOrEqual(outer.x + outerSize.width);
      for (const id of ['leaf1', 'leaf2']) {
        const leaf = at(laid, id);
        expect(leaf.x).toBeGreaterThanOrEqual(inner.x);
        expect(leaf.y).toBeGreaterThanOrEqual(inner.y);
      }
      expectOnSheet(laid);
    });

    it('never lets a container exceed the bounded size contract', () => {
      const nodes = [
        node('g', { shape: 'container' }),
        ...Array.from({ length: 12 }, (_, index) => node(`n${index}`, { parentId: 'g' })),
      ];

      const laid = layoutDiagram(nodes, [], 'TB');

      const size = effectiveDiagramNodeSize(at(laid, 'g'));
      expect(size.width).toBeLessThanOrEqual(480);
      expect(size.height).toBeLessThanOrEqual(320);
      expect(prepareDiagram(laid, []).ok).toBe(true);
    });
  });
});
