import type { DiagramNode } from '@roundtable/shared';
import {
  DIAGRAM_NODE_SHAPE_KEYS,
  diagramBoundaryScale,
  diagramCanParent,
  diagramDescendantIds,
  diagramEdgeGeometry,
  diagramIsAncestor,
  diagramLabelWidthRatio,
  diagramNodeDepth,
  diagramNodeLabelLayout,
  diagramNodeSize,
  diagramNodesInDrawOrder,
} from '@roundtable/shared';
import { diagramWriteArtifactSchema } from '@roundtable/shared/schemas';
import { describe, expect, it } from 'vitest';

function node(id: string, over: Partial<DiagramNode> = {}): DiagramNode {
  return { id, label: id, x: 0, y: 0, ...over };
}

/** Where an arrow leaving the centre in `direction` crosses the outline. */
function anchor(shape: DiagramNode['shape'], direction: { x: number; y: number }) {
  const size = diagramNodeSize(shape);
  const scale = diagramBoundaryScale(shape, size, direction);
  return { x: direction.x * scale, y: direction.y * scale };
}

describe('shape registry', () => {
  it('gives every registered shape a distinct default size', () => {
    expect(DIAGRAM_NODE_SHAPE_KEYS).toHaveLength(8);
    for (const shape of DIAGRAM_NODE_SHAPE_KEYS) {
      const size = diagramNodeSize(shape);
      expect(size.width).toBeGreaterThan(0);
      expect(size.height).toBeGreaterThan(0);
    }
  });

  it('keeps the pre-palette shapes at exactly their original sizes', () => {
    expect(diagramNodeSize('box')).toEqual({ width: 120, height: 56 });
    expect(diagramNodeSize('container')).toEqual({ width: 184, height: 112 });
    expect(diagramNodeSize('text')).toEqual({ width: 144, height: 40 });
    expect(diagramNodeSize(undefined)).toEqual({ width: 72, height: 32 });
  });

  it('lets only containers hold children', () => {
    for (const shape of DIAGRAM_NODE_SHAPE_KEYS) {
      expect(diagramCanParent(shape)).toBe(shape === 'container');
    }
    expect(diagramCanParent(undefined)).toBe(false);
  });
});

describe('shape boundary anchors', () => {
  it('anchors a rectangular shape on its bounding box, exactly as before', () => {
    // box is 120x56, so half-extents are 60 and 28.
    expect(anchor('box', { x: 1, y: 0 })).toEqual({ x: 60, y: 0 });
    expect(anchor('box', { x: 0, y: 1 })).toEqual({ x: 0, y: 28 });
    expect(anchor('box', { x: 1, y: 1 })).toEqual({ x: 28, y: 28 });
    expect(anchor('rectangle', { x: 1, y: 0 })).toEqual({ x: 60, y: 0 });
  });

  it('anchors an ellipse on its curve, not its bounding box', () => {
    // 120x72 -> a = 60, b = 36.
    expect(anchor('ellipse', { x: 1, y: 0 })).toEqual({ x: 60, y: 0 });
    expect(anchor('ellipse', { x: 0, y: 1 })).toEqual({ x: 0, y: 36 });

    const diagonal = anchor('ellipse', { x: 1, y: 1 });
    expect((diagonal.x / 60) ** 2 + (diagonal.y / 36) ** 2).toBeCloseTo(1, 9);
    // A rectangle would have put the diagonal anchor at the corner (36, 36).
    expect(diagonal.x).toBeLessThan(36);
  });

  it('anchors a diamond on its vertices and faces', () => {
    // 128x88 -> a = 64, b = 44.
    expect(anchor('diamond', { x: 1, y: 0 })).toEqual({ x: 64, y: 0 });
    expect(anchor('diamond', { x: 0, y: -1 })).toEqual({ x: 0, y: -44 });

    const diagonal = anchor('diamond', { x: 1, y: 1 });
    // |x|/a + |y|/b = 1 on every face.
    expect(diagonal.x / 64 + diagonal.y / 44).toBeCloseTo(1, 9);
  });

  it('anchors a triangle on its sloped sides', () => {
    // 104x88 -> a = 52, b = 44. Apex up, flat base.
    expect(anchor('triangle', { x: 0, y: 1 })).toEqual({ x: 0, y: 44 });
    expect(anchor('triangle', { x: 0, y: -1 })).toEqual({ x: 0, y: -44 });
    // At the vertical centre the triangle is half as wide as its box.
    expect(anchor('triangle', { x: 1, y: 0 })).toEqual({ x: 26, y: 0 });
    expect(anchor('triangle', { x: -1, y: 0 })).toEqual({ x: -26, y: 0 });
  });

  it('anchors a cylinder on its rectangular envelope', () => {
    const size = diagramNodeSize('cylinder');
    expect(anchor('cylinder', { x: 1, y: 0 })).toEqual({ x: size.width / 2, y: 0 });
    expect(anchor('cylinder', { x: 0, y: 1 })).toEqual({ x: 0, y: size.height / 2 });
  });

  it('returns a zero scale for a zero-length direction', () => {
    expect(diagramBoundaryScale('ellipse', { width: 100, height: 100 }, { x: 0, y: 0 })).toBe(0);
  });

  it('draws an arrow between two shapes from boundary to boundary', () => {
    const from = node('a', { shape: 'ellipse', x: 0, y: 0 });
    // Centres aligned at y = 36 so the arrow is purely horizontal.
    const to = node('b', { shape: 'diamond', x: 400, y: -8 });

    const geometry = diagramEdgeGeometry(from, to);

    // Ellipse is 120x72 centred at (60, 36); its right edge is x = 120.
    expect(geometry.x1).toBeCloseTo(120, 6);
    // Diamond is 128x88 centred at (464, 44); its left vertex is x = 400.
    expect(geometry.x2).toBeCloseTo(400, 6);
  });

  it('keeps legacy box-to-box anchors byte-identical', () => {
    const geometry = diagramEdgeGeometry(
      node('a', { shape: 'box', x: 0, y: 0 }),
      node('b', { shape: 'box', x: 400, y: 0 }),
    );
    expect(geometry).toMatchObject({ x1: 120, y1: 28, x2: 400, y2: 28 });
  });
});

