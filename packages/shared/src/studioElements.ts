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
// Stroke geometry is NOT duplicated here: simplification, path data and
// hit-testing live in `drawingContract.ts` and are shared with the drawing
// tool, because both surfaces draw the same kind of mark and the board card
// renders both without either editor.

import { packDrawingPoints, unpackDrawingPoints, type StrokePoint } from './drawingContract.js';
import {
  DIAGRAM_STROKE_COLORS,
  diagramNodesInDrawOrder,
  type DiagramEdge,
  type DiagramNode,
  type DiagramStrokeKey,
  type DiagramStrokeWidthPreset,
} from './diagramContract.js';

/**
 * One freehand stroke, as stored.
 *
 * Points are a flat `[x0, y0, x1, y1, …]` list for the same reason the drawing
 * artifact packs its strokes: the same path costs roughly half as many
 * characters, and ink shares the artifact's ~100KB budget with the nodes,
 * edges and everything else on the canvas. `studioInk.ts` holds the unpacked
 * `{x, y}` form the editor works in, and converts at the boundary — exactly the
 * split `DrawingStroke` / `DrawingStrokeData` already uses.
 *
 * The coordinate space is the diagram's own, not a surface of the stroke's own,
 * so ink pans, zooms and sits beside shapes rather than on a separate sheet.
 *
 * Both style fields are optional for the same reason node styling is: a stroke
 * written by a build with a wider palette must still load and draw, with the
 * default appearance, rather than taking the whole board down.
 */
export interface InkElement {
  id: string;
  points: number[];
  strokeColor?: DiagramStrokeKey;
  strokeWidthPreset?: DiagramStrokeWidthPreset;
}

export const INK_DEFAULT_STROKE_COLOR: DiagramStrokeKey = 'ink';
export const INK_DEFAULT_STROKE_WIDTH: DiagramStrokeWidthPreset = 'regular';

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

/** The stroke's points in the `{x, y}` form the geometry helpers take. */
export function inkPoints(ink: Pick<InkElement, 'points'>): StrokePoint[] {
  return unpackDrawingPoints(ink.points);
}

/** Flatten editor points for storage, at one decimal place. */
export function packInkPoints(points: readonly StrokePoint[]): number[] {
  return packDrawingPoints(points);
}

/**
 * Bounds on ink, alongside the existing 100 nodes / 200 edges.
 *
 * These are shape limits, not the real ceiling: a sketch is bounded by the
 * serialized-artifact budget the editor checks before proposing (docs/02 §8.5),
 * which is what actually stops a 100KB payload. They exist so a crafted payload
 * cannot make the server parse an unbounded array. The point cap counts packed
 * numbers, so it is two per drawn point.
 */
export const DIAGRAM_INK_LIMIT = 200;
export const DIAGRAM_INK_POINT_LIMIT = 800;
/** One `z` entry per element: nodes + edges + ink, with headroom. */
export const DIAGRAM_Z_LIMIT = 600;

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
  /** Only the ids are needed, so the editor's unpacked strokes fit too. */
  ink?: readonly { id: string }[];
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
