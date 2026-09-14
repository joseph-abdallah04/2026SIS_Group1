import type {
  ArrowElement,
  ArrowEndpoint,
  DiagramArtifact,
  DiagramEdge,
  DiagramNode,
  DiagramNodeShape,
  DiagramNodeSize,
  PathElement,
  TableElement,
} from '@roundtable/shared';
import {
  DIAGRAM_NODE_SHAPE_KEYS,
  DIAGRAM_MAX_NODE_HEIGHT,
  DIAGRAM_MAX_NODE_WIDTH,
  DIAGRAM_MIN_NODE_HEIGHT,
  DIAGRAM_MIN_NODE_WIDTH,
  diagramCanParent,
  diagramDescendantIds,
  diagramEdgeKey,
  diagramIsAncestor,
  diagramNodeSize,
  effectiveDiagramNodeSize,
  offsetArrow,
  tableSize,
} from '@roundtable/shared';
import { diagramWriteArtifactSchema } from '@roundtable/shared/schemas';

import { DIAGRAM_EDGE_LIMIT, DIAGRAM_NODE_LIMIT } from '../artifactLimits';
import {
  alignOffsets,
  distributeOffsets,
  type ArrangeBox,
  type ArrangeOffset,
} from '../studio/studioArrange';
import { inkToData, type StudioInkStroke } from '../studio/studioInk';

export const DIAGRAM_NODE_SHAPES = DIAGRAM_NODE_SHAPE_KEYS;

// Palette drags carry the shape in a private media type so unrelated drops
// (files, text from other apps) are ignored by the canvas.
export const DIAGRAM_SHAPE_MEDIA_TYPE = 'application/x-roundtable-diagram-shape';

export const DIAGRAM_SHAPE_LABELS: Record<DiagramNodeShape, string> = {
  box: 'Rounded rectangle',
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  diamond: 'Decision',
  triangle: 'Triangle',
  cylinder: 'Database',
  container: 'Dotted rectangle',
  text: 'Text',
};

/**
 * The order the shape palette offers them in, most-reached first. Separate from
 * `DIAGRAM_NODE_SHAPE_KEYS`, which is the contract's order and must not shuffle
 * under stored diagrams. Text is absent: it has its own button on the rail.
 */
export const DIAGRAM_SHAPE_PALETTE_ORDER = [
  'rectangle',
  'box',
  'ellipse',
  'diamond',
  'triangle',
  'cylinder',
  'container',
] as const satisfies readonly DiagramNodeShape[];

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

export interface DiagramRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// The unzoomed view: the whole fixed sheet.
export const DIAGRAM_FULL_VIEW_BOX: DiagramRect = {
  x: 0,
  y: 0,
  width: DIAGRAM_CANVAS_WIDTH,
  height: DIAGRAM_CANVAS_HEIGHT,
};

export type DiagramAlignMode = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';
export type DiagramDistributeAxis = 'horizontal' | 'vertical';
export type DiagramResizeCorner = 'nw' | 'ne' | 'se' | 'sw';

export type DiagramNodeStyle = Partial<
  Pick<DiagramNode, 'fillColor' | 'strokeColor' | 'strokeWidthPreset' | 'fontSizePreset'>
>;

export type DiagramEdgeStyle = Partial<
  Pick<DiagramEdge, 'strokeColor' | 'strokeWidthPreset' | 'strokeStyle'>
>;

export type PasteFragment = { nodes: DiagramNode[]; edges: DiagramEdge[] };

export type PasteResult =
  | { ok: true; nodes: DiagramNode[]; edges: DiagramEdge[]; addedIds: string[] }
  | { ok: false; error: string };

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

// With snapping off, positions still stay whole numbers inside the sheet so the
// artifact never carries drifting floats or out-of-bounds coordinates.
// Takes a resolved size rather than a shape: a legacy node keeps the smaller
// 72x32 bounds `diagramNodeSize(undefined)` gives it, and a resized node is
// clamped against the size it actually stores.
export function placeNodePosition(
  point: DiagramPoint,
  size: DiagramNodeSize,
  snap = true,
): DiagramPoint {
  if (snap) return snapPositionForSize(point, size);
  const clamped = clampPositionForSize(point, size);
  return { x: Math.round(clamped.x), y: Math.round(clamped.y) };
}

