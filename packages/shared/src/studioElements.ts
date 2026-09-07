// Studio element contract — diagram artifact v4.
//
// v4 lets one diagram hold free-form elements alongside its nodes and edges, so
// a user can sketch *and* diagram in a single artifact instead of choosing a
// tool up front. Ink lands here first; paths, tables and charts follow.
//
// Every v4 field is optional. A diagram authored before v4 carries none of them
// and must keep rendering exactly as it did — the same additive rule that v2
// styling and v3 grouping already follow.
//
// Geometry and style resolution live here rather than in either surface,
// because the editor and the board card have to draw an element identically.
// That is the rule `diagramContract.ts` already applies to nodes and edges, and
// it is why the drawing tool's stroke maths moved here rather than being copied.

import {
  DIAGRAM_STROKE_COLORS,
  diagramNodesInDrawOrder,
  type DiagramEdge,
  type DiagramNode,
  type DiagramStrokeKey,
  type DiagramStrokeWidthPreset,
} from './diagramContract.js';

export interface InkPoint {
  x: number;
  y: number;
}

/**
 * One freehand stroke.
 *
 * Points are in the diagram's own coordinate space rather than on a surface of
 * their own, so ink pans, zooms and sits beside shapes instead of living on the
 * separate fixed sheet the standalone drawing tool uses.
 *
 * Both style fields are optional for the same reason node styling is: a stroke
 * written by a build with a wider palette must still load and draw with the
 * default appearance rather than taking the whole board down.
 */
export interface InkElement {
  id: string;
  points: InkPoint[];
  strokeColor?: DiagramStrokeKey;
  strokeWidthPreset?: DiagramStrokeWidthPreset;
}

export const INK_DEFAULT_STROKE_COLOR: DiagramStrokeKey = 'ink';
export const INK_DEFAULT_STROKE_WIDTH: DiagramStrokeWidthPreset = 'regular';

/**
 * Bounds on ink, alongside the existing 100 nodes / 200 edges.
 *
 * These are shape limits, not the real ceiling: a sketch is bounded by the
 * serialized-artifact budget the editor checks before proposing (docs/02 §8.5),
 * which is what actually stops a 100KB payload. They exist so a crafted payload
 * cannot make the server parse an unbounded array.
 */
export const DIAGRAM_INK_LIMIT = 200;
export const DIAGRAM_INK_POINT_LIMIT = 400;
/** One `z` entry per element: nodes + edges + ink, with headroom. */
export const DIAGRAM_Z_LIMIT = 600;

/**
 * Ink is heavier than an arrow at the same preset name. A 2-unit line reads as
 * a hairline once a 960-unit sheet is scaled into a 300px board card, and these
 * three reproduce the drawing tool's original 4/8/14 pen widths so a sketch
 * keeps the weight its author chose.
 */
export const DIAGRAM_INK_STROKE_WIDTHS: Record<DiagramStrokeWidthPreset, number> = {
  thin: 4,
  regular: 8,
  thick: 14,
};

export function inkStrokeColor(ink: Pick<InkElement, 'strokeColor'>): string {
  return DIAGRAM_STROKE_COLORS[ink.strokeColor ?? INK_DEFAULT_STROKE_COLOR];
}

export function inkStrokeWidth(ink: Pick<InkElement, 'strokeWidthPreset'>): number {
  return DIAGRAM_INK_STROKE_WIDTHS[ink.strokeWidthPreset ?? INK_DEFAULT_STROKE_WIDTH];
}

// --- Stroke geometry ------------------------------------------------------
//
// Moved here from the drawing tool's model so the studio editor, the board card
// and the drawing tool all simplify and draw a stroke identically.

/** Sub-two-unit tolerance removes pointer noise without flattening corners. */
const SIMPLIFICATION_TOLERANCE = 1.5;

function squaredDistance(first: InkPoint, second: InkPoint): number {
  const deltaX = first.x - second.x;
  const deltaY = first.y - second.y;
  return deltaX * deltaX + deltaY * deltaY;
}

