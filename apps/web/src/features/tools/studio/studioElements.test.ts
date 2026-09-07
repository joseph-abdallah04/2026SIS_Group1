import { describe, expect, it } from 'vitest';
import {
  diagramEdgeKey,
  inkPoints,
  inkStrokeColor,
  inkStrokeWidth,
  packInkPoints,
  reorderStudioElements,
  simplifyStrokePoints,
  strokePathData,
  studioPaintOrder,
  type DiagramEdge,
  type DiagramNode,
  type InkElement,
} from '@roundtable/shared';

import { eraseInkAtPoint, type StudioInkStroke } from './studioInk';
import { diagramArtifactSchema, diagramWriteArtifactSchema } from '@roundtable/shared/schemas';

const box = (id: string, extra: Partial<DiagramNode> = {}): DiagramNode => ({
  id,
  label: id,
  x: 0,
  y: 0,
  ...extra,
});

/** A stored stroke: points packed, as they are on the wire. */
const stroke = (id: string, extra: Partial<InkElement> = {}): InkElement => ({
  id,
  points: [0, 0, 10, 10],
  ...extra,
});

/** A stroke mid-edit, as the editor holds it. */
const editorStroke = (id: string, points: { x: number; y: number }[]): StudioInkStroke => ({
  id,
  points,
});

const edge = (from: string, to: string): DiagramEdge => ({ from, to });

describe('studio paint order', () => {
  it('reproduces the pre-v4 order when the artifact carries none', () => {
    const artifact = {
      nodes: [box('outer', { shape: 'container' as const }), box('inner', { parentId: 'outer' })],
      edges: [edge('outer', 'inner')],
    };

    // Edges first, then a container behind what it holds — exactly what
    // `diagramNodesInDrawOrder` produced before `z` existed.
    expect(studioPaintOrder(artifact).map((ref) => ref.key)).toEqual([
      diagramEdgeKey(edge('outer', 'inner')),
      'outer',
      'inner',
    ]);
  });

  it('puts ink on top of a diagram that has never been reordered', () => {
    const artifact = { nodes: [box('n1')], edges: [], ink: [stroke('ink-1')] };
    expect(studioPaintOrder(artifact).map((ref) => ref.key)).toEqual(['n1', 'ink-1']);
  });

  it('paints in the order z gives, so ink can sit under a shape', () => {
    const artifact = {
      nodes: [box('n1')],
      edges: [],
      ink: [stroke('ink-1')],
      z: ['ink-1', 'n1'],
    };
    expect(studioPaintOrder(artifact).map((ref) => ref.key)).toEqual(['ink-1', 'n1']);
  });

  it('appends what a partial order leaves out rather than dropping it', () => {
    // A build that knew about an element kind this one does not would write a
    // `z` naming it. The elements this build can draw must still all be drawn.
    const artifact = {
      nodes: [box('n1'), box('n2')],
      edges: [],
      ink: [stroke('ink-1')],
      z: ['ink-1'],
    };
    expect(studioPaintOrder(artifact).map((ref) => ref.key)).toEqual(['ink-1', 'n1', 'n2']);
  });

  it('reports each element with the kind it is, so the renderer can switch on it', () => {
    const artifact = { nodes: [box('n1')], edges: [edge('n1', 'n1')], ink: [stroke('ink-1')] };
    expect(studioPaintOrder(artifact).map((ref) => ref.kind)).toEqual(['edge', 'node', 'ink']);
  });
});

describe('reorderStudioElements', () => {
  const order = [
    { kind: 'node' as const, key: 'a' },
    { kind: 'node' as const, key: 'b' },
    { kind: 'ink' as const, key: 'ink-1' },
  ];

  it('raises a selection above everything else', () => {
    expect(reorderStudioElements(order, new Set(['a']), 'front')).toEqual(['b', 'ink-1', 'a']);
  });

  it('drops a selection below everything else', () => {
    expect(reorderStudioElements(order, new Set(['ink-1']), 'back')).toEqual(['ink-1', 'a', 'b']);
  });

  it('keeps a moved group in its own order, so a container stays ahead of its contents', () => {
    expect(reorderStudioElements(order, new Set(['a', 'b']), 'front')).toEqual(['ink-1', 'a', 'b']);
  });

  it('returns a complete order even when nothing moves', () => {
    expect(reorderStudioElements(order, new Set(), 'front')).toEqual(['a', 'b', 'ink-1']);
  });
});

