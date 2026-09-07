import {
  diagramEdgeGeometry,
  diagramEdgeToPointGeometry,
  type DiagramNode,
} from '@roundtable/shared';
import { diagramWriteArtifactSchema } from '@roundtable/shared/schemas';
import { describe, expect, it } from 'vitest';

import { DIAGRAM_EDGE_LIMIT } from '../artifactLimits';
import {
  DIAGRAM_EDGE_LABEL_LIMIT,
  DIAGRAM_PREVIEW_PADDING,
  addEdge,
  deleteEdge,
  edgeKey,
  normalizeDiagramCoordinates,
  prepareDiagram,
  prepareEdgeLabel,
  renameEdge,
} from './diagramModel';

function buildNodes(count: number): DiagramNode[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `n${index + 1}`,
    label: `Node ${index + 1}`,
    x: index * 80,
    y: 0,
    shape: 'box' as const,
  }));
}

describe('diagram edge model', () => {
  const nodes = buildNodes(3);

  it('adds one directed edge between existing nodes', () => {
    expect(addEdge(nodes, [], 'n1', 'n2')).toEqual({
      ok: true,
      edges: [{ from: 'n1', to: 'n2' }],
      edge: { from: 'n1', to: 'n2' },
    });
  });

  it('rejects missing endpoints, self links, and duplicate directions', () => {
    expect(addEdge(nodes, [], 'n1', 'missing')).toEqual({
      ok: false,
      error: 'Choose two existing elements to connect.',
    });
    expect(addEdge(nodes, [], 'n1', 'n1')).toEqual({
      ok: false,
      error: 'Connect two different elements.',
    });
    expect(addEdge(nodes, [{ from: 'n1', to: 'n2' }], 'n1', 'n2')).toEqual({
      ok: false,
      error: 'These elements are already connected in that direction.',
    });
    expect(addEdge(nodes, [{ from: 'n1', to: 'n2' }], 'n2', 'n1').ok).toBe(true);
  });

  it('refuses to exceed the shared edge cap', () => {
    const manyNodes = buildNodes(DIAGRAM_EDGE_LIMIT + 2);
    const edges = Array.from({ length: DIAGRAM_EDGE_LIMIT }, (_, index) => ({
      from: manyNodes[index]?.id ?? '',
      to: manyNodes[index + 1]?.id ?? '',
    }));

    expect(addEdge(manyNodes, edges, 'n1', 'n3')).toEqual({
      ok: false,
      error: `A diagram can hold ${DIAGRAM_EDGE_LIMIT} arrows at most.`,
    });
  });

  it('edits and removes an edge label without changing its endpoints', () => {
    const edge = { from: 'n1', to: 'n2' };
    const labelled = renameEdge([edge], edge, '  calls   API  ');
    expect(labelled).toEqual([{ ...edge, label: '  calls   API  ' }]);
    expect(prepareEdgeLabel('  calls   API  ')).toBe('calls API');
    expect(prepareEdgeLabel('a'.repeat(80))).toHaveLength(DIAGRAM_EDGE_LABEL_LIMIT);
    expect(renameEdge(labelled, edge, '')).toEqual([edge]);
    expect(deleteEdge(labelled, edge)).toEqual([]);
  });

  it('uses collision-safe keys for arbitrary endpoint ids', () => {
    expect(edgeKey({ from: 'a>b', to: 'c' })).not.toBe(edgeKey({ from: 'a', to: 'b>c' }));
  });
});