// `viewBox` is the currently visible slice of the sheet, so screen coordinates
// stay correct under zoom and pan.
/**
 * How the scene is laid into the surface.
 *
 * The canvas fills the window, and the scene has a shape of its own, so the two
 * rarely match: SVG scales the view uniformly to fit and centres what is left
 * over. Every conversion between the two spaces has to account for that margin,
 * and gets it from here rather than working it out again.
 */
export function diagramSurfaceFit(
  bounds: DiagramSurfaceBounds,
  viewBox: DiagramRect,
): { scale: number; offsetX: number; offsetY: number } {
  if (bounds.width <= 0 || bounds.height <= 0 || viewBox.width <= 0 || viewBox.height <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }
  const scale = Math.min(bounds.width / viewBox.width, bounds.height / viewBox.height);
  return {
    scale,
    offsetX: (bounds.width - viewBox.width * scale) / 2,
    offsetY: (bounds.height - viewBox.height * scale) / 2,
  };
}

export function clientPointToDiagramPoint(
  clientPoint: DiagramPoint,
  bounds: DiagramSurfaceBounds,
  viewBox: DiagramRect = DIAGRAM_FULL_VIEW_BOX,
): DiagramPoint {
  if (bounds.width <= 0 || bounds.height <= 0) return { x: viewBox.x, y: viewBox.y };
  const { scale, offsetX, offsetY } = diagramSurfaceFit(bounds, viewBox);
  return {
    x: viewBox.x + (clientPoint.x - bounds.left - offsetX) / scale,
    y: viewBox.y + (clientPoint.y - bounds.top - offsetY) / scale,
  };
}

/**
 * The reverse: a rectangle in scene units, in the surface's own client space.
 * The properties bar needs it to know where the selection actually appears.
 */