describe('ink geometry', () => {
  it('paints a single-point stroke as a dot rather than nothing', () => {
    expect(strokePathData([{ x: 3, y: 4 }])).toBe('M 3 4 l 0.1 0');
  });

  it('round-trips points through the packed storage form', () => {
    const points = [
      { x: 12.34, y: 56.78 },
      { x: 90, y: 1 },
    ];
    // One decimal place, which is finer than a pen stroke reads at.
    expect(packInkPoints(points)).toEqual([12.3, 56.8, 90, 1]);
    expect(inkPoints({ points: packInkPoints(points) })).toEqual([
      { x: 12.3, y: 56.8 },
      { x: 90, y: 1 },
    ]);
  });

  it('drops sampling noise but keeps the ends of the stroke', () => {
    const noisy = [
      { x: 0, y: 0 },
      { x: 10, y: 0.1 },
      { x: 20, y: 0 },
      { x: 30, y: 0.1 },
      { x: 40, y: 0 },
    ];
    const simplified = simplifyStrokePoints(noisy);
    expect(simplified.length).toBeLessThan(noisy.length);
    expect(simplified.at(0)).toEqual({ x: 0, y: 0 });
    expect(simplified.at(-1)).toEqual({ x: 40, y: 0 });
  });

  it('erases a whole stroke the eraser touches and leaves the rest', () => {
    const near = editorStroke('ink-near', [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]);
    const far = editorStroke('ink-far', [
      { x: 500, y: 500 },
      { x: 510, y: 510 },
    ]);
    expect(eraseInkAtPoint([near, far], { x: 5, y: 5 }, 4)).toEqual([far]);
  });

  it('falls back to the default pen when a stroke carries no style', () => {
    // A stroke written by a build with a wider palette loads with `strokeColor`
    // dropped by the read schema, and still has to draw.
    expect(inkStrokeColor({})).toBe('#080C15');
    expect(inkStrokeWidth({})).toBe(8);
  });
});

describe('v4 contract', () => {
  const legacy = { type: 'diagram' as const, nodes: [box('n1')], edges: [] };

  it('parses a pre-v4 diagram unchanged, with no ink and no order', () => {
    const parsed = diagramArtifactSchema.parse(legacy);
    expect(parsed.ink).toBeUndefined();
    expect(parsed.z).toBeUndefined();
  });

  it('keeps a stroke whose palette key this build does not know, at the default', () => {
    const parsed = diagramArtifactSchema.parse({
      ...legacy,
      ink: [{ ...stroke('ink-1'), strokeColor: 'ultraviolet' }],
    });
    expect(parsed.ink?.[0]?.strokeColor).toBeUndefined();
    expect(parsed.ink?.[0]?.id).toBe('ink-1');
  });

  it('degrades an unreadable ink array to no ink rather than failing the board', () => {
    const parsed = diagramArtifactSchema.parse({ ...legacy, ink: 'not an array' });
    expect(parsed.ink).toBeUndefined();
    expect(parsed.nodes).toHaveLength(1);
  });

  it('accepts a sketch with no shapes at all', () => {
    expect(
      diagramWriteArtifactSchema.safeParse({
        type: 'diagram',
        nodes: [],
        edges: [],
        ink: [stroke('ink-1')],
      }).success,
    ).toBe(true);
  });

  it('rejects two strokes sharing an id', () => {
    const result = diagramWriteArtifactSchema.safeParse({
      ...legacy,
      ink: [stroke('ink-1'), stroke('ink-1')],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a stroke that reuses a node id, because z is one flat namespace', () => {
    const result = diagramWriteArtifactSchema.safeParse({ ...legacy, ink: [stroke('n1')] });
    expect(result.success).toBe(false);
  });

  it('rejects an order naming something the diagram does not contain', () => {
    const result = diagramWriteArtifactSchema.safeParse({ ...legacy, z: ['n1', 'ghost'] });
    expect(result.success).toBe(false);
  });

  it('rejects an element listed in the order twice', () => {
    const result = diagramWriteArtifactSchema.safeParse({ ...legacy, z: ['n1', 'n1'] });
    expect(result.success).toBe(false);
  });

  it('rejects a container painted after the node it holds', () => {
    // No editor gesture can produce this — a crafted payload can, and it would
    // hide the contents behind their own backdrop.
    const result = diagramWriteArtifactSchema.safeParse({
      type: 'diagram',
      nodes: [box('outer', { shape: 'container' }), box('inner', { parentId: 'outer' })],
      edges: [],
      z: ['inner', 'outer'],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a container painted before the node it holds', () => {
    const result = diagramWriteArtifactSchema.safeParse({
      type: 'diagram',
      nodes: [box('outer', { shape: 'container' }), box('inner', { parentId: 'outer' })],
      edges: [],
      z: ['outer', 'inner'],
    });
    expect(result.success).toBe(true);
  });
});