function squaredSegmentDistance(point: InkPoint, start: InkPoint, end: InkPoint): number {
  let x = start.x;
  let y = start.y;
  let deltaX = end.x - x;
  let deltaY = end.y - y;

  if (deltaX !== 0 || deltaY !== 0) {
    const ratio =
      ((point.x - x) * deltaX + (point.y - y) * deltaY) / (deltaX * deltaX + deltaY * deltaY);

    if (ratio > 1) {
      x = end.x;
      y = end.y;
    } else if (ratio > 0) {
      x += deltaX * ratio;
      y += deltaY * ratio;
    }
  }

  deltaX = point.x - x;
  deltaY = point.y - y;
  return deltaX * deltaX + deltaY * deltaY;
}

function simplifyRadialDistance(points: readonly InkPoint[], squaredTolerance: number): InkPoint[] {
  const first = points[0];
  if (!first) return [];

  const simplified = [first];
  let previous = first;

  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    if (point && squaredDistance(point, previous) > squaredTolerance) {
      simplified.push(point);
      previous = point;
    }
  }

  const last = points.at(-1);
  if (last && previous !== last) simplified.push(last);
  return simplified;
}

function simplifyDouglasPeucker(points: readonly InkPoint[], squaredTolerance: number): InkPoint[] {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last || points.length <= 2) return [...points];

  const markers = new Uint8Array(points.length);
  const pendingRanges: Array<[number, number]> = [[0, points.length - 1]];
  markers[0] = 1;
  markers[points.length - 1] = 1;

  while (pendingRanges.length > 0) {
    const range = pendingRanges.pop();
    if (!range) break;
    const [startIndex, endIndex] = range;
    const rangeStart = points[startIndex];
    const rangeEnd = points[endIndex];
    if (!rangeStart || !rangeEnd) continue;

    let furthestIndex = -1;
    let furthestDistance = squaredTolerance;

    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const point = points[index];
      if (!point) continue;
      const distance = squaredSegmentDistance(point, rangeStart, rangeEnd);
      if (distance > furthestDistance) {
        furthestDistance = distance;
        furthestIndex = index;
      }
    }

    if (furthestIndex > startIndex && furthestIndex < endIndex) {
      markers[furthestIndex] = 1;
      pendingRanges.push([startIndex, furthestIndex], [furthestIndex, endIndex]);
    }
  }

  return points.filter((_, index) => markers[index] === 1);
}

export function simplifyInkPoints(
  points: readonly InkPoint[],
  tolerance = SIMPLIFICATION_TOLERANCE,
): InkPoint[] {
  if (points.length <= 2) return [...points];
  const squaredTolerance = tolerance * tolerance;
  return simplifyDouglasPeucker(simplifyRadialDistance(points, squaredTolerance), squaredTolerance);
}

function roundCoordinate(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/**
 * Path data for a stroke: quadratics through the midpoints, so a hand-drawn
 * line stays smooth instead of showing every sampled point as a corner.
 */
export function inkPathData(points: readonly InkPoint[]): string {
  const first = points[0];
  if (!first) return '';
  if (points.length === 1) {
    // A dot still has to paint, and a zero-length path does not.
    return `M ${roundCoordinate(first.x)} ${roundCoordinate(first.y)} l 0.1 0`;
  }

  let path = `M ${roundCoordinate(first.x)} ${roundCoordinate(first.y)}`;

  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const next = points[index + 1];
    if (!point || !next) continue;
    const midpoint = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 };
    path += ` Q ${roundCoordinate(point.x)} ${roundCoordinate(point.y)} ${roundCoordinate(midpoint.x)} ${roundCoordinate(midpoint.y)}`;
  }

  const last = points.at(-1);
  return last ? `${path} L ${roundCoordinate(last.x)} ${roundCoordinate(last.y)}` : path;
}