export function diagramRectToClientRect(
  rect: DiagramRect,
  bounds: DiagramSurfaceBounds,
  viewBox: DiagramRect = DIAGRAM_FULL_VIEW_BOX,
): DiagramRect {
  if (viewBox.width <= 0 || viewBox.height <= 0) return { x: 0, y: 0, width: 0, height: 0 };
  const { scale, offsetX, offsetY } = diagramSurfaceFit(bounds, viewBox);
  return {
    x: bounds.left + offsetX + (rect.x - viewBox.x) * scale,
    y: bounds.top + offsetY + (rect.y - viewBox.y) * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}

export function nodeBounds(node: DiagramNode): DiagramRect {
  const size = effectiveDiagramNodeSize(node);
  return { x: node.x, y: node.y, width: size.width, height: size.height };
}

export function normalizeRect(a: DiagramPoint, b: DiagramPoint): DiagramRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

// Marquee selection takes anything the rectangle touches, matching how design
// tools behave when you sweep across a dense diagram.
export function nodeIdsInRect(nodes: readonly DiagramNode[], rect: DiagramRect): string[] {
  return nodes
    .filter((node) => {
      const bounds = nodeBounds(node);
      return (
        bounds.x <= rect.x + rect.width &&
        rect.x <= bounds.x + bounds.width &&
        bounds.y <= rect.y + rect.height &&
        rect.y <= bounds.y + bounds.height
      );
    })
    .map((node) => node.id);
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

/**
 * Re-exported from `@roundtable/shared`: `z` (v4 paint order) names edges by
 * this key, so the schema that validates an order and the editor that writes
 * one have to agree on the format. One definition, shared.
 */
export const edgeKey = diagramEdgeKey;

function isFree(
  nodes: readonly DiagramNode[],
  candidate: DiagramPoint,
  shape: DiagramNodeShape,
): boolean {
  const candidateSize = diagramNodeSize(shape);
  return nodes.every((node) => {
    const nodeSize = effectiveDiagramNodeSize(node);
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
    const candidate = snapPositionForSize(
      {
        x: (index % columns) * columnStep + NODE_GAP,
        y: Math.floor(index / columns) * rowStep + NODE_GAP,
      },
      diagramNodeSize(shape),
    );
    if (isFree(nodes, candidate, shape)) return candidate;
  }

  return snapPositionForSize({ x: NODE_GAP, y: NODE_GAP }, diagramNodeSize(shape));
}

export function addNode(
  nodes: readonly DiagramNode[],
  shape: DiagramNodeShape,
  at?: DiagramPoint,
  snap = true,
): AddNodeResult {
  if (nodes.length >= DIAGRAM_NODE_LIMIT) {
    return { ok: false, error: `A diagram can hold ${DIAGRAM_NODE_LIMIT} elements at most.` };
  }

  const id = createNodeId(nodes);
  const position = at
    ? placeNodePosition(at, diagramNodeSize(shape), snap)
    : findFreeNodePosition(nodes, shape);
  const node: DiagramNode = {
    id,
    // Empty, not named after its shape: the first thing anyone does with a new
    // element is type into it, and pre-filling means selecting the text first.
    label: '',
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
  snap = true,
): DiagramNode[] {
  return nodes.map((node) =>
    node.id === id
      ? { ...node, ...placeNodePosition(at, effectiveDiagramNodeSize(node), snap) }
      : node,
  );
}

// Dragging a multi-selection moves one rigid group: the delta is snapped against
// the anchor node and clamped so the whole selection stays on the sheet, which
// keeps the relative positions the author arranged.
export function moveNodesBy(
  nodes: readonly DiagramNode[],
  origins: Readonly<Record<string, DiagramPoint>>,
  delta: DiagramPoint,
  anchorId: string,
  snap = true,
): DiagramNode[] {
  const anchorOrigin = origins[anchorId];
  if (!anchorOrigin) return [...nodes];

  const anchorNode = nodes.find((node) => node.id === anchorId);
  const anchorTarget = placeNodePosition(
    { x: anchorOrigin.x + delta.x, y: anchorOrigin.y + delta.y },
    anchorNode ? effectiveDiagramNodeSize(anchorNode) : diagramNodeSize(undefined),
    snap,
  );
  let applied = { x: anchorTarget.x - anchorOrigin.x, y: anchorTarget.y - anchorOrigin.y };

  for (const node of nodes) {
    const origin = origins[node.id];
    if (!origin) continue;
    const size = effectiveDiagramNodeSize(node);
    applied = {
      x: Math.min(DIAGRAM_CANVAS_WIDTH - size.width - origin.x, Math.max(-origin.x, applied.x)),
      y: Math.min(DIAGRAM_CANVAS_HEIGHT - size.height - origin.y, Math.max(-origin.y, applied.y)),
    };
  }

  // Only the anchor is snapped. Re-snapping each member individually would pull
  // them onto different grid cells and quietly deform the arrangement.
  return nodes.map((node) => {
    const origin = origins[node.id];
    if (!origin) return node;
    return {
      ...node,
      ...placeNodePosition(
        { x: origin.x + applied.x, y: origin.y + applied.y },
        effectiveDiagramNodeSize(node),
        false,
      ),
    };
  });
}

// Alignment is an exactness operation, so it never snaps afterwards: rounding a
// shared edge onto the grid moves differently sized nodes by different amounts
// and breaks the very alignment that was just computed.
//
// The arithmetic lives in `studioArrange`, over plain boxes, because the
// properties bar arranges strokes, paths and tables the same way. These two
// stay as the node-shaped door onto it.
export function alignNodes(
  nodes: readonly DiagramNode[],
  ids: readonly string[],
  mode: DiagramAlignMode,
): DiagramNode[] {
  return applyNodeOffsets(nodes, ids, (boxes) => alignOffsets(boxes, mode));
}

// Equal gaps between bounding boxes, with the outermost two left where they are.
// Like alignment, the result is exact and deliberately not re-snapped.
export function distributeNodes(
  nodes: readonly DiagramNode[],
  ids: readonly string[],
  axis: DiagramDistributeAxis,
): DiagramNode[] {
  return applyNodeOffsets(nodes, ids, (boxes) => distributeOffsets(boxes, axis));
}

function applyNodeOffsets(
  nodes: readonly DiagramNode[],
  ids: readonly string[],
  compute: (boxes: ArrangeBox[]) => Map<string, ArrangeOffset>,
): DiagramNode[] {
  const selected = nodes.filter((node) => ids.includes(node.id));
  const offsets = compute(selected.map((node) => ({ key: node.id, ...nodeBounds(node) })));
  if (offsets.size === 0) return [...nodes];

  return nodes.map((node) => {
    const offset = offsets.get(node.id);
    if (!offset) return node;
    return {
      ...node,
      ...placeNodePosition(
        { x: node.x + offset.x, y: node.y + offset.y },
        effectiveDiagramNodeSize(node),
        false,
      ),
    };
  });
}

/**
 * The container a point lands in, preferring the most deeply nested one so
 * dropping into a container inside a container does the obvious thing.
 * `excluded` keeps a node from being dropped into itself or its own subtree.
 */
export function containerAtPoint(
  nodes: readonly DiagramNode[],
  point: DiagramPoint,
  excluded: readonly string[] = [],
): DiagramNode | null {
  const skip = new Set(excluded);
  let best: DiagramNode | null = null;
  let bestDepth = -1;

  for (const node of nodes) {
    if (skip.has(node.id) || !diagramCanParent(node.shape)) continue;
    const bounds = nodeBounds(node);
    const inside =
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height;
    if (!inside) continue;
    const depth = diagramNodeDepthIn(nodes, node.id);
    if (depth > bestDepth) {
      best = node;
      bestDepth = depth;
    }
  }
  return best;
}

function diagramNodeDepthIn(nodes: readonly DiagramNode[], id: string): number {
  const parents = new Map(nodes.map((node) => [node.id, node.parentId]));
  const seen = new Set<string>();
  let depth = 0;
  let current = parents.get(id);
  while (current && !seen.has(current)) {
    seen.add(current);
    depth += 1;
    current = parents.get(current);
  }
  return depth;
}

/**
 * The members of a drag that are not already carried by another member, so a
 * container and its children are reparented once, by the container.
 */
export function draggedSelectionRoots(
  nodes: readonly DiagramNode[],
  ids: readonly string[],
): string[] {
  const dragging = new Set(ids);
  return ids.filter((id) => {
    const node = nodes.find((candidate) => candidate.id === id);
    return !node?.parentId || !dragging.has(node.parentId);
  });
}

export function reparentNodes(
  nodes: readonly DiagramNode[],
  ids: readonly string[],
  parentId: string | null,
): DiagramNode[] {
  const moving = new Set(ids);
  return nodes.map((node) => {
    if (!moving.has(node.id)) return node;
    // Refuse any assignment that would make the graph cyclic or leaf-parented.
    if (parentId !== null) {
      const parent = nodes.find((candidate) => candidate.id === parentId);
      if (!parent || !diagramCanParent(parent.shape)) return node;
      if (diagramIsAncestor(nodes, node.id, parentId)) return node;
    }
    if ((node.parentId ?? null) === parentId) return node;
    const next: DiagramNode = { ...node };
    if (parentId === null) delete next.parentId;
    else next.parentId = parentId;
    return next;
  });
}

/**
 * Pull every descendant back inside the container's bounds, preserving relative
 * layout where it fits. Used after a container is resized.
 */
export function clampNodesInsideContainer(
  nodes: readonly DiagramNode[],
  containerId: string,
): DiagramNode[] {
  const container = nodes.find((node) => node.id === containerId);
  if (!container || !diagramCanParent(container.shape)) return [...nodes];
  const bounds = nodeBounds(container);
  const descendants = new Set(diagramDescendantIds(nodes, containerId));

  return nodes.map((node) => {
    if (!descendants.has(node.id)) return node;
    const size = effectiveDiagramNodeSize(node);
    const x = Math.min(
      Math.max(node.x, bounds.x),
      Math.max(bounds.x, bounds.x + bounds.width - size.width),
    );
    const y = Math.min(
      Math.max(node.y, bounds.y),
      Math.max(bounds.y, bounds.y + bounds.height - size.height),
    );
    if (x === node.x && y === node.y) return node;
    return { ...node, ...placeNodePosition({ x, y }, size, false) };
  });
}

/** Lifts direct children up to the container's own parent, then drops it. */
export function ungroupContainer(
  nodes: readonly DiagramNode[],
  edges: readonly DiagramEdge[],
  containerId: string,
): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  const container = nodes.find((node) => node.id === containerId);
  if (!container) return { nodes: [...nodes], edges: [...edges] };

  const children = nodes.filter((node) => node.parentId === containerId).map((node) => node.id);
  const lifted = reparentNodes(nodes, children, container.parentId ?? null);
  return deleteNodesWithEdges(lifted, edges, [containerId]);
}

/** Removes the container together with everything nested inside it. */
export function deleteContainerWithContents(
  nodes: readonly DiagramNode[],
  edges: readonly DiagramEdge[],
  containerId: string,
): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  return deleteNodesWithEdges(nodes, edges, [
    containerId,
    ...diagramDescendantIds(nodes, containerId),
  ]);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * One resize gesture, expressed against the bounds the node had when the handle
 * was grabbed. The result is bounded by the size limits and by the sheet, so a
 * node can never be dragged smaller than readable or off the canvas.
 *
 * Grid snapping is skipped while the aspect ratio is locked — rounding either
 * side onto the grid is exactly what breaks the ratio.
 */
export function resizeNode(
  nodes: readonly DiagramNode[],
  id: string,
  corner: DiagramResizeCorner,
  start: DiagramRect,
  delta: DiagramPoint,
  snap = true,
  lockAspect = false,
): DiagramNode[] {
  const movesLeftEdge = corner === 'nw' || corner === 'sw';
  const movesTopEdge = corner === 'nw' || corner === 'ne';

  const maxWidth = Math.max(
    DIAGRAM_MIN_NODE_WIDTH,
    Math.min(
      DIAGRAM_MAX_NODE_WIDTH,
      movesLeftEdge ? start.x + start.width : DIAGRAM_CANVAS_WIDTH - start.x,
    ),
  );
  const maxHeight = Math.max(
    DIAGRAM_MIN_NODE_HEIGHT,
    Math.min(
      DIAGRAM_MAX_NODE_HEIGHT,
      movesTopEdge ? start.y + start.height : DIAGRAM_CANVAS_HEIGHT - start.y,
    ),
  );

  let width = start.width + (movesLeftEdge ? -delta.x : delta.x);
  let height = start.height + (movesTopEdge ? -delta.y : delta.y);

  if (lockAspect) {
    const scale = clampNumber(
      Math.max(width / start.width, height / start.height),
      Math.max(DIAGRAM_MIN_NODE_WIDTH / start.width, DIAGRAM_MIN_NODE_HEIGHT / start.height),
      Math.min(maxWidth / start.width, maxHeight / start.height),
    );
    width = start.width * scale;
    height = start.height * scale;
  } else {
    width = clampNumber(snap ? snapToGrid(width) : width, DIAGRAM_MIN_NODE_WIDTH, maxWidth);
    height = clampNumber(snap ? snapToGrid(height) : height, DIAGRAM_MIN_NODE_HEIGHT, maxHeight);
  }

  width = Math.round(width);
  height = Math.round(height);
  const x = Math.round(movesLeftEdge ? start.x + start.width - width : start.x);
  const y = Math.round(movesTopEdge ? start.y + start.height - height : start.y);

  return nodes.map((node) => (node.id === id ? { ...node, x, y, width, height } : node));
}

/** Drops the stored size so the node returns to its shape's fixed geometry. */
export function clearNodeSize(nodes: readonly DiagramNode[], id: string): DiagramNode[] {
  return nodes.map((node) => {
    if (node.id !== id || node.width === undefined) return node;
    const next: DiagramNode = { ...node };
    delete next.width;
    delete next.height;
    return next;
  });
}

export function styleNodes(
  nodes: readonly DiagramNode[],
  ids: readonly string[],
  style: DiagramNodeStyle,
): DiagramNode[] {
  const selected = new Set(ids);
  return nodes.map((node) => (selected.has(node.id) ? { ...node, ...style } : node));
}

export function clearNodeStyle(
  nodes: readonly DiagramNode[],
  ids: readonly string[],
): DiagramNode[] {
  const selected = new Set(ids);
  return nodes.map((node) => {
    if (!selected.has(node.id)) return node;
    const next: DiagramNode = { ...node };
    delete next.fillColor;
    delete next.strokeColor;
    delete next.strokeWidthPreset;
    delete next.fontSizePreset;
    return next;
  });
}

export function clearEdgeStyle(
  edges: readonly DiagramEdge[],
  target: Pick<DiagramEdge, 'from' | 'to'>,
): DiagramEdge[] {
  return edges.map((edge) => {
    if (edge.from !== target.from || edge.to !== target.to) return edge;
    const next: DiagramEdge = { ...edge };
    delete next.strokeColor;
    delete next.strokeWidthPreset;
    delete next.strokeStyle;
    return next;
  });
}

export function styleEdge(
  edges: readonly DiagramEdge[],
  target: Pick<DiagramEdge, 'from' | 'to'>,
  style: DiagramEdgeStyle,
): DiagramEdge[] {
  return edges.map((edge) =>
    edge.from === target.from && edge.to === target.to ? { ...edge, ...style } : edge,
  );
}

export function copyDiagramFragment(
  nodes: readonly DiagramNode[],
  edges: readonly DiagramEdge[],
  ids: readonly string[],
): PasteFragment {
  const selected = new Set(ids);
  return {
    nodes: nodes.filter((node) => selected.has(node.id)).map((node) => ({ ...node })),
    // An arrow only travels with the copy when both of its endpoints do.
    edges: edges
      .filter((edge) => selected.has(edge.from) && selected.has(edge.to))
      .map((edge) => ({ ...edge })),
  };
}

export function pasteDiagramFragment(
  nodes: readonly DiagramNode[],
  edges: readonly DiagramEdge[],
  fragment: PasteFragment,
  offset: DiagramPoint,
  snap = true,
): PasteResult {
  if (fragment.nodes.length === 0) {
    return { ok: false, error: 'Copy at least one element first.' };
  }
  if (nodes.length + fragment.nodes.length > DIAGRAM_NODE_LIMIT) {
    return { ok: false, error: `A diagram can hold ${DIAGRAM_NODE_LIMIT} elements at most.` };
  }
  if (edges.length + fragment.edges.length > DIAGRAM_EDGE_LIMIT) {
    return { ok: false, error: `A diagram can hold ${DIAGRAM_EDGE_LIMIT} arrows at most.` };
  }

  const nextNodes = [...nodes];
  const idMap = new Map<string, string>();
  const copied: DiagramNode[] = [];
  for (const source of fragment.nodes) {
    const id = createNodeId(nextNodes);
    idMap.set(source.id, id);
    const copy: DiagramNode = {
      ...source,
      id,
      ...placeNodePosition(
        { x: source.x + offset.x, y: source.y + offset.y },
        effectiveDiagramNodeSize(source),
        snap,
      ),
    };
    nextNodes.push(copy);
    copied.push(copy);
  }

  // Grouping only survives a copy when the container came along; otherwise the
  // copy would reference a node outside the fragment.
  for (const copy of copied) {
    if (!copy.parentId) continue;
    const remapped = idMap.get(copy.parentId);
    if (remapped) copy.parentId = remapped;
    else delete copy.parentId;
  }

  const nextEdges = [...edges];
  for (const source of fragment.edges) {
    const from = idMap.get(source.from);
    const to = idMap.get(source.to);
    if (!from || !to || from === to) continue;
    nextEdges.push(source.label ? { from, to, label: source.label } : { from, to });
  }

  return { ok: true, nodes: nextNodes, edges: nextEdges, addedIds: [...idMap.values()] };
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
  return deleteNodesWithEdges(nodes, edges, [id]);
}

export function deleteNodesWithEdges(
  nodes: readonly DiagramNode[],
  edges: readonly DiagramEdge[],
  ids: readonly string[],
): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  const removed = new Set(ids);
  return {
    // A survivor whose container was deleted is lifted to the top level rather
    // than left pointing at a node that no longer exists.
    nodes: nodes
      .filter((node) => !removed.has(node.id))
      .map((node) => {
        if (!node.parentId || !removed.has(node.parentId)) return node;
        const next: DiagramNode = { ...node };
        delete next.parentId;
        return next;
      }),
    edges: edges.filter((edge) => !removed.has(edge.from) && !removed.has(edge.to)),
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

// An empty label removes the key without disturbing the edge's style fields.
function withEdgeLabel(edge: DiagramEdge, label: string): DiagramEdge {
  const next: DiagramEdge = { ...edge };
  if (label) next.label = label;
  else delete next.label;
  return next;
}

export function renameEdge(
  edges: readonly DiagramEdge[],
  target: Pick<DiagramEdge, 'from' | 'to'>,
  label: string,
): DiagramEdge[] {
  const nextLabel = label.slice(0, DIAGRAM_EDGE_LABEL_LIMIT);
  return edges.map((edge) => {
    if (edge.from !== target.from || edge.to !== target.to) return edge;
    return withEdgeLabel(edge, nextLabel);
  });
}

export function deleteEdge(
  edges: readonly DiagramEdge[],
  target: Pick<DiagramEdge, 'from' | 'to'>,
): DiagramEdge[] {
  return edges.filter((edge) => edge.from !== target.from || edge.to !== target.to);
}

/**
 * How far the artwork has to move to sit inside the preview frame.
 *
 * Ink is measured alongside the nodes because both are shifted by the same
 * amount: normalising the shapes on their own would slide them out from under
 * a sketch that was drawn around them.
 */
function normalizationDelta(
  nodes: readonly DiagramNode[],
  ink: readonly StudioInkStroke[],
  paths: readonly PathElement[] = [],
  tables: readonly TableElement[] = [],
  arrows: readonly ArrowElement[] = [],
): DiagramPoint {
  const xs: number[] = [];
  const ys: number[] = [];
  const rights: number[] = [];
  const bottoms: number[] = [];

  for (const node of nodes) {
    const size = effectiveDiagramNodeSize(node);
    xs.push(node.x);
    ys.push(node.y);
    rights.push(node.x + size.width);
    bottoms.push(node.y + size.height);
  }
  for (const stroke of ink) {
    for (const point of stroke.points) {
      xs.push(point.x);
      ys.push(point.y);
      rights.push(point.x);
      bottoms.push(point.y);
    }
  }
  for (const path of paths) {
    for (const anchor of path.anchors) {
      xs.push(anchor.x);
      ys.push(anchor.y);
      rights.push(anchor.x);
      bottoms.push(anchor.y);
    }
  }
  for (const table of tables) {
    const size = tableSize(table);
    xs.push(table.x);
    ys.push(table.y);
    rights.push(table.x + size.width);
    bottoms.push(table.y + size.height);
  }
  // Only an arrow's own endpoints. A bound end sits on an element already
  // counted above, and its stored point is a fallback rather than a position.
  for (const arrow of arrows) {
    for (const end of [arrow.from, arrow.to]) {
      if (end.elementId !== undefined) continue;
      xs.push(end.x);
      ys.push(end.y);
      rights.push(end.x);
      bottoms.push(end.y);
    }
  }

  if (xs.length === 0) return { x: 0, y: 0 };

  return {
    x: Math.min(
      DIAGRAM_PREVIEW_PADDING - Math.min(...xs),
      DIAGRAM_CANVAS_WIDTH - Math.max(...rights),
    ),
    y: Math.min(
      DIAGRAM_PREVIEW_PADDING - Math.min(...ys),
      DIAGRAM_CANVAS_HEIGHT - Math.max(...bottoms),
    ),
  };
}

export function normalizeDiagramCoordinates(nodes: readonly DiagramNode[]): DiagramNode[] {
  if (nodes.length === 0) return [];
  const delta = normalizationDelta(nodes, []);
  return nodes.map((node) => ({
    ...node,
    x: Math.round(node.x + delta.x),
    y: Math.round(node.y + delta.y),
  }));
}

export function prepareDiagram(
  nodes: readonly DiagramNode[],
  edges: readonly DiagramEdge[],
  ink: readonly StudioInkStroke[] = [],
  z: readonly string[] = [],
  paths: readonly PathElement[] = [],
  tables: readonly TableElement[] = [],
  arrows: readonly ArrowElement[] = [],
): PreparedDiagram {
  // v4: a sketch is a legitimate studio artifact on its own, so "something to
  // propose" now means any element, not specifically a shape.
  if (
    nodes.length === 0 &&
    ink.length === 0 &&
    paths.length === 0 &&
    tables.length === 0 &&
    arrows.length === 0
  ) {
    return { ok: false, error: 'Add an element or draw something before proposing.' };
  }

  const normalizedNodes = nodes.map((node) => ({
    ...node,
    label: prepareNodeLabel(node.label),
  }));

  // Deliberately no "label everything" rule. Elements are created empty so they
  // can be typed into straight away, and on a studio canvas an unlabelled shape
  // is a drawing — no less legitimate than a stroke with no text beside it.

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

  const normalizedEdges = edges.map((edge) =>
    withEdgeLabel(edge, edge.label ? prepareEdgeLabel(edge.label) : ''),
  );

  const inkIds = new Set(ink.map((stroke) => stroke.id));
  if (inkIds.size !== ink.length || ink.some((stroke) => nodeIds.has(stroke.id))) {
    return { ok: false, error: 'Every element on the canvas must have a unique id.' };
  }

  // Shapes and ink shift together, so a sketch drawn around a diagram stays
  // registered with it once the whole thing is framed for the board preview.
  const delta = normalizationDelta(normalizedNodes, ink, paths, tables, arrows);
  const shiftedNodes = normalizedNodes.map((node) => ({
    ...node,
    x: Math.round(node.x + delta.x),
    y: Math.round(node.y + delta.y),
  }));
  // Simplified and packed once, at the boundary: the editor keeps every sampled
  // point for a faithful undo, and only what is proposed needs to be compact.
  const shiftedInk = inkToData(
    ink.map((stroke) => ({
      ...stroke,
      points: stroke.points.map((point) => ({ x: point.x + delta.x, y: point.y + delta.y })),
    })),
  );

  const pathIds = new Set(paths.map((path) => path.id));
  if (
    pathIds.size !== paths.length ||
    paths.some((path) => nodeIds.has(path.id) || inkIds.has(path.id))
  ) {
    return { ok: false, error: 'Every element on the canvas must have a unique id.' };
  }

  // Paths move with the shapes and the ink, so a line drawn against a diagram
  // stays where its author put it once the whole canvas is framed.
  const shiftedPaths = paths.map((path) => ({
    ...path,
    anchors: path.anchors.map((point) => ({
      ...point,
      x: Math.round((point.x + delta.x) * 10) / 10,
      y: Math.round((point.y + delta.y) * 10) / 10,
    })),
  }));

  const tableIds = new Set(tables.map((table) => table.id));
  if (
    tableIds.size !== tables.length ||
    tables.some((table) => nodeIds.has(table.id) || inkIds.has(table.id) || pathIds.has(table.id))
  ) {
    return { ok: false, error: 'Every element on the canvas must have a unique id.' };
  }

  const shiftedTables = tables.map((table) => ({
    ...table,
    x: Math.round(table.x + delta.x),
    y: Math.round(table.y + delta.y),
  }));

  const arrowIds = new Set(arrows.map((arrow) => arrow.id));
  if (
    arrowIds.size !== arrows.length ||
    arrows.some(
      (arrow) =>
        nodeIds.has(arrow.id) ||
        inkIds.has(arrow.id) ||
        pathIds.has(arrow.id) ||
        tableIds.has(arrow.id),
    )
  ) {
    return { ok: false, error: 'Every element on the canvas must have a unique id.' };
  }

  // A bound endpoint is drawn from the element it names, so only its stored
  // fallback point moves with the frame — but it has to move, or detaching the
  // arrow later would send it back to where the canvas used to be.
  //
  // Bindings to elements that are no longer here are dropped at this boundary
  // and nowhere else. The editor keeps them through a deletion on purpose: the
  // route already falls back to the stored point, so the arrow looks right
  // either way, and keeping the binding means undoing the deletion reattaches
  // the arrow instead of leaving it pointing at nothing. Only the artifact has
  // to be clean, for the same reason the paint order is pruned just below.
  const bindable = new Set<string>([...nodeIds, ...inkIds, ...pathIds, ...tableIds]);
  const detach = (endpoint: ArrowEndpoint): ArrowEndpoint =>
    endpoint.elementId !== undefined && !bindable.has(endpoint.elementId)
      ? { x: endpoint.x, y: endpoint.y }
      : endpoint;
  const shiftedArrows = arrows
    .map((arrow) => offsetArrow(arrow, delta.x, delta.y))
    .map((arrow) => ({ ...arrow, from: detach(arrow.from), to: detach(arrow.to) }));

  const known = new Set<string>([
    ...shiftedNodes.map((node) => node.id),
    ...normalizedEdges.map(edgeKey),
    ...inkIds,
    ...pathIds,
    ...tableIds,
    ...arrowIds,
  ]);
  // Drop anything the order names that is no longer on the canvas — deleting an
  // element must not make the whole artifact unproposable.
  const prunedOrder = z.filter((key) => known.has(key));

  const parsed = diagramWriteArtifactSchema.safeParse({
    type: 'diagram',
    nodes: shiftedNodes,
    edges: normalizedEdges,
    ...(shiftedInk.length > 0 ? { ink: shiftedInk } : {}),
    ...(shiftedPaths.length > 0 ? { paths: shiftedPaths } : {}),
    ...(shiftedTables.length > 0 ? { tables: shiftedTables } : {}),
    ...(shiftedArrows.length > 0 ? { arrows: shiftedArrows } : {}),
    ...(prunedOrder.length > 0 ? { z: prunedOrder } : {}),
  });
  if (!parsed.success) {
    return { ok: false, error: 'This diagram could not be prepared. Simplify it and try again.' };
  }

  return { ok: true, artifact: parsed.data };
}
