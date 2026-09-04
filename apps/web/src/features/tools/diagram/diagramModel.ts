import type {
  DiagramArtifact,
  DiagramEdge,
  DiagramNode,
  DiagramNodeShape,
  DiagramNodeSize,
} from '@roundtable/shared';
import {
  DIAGRAM_NODE_SHAPE_KEYS,
  DIAGRAM_MAX_NODE_HEIGHT,
  DIAGRAM_MAX_NODE_WIDTH,
  DIAGRAM_MIN_NODE_HEIGHT,
  DIAGRAM_MIN_NODE_WIDTH,
  diagramCanParent,
  diagramDescendantIds,
  diagramIsAncestor,
  diagramNodeSize,
  effectiveDiagramNodeSize,
} from '@roundtable/shared';
import { diagramWriteArtifactSchema } from '@roundtable/shared/schemas';

import { DIAGRAM_EDGE_LIMIT, DIAGRAM_NODE_LIMIT } from '../artifactLimits';

export const DIAGRAM_NODE_SHAPES = DIAGRAM_NODE_SHAPE_KEYS;

// Palette drags carry the shape in a private media type so unrelated drops
// (files, text from other apps) are ignored by the canvas.
export const DIAGRAM_SHAPE_MEDIA_TYPE = 'application/x-roundtable-diagram-shape';

export const DIAGRAM_SHAPE_LABELS: Record<DiagramNodeShape, string> = {
  box: 'Box',
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  diamond: 'Decision',
  triangle: 'Triangle',
  cylinder: 'Database',
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
export function clientPointToDiagramPoint(
  clientPoint: DiagramPoint,
  bounds: DiagramSurfaceBounds,
  viewBox: DiagramRect = DIAGRAM_FULL_VIEW_BOX,
): DiagramPoint {
  if (bounds.width <= 0 || bounds.height <= 0) return { x: viewBox.x, y: viewBox.y };
  return {
    x: viewBox.x + ((clientPoint.x - bounds.left) / bounds.width) * viewBox.width,
    y: viewBox.y + ((clientPoint.y - bounds.top) / bounds.height) * viewBox.height,
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
export function alignNodes(
  nodes: readonly DiagramNode[],
  ids: readonly string[],
  mode: DiagramAlignMode,
): DiagramNode[] {
  const selected = nodes.filter((node) => ids.includes(node.id));
  if (selected.length < 2) return [...nodes];

  const boxes = selected.map(nodeBounds);
  const left = Math.min(...boxes.map((box) => box.x));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const top = Math.min(...boxes.map((box) => box.y));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));

  return nodes.map((node) => {
    if (!ids.includes(node.id)) return node;
    const size = effectiveDiagramNodeSize(node);
    const target = { x: node.x, y: node.y };
    switch (mode) {
      case 'left':
        target.x = left;
        break;
      case 'centerX':
        target.x = (left + right) / 2 - size.width / 2;
        break;
      case 'right':
        target.x = right - size.width;
        break;
      case 'top':
        target.y = top;
        break;
      case 'centerY':
        target.y = (top + bottom) / 2 - size.height / 2;
        break;
      case 'bottom':
        target.y = bottom - size.height;
        break;
    }
    return { ...node, ...placeNodePosition(target, effectiveDiagramNodeSize(node), false) };
  });
}

// Equal gaps between bounding boxes, with the outermost two left where they are.
// Like alignment, the result is exact and deliberately not re-snapped.
export function distributeNodes(
  nodes: readonly DiagramNode[],
  ids: readonly string[],
  axis: DiagramDistributeAxis,
): DiagramNode[] {
  const selected = nodes.filter((node) => ids.includes(node.id));
  if (selected.length < 3) return [...nodes];

  const horizontal = axis === 'horizontal';
  const extent = (node: DiagramNode) =>
    horizontal ? effectiveDiagramNodeSize(node).width : effectiveDiagramNodeSize(node).height;
  const start = (node: DiagramNode) => (horizontal ? node.x : node.y);

  const ordered = [...selected].sort((a, b) => start(a) - start(b));
  const first = ordered[0]!;
  const last = ordered.at(-1)!;
  const spanStart = start(first);
  const spanEnd = start(last) + extent(last);
  const totalExtent = ordered.reduce((sum, node) => sum + extent(node), 0);
  const gap = (spanEnd - spanStart - totalExtent) / (ordered.length - 1);

  const placed = new Map<string, number>();
  let cursor = spanStart;
  for (const node of ordered) {
    placed.set(node.id, cursor);
    cursor += extent(node) + gap;
  }

  return nodes.map((node) => {
    const position = placed.get(node.id);
    if (position === undefined) return node;
    const target = horizontal ? { x: position, y: node.y } : { x: node.x, y: position };
    return { ...node, ...placeNodePosition(target, effectiveDiagramNodeSize(node), false) };
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

export function autoLayoutNodes(nodes: readonly DiagramNode[]): DiagramNode[] {
  if (nodes.length === 0) return [];

  const largestWidth = Math.max(...nodes.map((node) => effectiveDiagramNodeSize(node).width));
  const largestHeight = Math.max(...nodes.map((node) => effectiveDiagramNodeSize(node).height));
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
        effectiveDiagramNodeSize(node),
      ),
    };
  });
}

export function normalizeDiagramCoordinates(nodes: readonly DiagramNode[]): DiagramNode[] {
  if (nodes.length === 0) return [];
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxRight = Math.max(...nodes.map((node) => node.x + effectiveDiagramNodeSize(node).width));
  const maxBottom = Math.max(
    ...nodes.map((node) => node.y + effectiveDiagramNodeSize(node).height),
  );
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

  const normalizedEdges = edges.map((edge) =>
    withEdgeLabel(edge, edge.label ? prepareEdgeLabel(edge.label) : ''),
  );

  const parsed = diagramWriteArtifactSchema.safeParse({
    type: 'diagram',
    nodes: normalizeDiagramCoordinates(normalizedNodes),
    edges: normalizedEdges,
  });
  if (!parsed.success) {
    return { ok: false, error: 'This diagram could not be prepared. Simplify it and try again.' };
  }

  return { ok: true, artifact: parsed.data };
}
