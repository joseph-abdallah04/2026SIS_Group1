import type {
  DiagramArtifact,
  DiagramEdge,
  DiagramNode,
  DiagramNodeShape,
} from '@roundtable/shared';
import { diagramNodeSize } from '@roundtable/shared';
import { diagramArtifactSchema } from '@roundtable/shared/schemas';

import { DIAGRAM_EDGE_LIMIT, DIAGRAM_NODE_LIMIT } from '../artifactLimits';

export const DIAGRAM_NODE_SHAPES = ['box', 'container', 'text'] as const;

export const DIAGRAM_SHAPE_LABELS: Record<DiagramNodeShape, string> = {
  box: 'Box',
  container: 'Container',
  text: 'Text',
};

export const DIAGRAM_NODE_WIDTH = diagramNodeSize('box').width;
export const DIAGRAM_NODE_HEIGHT = diagramNodeSize('box').height;
export const DIAGRAM_CANVAS_WIDTH = 960;
export const DIAGRAM_CANVAS_HEIGHT = 600;

// Eight units keeps hand-placed nodes tidy without feeling magnetic.
export const DIAGRAM_GRID = 8;

// Twenty-four characters remain editable while SVG text fitting keeps every fixed shape readable.
export const DIAGRAM_LABEL_LIMIT = 24;

// Edge labels use the same compact preview typography as node labels.
export const DIAGRAM_EDGE_LABEL_LIMIT = 24;

// Translation-only normalization removes unused top/left space without distorting layout.
export const DIAGRAM_PREVIEW_PADDING = 24;

const NODE_GAP = 24;

export type PreparedDiagram =
  { ok: true; artifact: DiagramArtifact } | { ok: false; error: string };

export type AddNodeResult =
  { ok: true; nodes: DiagramNode[]; addedId: string } | { ok: false; error: string };

export type AddEdgeResult =
  { ok: true; edges: DiagramEdge[]; edge: DiagramEdge } | { ok: false; error: string };

export interface DiagramPoint {
  x: number;
  y: number;
}

export interface DiagramSurfaceBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function snapToGrid(value: number): number {
  return Math.round(value / DIAGRAM_GRID) * DIAGRAM_GRID;
}

function clampPositionForSize(
  point: DiagramPoint,
  size: { width: number; height: number },
): DiagramPoint {
  return {
    x: Math.min(DIAGRAM_CANVAS_WIDTH - size.width, Math.max(0, point.x)),
    y: Math.min(DIAGRAM_CANVAS_HEIGHT - size.height, Math.max(0, point.y)),
  };
}

function snapPositionForSize(
  point: DiagramPoint,
  size: { width: number; height: number },
): DiagramPoint {
  const clamped = clampPositionForSize(point, size);
  return clampPositionForSize({ x: snapToGrid(clamped.x), y: snapToGrid(clamped.y) }, size);
}

export function clampNodePosition(
  point: DiagramPoint,
  shape: DiagramNodeShape = 'box',
): DiagramPoint {
  return clampPositionForSize(point, diagramNodeSize(shape));
}

export function snapNodePosition(
  point: DiagramPoint,
  shape: DiagramNodeShape = 'box',
): DiagramPoint {
  return snapPositionForSize(point, diagramNodeSize(shape));
}

export function clientPointToDiagramPoint(
  clientPoint: DiagramPoint,
  bounds: DiagramSurfaceBounds,
): DiagramPoint {
  if (bounds.width <= 0 || bounds.height <= 0) return { x: 0, y: 0 };
  return {
    x: ((clientPoint.x - bounds.left) / bounds.width) * DIAGRAM_CANVAS_WIDTH,
    y: ((clientPoint.y - bounds.top) / bounds.height) * DIAGRAM_CANVAS_HEIGHT,
  };
}

export function createNodeId(existing: readonly DiagramNode[]): string {
  const taken = new Set(existing.map((node) => node.id));
  let index = existing.length + 1;
  while (taken.has(`n${index}`)) index += 1;
  return `n${index}`;
}

export function prepareNodeLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, DIAGRAM_LABEL_LIMIT);
}

export function prepareEdgeLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, DIAGRAM_EDGE_LABEL_LIMIT);
}

export function edgeKey(edge: Pick<DiagramEdge, 'from' | 'to'>): string {
  return JSON.stringify([edge.from, edge.to]);
}