describe('label fitting inside tapered shapes', () => {
  it('narrows the usable label width for shapes that taper', () => {
    expect(diagramLabelWidthRatio('box')).toBe(1);
    expect(diagramLabelWidthRatio('container')).toBe(1);
    expect(diagramLabelWidthRatio('triangle')).toBeLessThan(1);
    expect(diagramLabelWidthRatio('diamond')).toBeLessThan(1);
    expect(diagramLabelWidthRatio('ellipse')).toBeLessThan(1);
  });

  it('wraps a label sooner in a triangle than in a box of the same width', () => {
    const label = 'ingest normalise publish';
    const inBox = diagramNodeLabelLayout({ label, shape: 'box', width: 200, height: 120 });
    const inTriangle = diagramNodeLabelLayout({
      label,
      shape: 'triangle',
      width: 200,
      height: 120,
    });

    expect(inTriangle.lines.length).toBeGreaterThan(inBox.lines.length);
  });

  it('leaves a box label exactly where it was before the palette existed', () => {
    const layout = diagramNodeLabelLayout({ label: 'Client', shape: 'box' });
    expect(layout.lines).toEqual(['Client']);
    expect(layout.firstBaselineY).toBe(32);
  });
});

describe('container semantics', () => {
  const nested: DiagramNode[] = [
    node('outer', { shape: 'container' }),
    node('inner', { shape: 'container', parentId: 'outer' }),
    node('leaf', { shape: 'box', parentId: 'inner' }),
    node('loose', { shape: 'box' }),
  ];

  it('collects every transitive descendant', () => {
    expect(diagramDescendantIds(nested, 'outer').sort()).toEqual(['inner', 'leaf']);
    expect(diagramDescendantIds(nested, 'inner')).toEqual(['leaf']);
    expect(diagramDescendantIds(nested, 'leaf')).toEqual([]);
    expect(diagramDescendantIds(nested, 'loose')).toEqual([]);
  });

  it('reports nesting depth', () => {
    expect(diagramNodeDepth(nested, 'outer')).toBe(0);
    expect(diagramNodeDepth(nested, 'inner')).toBe(1);
    expect(diagramNodeDepth(nested, 'leaf')).toBe(2);
  });

  it('recognises ancestors, including a node of itself', () => {
    expect(diagramIsAncestor(nested, 'outer', 'leaf')).toBe(true);
    expect(diagramIsAncestor(nested, 'inner', 'leaf')).toBe(true);
    expect(diagramIsAncestor(nested, 'leaf', 'outer')).toBe(false);
    expect(diagramIsAncestor(nested, 'leaf', 'leaf')).toBe(true);
  });

  it('draws containers behind what they hold and keeps ties stable', () => {
    const order = diagramNodesInDrawOrder([
      node('leaf', { shape: 'box', parentId: 'inner' }),
      node('outer', { shape: 'container' }),
      node('inner', { shape: 'container', parentId: 'outer' }),
      node('loose', { shape: 'box' }),
    ]).map((entry) => entry.id);

    expect(order).toEqual(['outer', 'loose', 'inner', 'leaf']);
  });

  it('survives a corrupted cyclic parent chain without hanging', () => {
    const cyclic = [
      node('a', { shape: 'container', parentId: 'b' }),
      node('b', { shape: 'container', parentId: 'a' }),
    ];
    expect(diagramNodeDepth(cyclic, 'a')).toBeGreaterThanOrEqual(0);
    expect(diagramDescendantIds(cyclic, 'a')).toEqual(['b']);
    expect(diagramIsAncestor(cyclic, 'a', 'b')).toBe(true);
  });
});