/** True when an eraser of `radius` at `point` covers any part of the stroke. */
export function inkTouchesPoint(ink: InkElement, point: InkPoint, radius: number): boolean {
  const hitRadius = radius + inkStrokeWidth(ink) / 2;
  const squaredHitRadius = hitRadius * hitRadius;

  if (ink.points.length === 1) {
    const onlyPoint = ink.points[0];
    return onlyPoint ? squaredDistance(onlyPoint, point) <= squaredHitRadius : false;
  }

  for (let index = 1; index < ink.points.length; index += 1) {
    const start = ink.points[index - 1];
    const end = ink.points[index];
    if (start && end && squaredSegmentDistance(point, start, end) <= squaredHitRadius) {
      return true;
    }
  }

  return false;
}

/** Whole-stroke eraser, matching the drawing tool: a touched stroke goes entirely. */
export function eraseInkAtPoint(
  ink: readonly InkElement[],
  point: InkPoint,
  radius: number,
): InkElement[] {
  return ink.filter((stroke) => !inkTouchesPoint(stroke, point, radius));
}

// --- Paint order ----------------------------------------------------------

export type StudioElementKind = 'node' | 'edge' | 'ink';

export interface StudioElementRef {
  kind: StudioElementKind;
  /** A node or ink id, or an edge's `diagramEdgeKey`. Unique across kinds. */
  key: string;
}

/**
 * An edge's identity. Edges have no id of their own — a directed pair is unique
 * by contract — so this is what names one in `z` and in editor selection state.
 *
 * The JSON-array form cannot be produced by `createNodeId`, which keeps edge
 * keys from colliding with node or ink ids in a single flat order.
 */
export function diagramEdgeKey(edge: Pick<DiagramEdge, 'from' | 'to'>): string {
  return JSON.stringify([edge.from, edge.to]);
}

interface PaintableArtifact {
  nodes: readonly DiagramNode[];
  edges: readonly DiagramEdge[];
  ink?: readonly InkElement[];
  z?: readonly string[];
}

/**
 * What to paint, in the order to paint it.
 *
 * With no `z` this is exactly the pre-v4 order — every edge, then nodes with
 * containers behind what they hold — and ink on top in authored order, which is
 * what a canvas nobody has reordered should look like.
 *
 * With `z` present, the elements it names come first in that order and anything
 * it does not mention is appended in the same legacy order. `z` is deliberately
 * allowed to be partial: a build that adds an element kind this one cannot draw
 * must not be able to drop the elements this one *can*.
 *
 */
export function studioPaintOrder(artifact: PaintableArtifact): StudioElementRef[] {
  const legacy: StudioElementRef[] = [
    ...artifact.edges.map((edge) => ({ kind: 'edge' as const, key: diagramEdgeKey(edge) })),
    ...diagramNodesInDrawOrder(artifact.nodes).map((node) => ({
      kind: 'node' as const,
      key: node.id,
    })),
    ...(artifact.ink ?? []).map((stroke) => ({ kind: 'ink' as const, key: stroke.id })),
  ];

  const order = artifact.z;
  if (!order || order.length === 0) return legacy;

  const rank = new Map(order.map((key, index) => [key, index]));
  // Array#sort is stable, so anything `z` omits keeps its legacy position
  // relative to the other omitted elements.
  return legacy
    .map((ref, index) => ({ ref, index, rank: rank.get(ref.key) ?? Number.POSITIVE_INFINITY }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.ref);
}

/**
 * Move `moving` to the front or the back of the paint order.
 *
 * The moved keys keep their order relative to each other, and so do the keys
 * left behind. That is what keeps a container ahead of its own contents when a
 * whole group is raised: the write path rejects an order that paints a
 * container after something it holds, so the two cannot be separated here.
 *
 * The result is always a complete order, even when the artifact had none — a
 * partial one would leave the moved elements' position depending on the legacy
 * fallback, and "bring to front" has to still mean front next time.
 */
export function reorderStudioElements(
  order: readonly StudioElementRef[],
  moving: ReadonlySet<string>,
  move: 'front' | 'back',
): string[] {
  const keys = order.map((ref) => ref.key);
  if (moving.size === 0) return keys;

  const moved = keys.filter((key) => moving.has(key));
  const kept = keys.filter((key) => !moving.has(key));
  return move === 'front' ? [...kept, ...moved] : [...moved, ...kept];
}