function isFree(
  nodes: readonly DiagramNode[],
  candidate: DiagramPoint,
  shape: DiagramNodeShape,
): boolean {
  const candidateSize = diagramNodeSize(shape);
  return nodes.every((node) => {
    const nodeSize = diagramNodeSize(node.shape);
    return (
      candidate.x + candidateSize.width + NODE_GAP <= node.x ||
      node.x + nodeSize.width + NODE_GAP <= candidate.x ||
      candidate.y + candidateSize.height + NODE_GAP <= node.y ||
      node.y + nodeSize.height + NODE_GAP <= candidate.y
    );
  });
}

export function findFreeNodePosition(
  nodes: readonly DiagramNode[],
  shape: DiagramNodeShape,
): DiagramPoint {
  // Box-sized steps are only search hints; actual overlap and bounds use each node's shape.
  const columnStep = DIAGRAM_NODE_WIDTH + NODE_GAP;
  const rowStep = DIAGRAM_NODE_HEIGHT + NODE_GAP;
  const columns = Math.max(1, Math.floor(DIAGRAM_CANVAS_WIDTH / columnStep));
  const rows = Math.max(1, Math.floor(DIAGRAM_CANVAS_HEIGHT / rowStep));

  for (let index = 0; index < columns * rows; index += 1) {
    const candidate = snapNodePosition(
      {
        x: (index % columns) * columnStep + NODE_GAP,
        y: Math.floor(index / columns) * rowStep + NODE_GAP,
      },
      shape,
    );
    if (isFree(nodes, candidate, shape)) return candidate;
  }

  return snapNodePosition({ x: NODE_GAP, y: NODE_GAP }, shape);
}

export function addNode(
  nodes: readonly DiagramNode[],
  shape: DiagramNodeShape,
  at?: DiagramPoint,
): AddNodeResult {
  if (nodes.length >= DIAGRAM_NODE_LIMIT) {
    return { ok: false, error: `A diagram can hold ${DIAGRAM_NODE_LIMIT} elements at most.` };
  }

  const id = createNodeId(nodes);
  const position = at ? snapNodePosition(at, shape) : findFreeNodePosition(nodes, shape);
  const node: DiagramNode = {
    id,
    label: DIAGRAM_SHAPE_LABELS[shape],
    x: position.x,
    y: position.y,
    shape,
  };

  return { ok: true, nodes: [...nodes, node], addedId: id };
}

export function moveNode(
  nodes: readonly DiagramNode[],
  id: string,
  at: DiagramPoint,
): DiagramNode[] {
  return nodes.map((node) =>
    node.id === id ? { ...node, ...snapPositionForSize(at, diagramNodeSize(node.shape)) } : node,
  );
}

export function renameNode(
  nodes: readonly DiagramNode[],
  id: string,
  label: string,
): DiagramNode[] {
  const nextLabel = label.slice(0, DIAGRAM_LABEL_LIMIT);
  return nodes.map((node) => (node.id === id ? { ...node, label: nextLabel } : node));
}

export function deleteNode(nodes: readonly DiagramNode[], id: string): DiagramNode[] {
  return nodes.filter((node) => node.id !== id);
}

export function deleteNodeWithEdges(
  nodes: readonly DiagramNode[],
  edges: readonly DiagramEdge[],
  id: string,
): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  return {
    nodes: deleteNode(nodes, id),
    edges: edges.filter((edge) => edge.from !== id && edge.to !== id),
  };
}

export function addEdge(
  nodes: readonly DiagramNode[],
  edges: readonly DiagramEdge[],
  from: string,
  to: string,
): AddEdgeResult {
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (!nodeIds.has(from) || !nodeIds.has(to)) {
    return { ok: false, error: 'Choose two existing elements to connect.' };
  }
  if (from === to) {
    return { ok: false, error: 'Connect two different elements.' };
  }
  if (edges.some((edge) => edge.from === from && edge.to === to)) {
    return { ok: false, error: 'These elements are already connected in that direction.' };
  }
  if (edges.length >= DIAGRAM_EDGE_LIMIT) {
    return { ok: false, error: `A diagram can hold ${DIAGRAM_EDGE_LIMIT} arrows at most.` };
  }

  const edge: DiagramEdge = { from, to };
  return { ok: true, edges: [...edges, edge], edge };
}