describe('grouping write contract', () => {
  function artifact(nodes: DiagramNode[]) {
    return { type: 'diagram' as const, nodes, edges: [] };
  }

  it('accepts a node nested in a container', () => {
    const parsed = diagramWriteArtifactSchema.safeParse(
      artifact([node('c1', { shape: 'container' }), node('n1', { shape: 'box', parentId: 'c1' })]),
    );
    expect(parsed.success).toBe(true);
  });

  it('accepts containers nested in containers', () => {
    const parsed = diagramWriteArtifactSchema.safeParse(
      artifact([
        node('outer', { shape: 'container' }),
        node('inner', { shape: 'container', parentId: 'outer' }),
        node('leaf', { shape: 'box', parentId: 'inner' }),
      ]),
    );
    expect(parsed.success).toBe(true);
  });

  it('rejects a parent that does not exist', () => {
    const parsed = diagramWriteArtifactSchema.safeParse(
      artifact([node('n1', { shape: 'box', parentId: 'ghost' })]),
    );
    expect(parsed.success).toBe(false);
  });

  it('rejects a parent that is not a container', () => {
    const parsed = diagramWriteArtifactSchema.safeParse(
      artifact([node('n1', { shape: 'box' }), node('n2', { shape: 'ellipse', parentId: 'n1' })]),
    );
    expect(parsed.success).toBe(false);
  });

  it('rejects a node parented to itself', () => {
    const parsed = diagramWriteArtifactSchema.safeParse(
      artifact([node('c1', { shape: 'container', parentId: 'c1' })]),
    );
    expect(parsed.success).toBe(false);
  });

  it('rejects a nesting cycle', () => {
    const parsed = diagramWriteArtifactSchema.safeParse(
      artifact([
        node('a', { shape: 'container', parentId: 'b' }),
        node('b', { shape: 'container', parentId: 'a' }),
      ]),
    );
    expect(parsed.success).toBe(false);
  });

  it('rejects a longer cycle that no single hop would catch', () => {
    const parsed = diagramWriteArtifactSchema.safeParse(
      artifact([
        node('a', { shape: 'container', parentId: 'c' }),
        node('b', { shape: 'container', parentId: 'a' }),
        node('c', { shape: 'container', parentId: 'b' }),
      ]),
    );
    expect(parsed.success).toBe(false);
  });

  it('accepts every registered shape', () => {
    const parsed = diagramWriteArtifactSchema.safeParse(
      artifact(
        DIAGRAM_NODE_SHAPE_KEYS.map((shape, index) =>
          node(`n${index}`, { shape, x: index * 8, y: 0 }),
        ),
      ),
    );
    expect(parsed.success).toBe(true);
  });

  it('rejects a shape outside the registry', () => {
    const parsed = diagramWriteArtifactSchema.safeParse(
      artifact([node('n1', { shape: 'hexagon' as never })]),
    );
    expect(parsed.success).toBe(false);
  });
});