describe('diagram coordinate normalization', () => {
  it('moves minimum coordinates to preview padding without changing relative layout', () => {
    const nodes: DiagramNode[] = [
      { id: 'n1', label: 'One', x: 400, y: 320, shape: 'box' },
      { id: 'n2', label: 'Two', x: 640, y: 480, shape: 'text' },
    ];
    const normalized = normalizeDiagramCoordinates(nodes);

    expect(normalized[0]).toMatchObject({
      x: DIAGRAM_PREVIEW_PADDING,
      y: DIAGRAM_PREVIEW_PADDING,
    });
    expect(normalized[1]).toMatchObject({
      x: DIAGRAM_PREVIEW_PADDING + 240,
      y: DIAGRAM_PREVIEW_PADDING + 160,
    });
    expect(normalized.map(({ id, label, shape }) => ({ id, label, shape }))).toEqual(
      nodes.map(({ id, label, shape }) => ({ id, label, shape })),
    );
  });

  it('does not push edge-to-edge content beyond the editor canvas', () => {
    const normalized = normalizeDiagramCoordinates([
      { id: 'left', label: 'Left', x: 0, y: 0, shape: 'box' },
      { id: 'right', label: 'Right', x: 840, y: 544, shape: 'box' },
    ]);

    expect(normalized).toEqual([
      { id: 'left', label: 'Left', x: 0, y: 0, shape: 'box' },
      { id: 'right', label: 'Right', x: 840, y: 544, shape: 'box' },
    ]);
  });
});

describe('diagram edge validation at submission', () => {
  const nodes = buildNodes(2);

  it('rejects invalid edge references in the shared server schema', () => {
    expect(
      diagramWriteArtifactSchema.safeParse({
        type: 'diagram',
        nodes,
        edges: [{ from: 'n1', to: 'missing' }],
      }).success,
    ).toBe(false);
    expect(
      diagramWriteArtifactSchema.safeParse({
        type: 'diagram',
        nodes,
        edges: [
          { from: 'n1', to: 'n2' },
          { from: 'n1', to: 'n2' },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate node ids, dangling arrows, and duplicate arrows', () => {
    expect(prepareDiagram([nodes[0]!, { ...nodes[1]!, id: 'n1' }], [])).toEqual({
      ok: false,
      error: 'Every diagram element must have a unique id.',
    });
    expect(prepareDiagram(nodes, [{ from: 'n1', to: 'missing' }])).toEqual({
      ok: false,
      error: 'Every arrow must connect two existing elements.',
    });
    expect(
      prepareDiagram(nodes, [
        { from: 'n1', to: 'n2' },
        { from: 'n1', to: 'n2' },
      ]),
    ).toEqual({ ok: false, error: 'A diagram cannot contain duplicate arrows.' });
  });

  it('normalizes labels and coordinates into a real shared-schema artifact', () => {
    const prepared = prepareDiagram(
      [
        { id: 'n1', label: ' Client ', x: 400, y: 320, shape: 'box' },
        { id: 'n2', label: ' Server ', x: 640, y: 320, shape: 'container' },
      ],
      [{ from: 'n1', to: 'n2', label: '  calls   into  ' }],
    );

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(diagramWriteArtifactSchema.safeParse(prepared.artifact).success).toBe(true);
    expect(prepared.artifact.nodes[0]).toMatchObject({
      label: 'Client',
      x: DIAGRAM_PREVIEW_PADDING,
      y: DIAGRAM_PREVIEW_PADDING,
    });
    expect(prepared.artifact.edges).toEqual([{ from: 'n1', to: 'n2', label: 'calls into' }]);
  });
});

describe('straight edge geometry', () => {
  it('meets the right and left boundaries of horizontal variable-size nodes', () => {
    expect(
      diagramEdgeGeometry({ x: 0, y: 100, shape: 'box' }, { x: 320, y: 72, shape: 'container' }),
    ).toMatchObject({ x1: 120, y1: 128, x2: 320, y2: 128, labelX: 220, labelY: 120 });
  });

  it('uses legacy node dimensions when shape is absent', () => {
    const geometry = diagramEdgeGeometry(
      { x: 0, y: 0, shape: undefined },
      { x: 172, y: 0, shape: undefined },
    );

    expect(geometry).toMatchObject({ x1: 72, y1: 16, x2: 172, y2: 16 });
  });

  it('starts a live preview at the source boundary and ends at the pointer', () => {
    expect(
      diagramEdgeToPointGeometry({ x: 20, y: 40, shape: 'box' }, { x: 300, y: 68 }),
    ).toMatchObject({ x1: 140, y1: 68, x2: 300, y2: 68 });
  });
});