export function renameEdge(
  edges: readonly DiagramEdge[],
  target: Pick<DiagramEdge, 'from' | 'to'>,
  label: string,
): DiagramEdge[] {
  const nextLabel = label.slice(0, DIAGRAM_EDGE_LABEL_LIMIT);
  return edges.map((edge) => {
    if (edge.from !== target.from || edge.to !== target.to) return edge;
    return nextLabel ? { ...edge, label: nextLabel } : { from: edge.from, to: edge.to };
  });
}

export function deleteEdge(
  edges: readonly DiagramEdge[],
  target: Pick<DiagramEdge, 'from' | 'to'>,
): DiagramEdge[] {
  return edges.filter((edge) => edge.from !== target.from || edge.to !== target.to);
}

export function autoLayoutNodes(nodes: readonly DiagramNode[]): DiagramNode[] {
  if (nodes.length === 0) return [];

  const largestWidth = Math.max(...nodes.map((node) => diagramNodeSize(node.shape).width));
  const largestHeight = Math.max(...nodes.map((node) => diagramNodeSize(node.shape).height));
  const columns = Math.min(
    Math.ceil(Math.sqrt(nodes.length)),
    Math.max(1, Math.floor(DIAGRAM_CANVAS_WIDTH / (largestWidth + NODE_GAP))),
  );
  const rows = Math.ceil(nodes.length / columns);
  const horizontalGap = Math.max(
    DIAGRAM_GRID,
    (DIAGRAM_CANVAS_WIDTH - columns * largestWidth) / (columns + 1),
  );
  const verticalGap = Math.max(
    DIAGRAM_GRID,
    (DIAGRAM_CANVAS_HEIGHT - rows * largestHeight) / (rows + 1),
  );

  return nodes.map((node, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      ...node,
      ...snapPositionForSize(
        {
          x: horizontalGap + column * (largestWidth + horizontalGap),
          y: verticalGap + row * (largestHeight + verticalGap),
        },
        diagramNodeSize(node.shape),
      ),
    };
  });
}

export function normalizeDiagramCoordinates(nodes: readonly DiagramNode[]): DiagramNode[] {
  if (nodes.length === 0) return [];
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxRight = Math.max(...nodes.map((node) => node.x + diagramNodeSize(node.shape).width));
  const maxBottom = Math.max(...nodes.map((node) => node.y + diagramNodeSize(node.shape).height));
  const deltaX = Math.min(DIAGRAM_PREVIEW_PADDING - minX, DIAGRAM_CANVAS_WIDTH - maxRight);
  const deltaY = Math.min(DIAGRAM_PREVIEW_PADDING - minY, DIAGRAM_CANVAS_HEIGHT - maxBottom);

  return nodes.map((node) => ({
    ...node,
    x: Math.round(node.x + deltaX),
    y: Math.round(node.y + deltaY),
  }));
}

export function prepareDiagram(
  nodes: readonly DiagramNode[],
  edges: readonly DiagramEdge[],
): PreparedDiagram {
  if (nodes.length === 0) {
    return { ok: false, error: 'Add at least one element before proposing this diagram.' };
  }

  const normalizedNodes = nodes.map((node) => ({
    ...node,
    label: prepareNodeLabel(node.label),
  }));

  if (normalizedNodes.some((node) => !node.label)) {
    return { ok: false, error: 'Give every element a label before proposing.' };
  }

  const nodeIds = new Set(normalizedNodes.map((node) => node.id));
  if (nodeIds.size !== normalizedNodes.length) {
    return { ok: false, error: 'Every diagram element must have a unique id.' };
  }

  if (edges.some((edge) => !nodeIds.has(edge.from) || !nodeIds.has(edge.to))) {
    return { ok: false, error: 'Every arrow must connect two existing elements.' };
  }

  const uniqueEdges = new Set(edges.map(edgeKey));
  if (uniqueEdges.size !== edges.length) {
    return { ok: false, error: 'A diagram cannot contain duplicate arrows.' };
  }

  const normalizedEdges = edges.map((edge) => {
    const label = edge.label ? prepareEdgeLabel(edge.label) : '';
    return label ? { ...edge, label } : { from: edge.from, to: edge.to };
  });

  const parsed = diagramArtifactSchema.safeParse({
    type: 'diagram',
    nodes: normalizeDiagramCoordinates(normalizedNodes),
    edges: normalizedEdges,
  });
  if (!parsed.success) {
    return { ok: false, error: 'This diagram could not be prepared. Simplify it and try again.' };
  }

  return { ok: true, artifact: parsed.data };
}
