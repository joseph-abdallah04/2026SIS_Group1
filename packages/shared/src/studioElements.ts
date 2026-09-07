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
  DIAGRAM_EDGE_STROKE_WIDTHS,
  DIAGRAM_FILL_COLORS,
  DIAGRAM_FONT_SIZES,
  DIAGRAM_LABEL_INK,
  DIAGRAM_LEGACY_FONT_SIZE,
  DIAGRAM_NODE_STROKE_WIDTHS,
  DIAGRAM_STROKE_COLORS,
  diagramNodesInDrawOrder,
  wrapDiagramLabel,
  type DiagramEdge,
  type DiagramFillKey,
  type DiagramFontSizePreset,
  type DiagramNode,
  type DiagramNodeSize,
  type DiagramStrokeKey,
  type DiagramStrokeStyle,
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

// --- Paths (pen and line) -------------------------------------------------
//
// A path is decoration, not structure. Connected arrows stay semantic `edges`
// and keep taking part in routing, layout and grouping; a path never does. That
// separation is why the "free decorative lines" collection was parked in
// docs/02 §2.7 rather than folded into edges, and it holds here.
//
// The pen and the line tool produce the same element: a line is a path with two
// anchors. That is how vector software models it, and it halves the code.

export interface PathHandle {
  /** Offset from the anchor, not an absolute point, so moving an anchor carries its curve. */
  x: number;
  y: number;
}

/**
 * One point on a path, with optional bezier handles either side of it.
 *
 * A corner has neither handle. A smooth anchor has both, normally mirrored;
 * breaking the tangent (Alt-drag) leaves them independent, which is exactly the
 * distinction between a corner and a cusp in any vector editor.
 *
 * Unlike ink these are structured rather than packed: a path carries tens of
 * anchors, not hundreds of points, and each handle is optional — a flat list
 * would need sentinel values to say "no handle" and would be harder to validate
 * than it would be small. The size argument that justifies packing ink does not
 * apply here.
 */
export interface PathAnchor {
  x: number;
  y: number;
  in?: PathHandle;
  out?: PathHandle;
}

export interface PathElement {
  id: string;
  anchors: PathAnchor[];
  /** A closed path joins its last anchor back to its first and may be filled. */
  closed?: boolean;
  strokeColor?: DiagramStrokeKey;
  strokeWidthPreset?: DiagramStrokeWidthPreset;
  strokeStyle?: DiagramStrokeStyle;
  /** Only meaningful on a closed path; an open one is never filled. */
  fillColor?: DiagramFillKey;
}

export const PATH_DEFAULT_STROKE_COLOR: DiagramStrokeKey = 'ink';
export const PATH_DEFAULT_STROKE_WIDTH: DiagramStrokeWidthPreset = 'regular';

/** Paths use the arrow width scale: they are drawn lines, not pen strokes. */
export function pathStrokeColor(path: Pick<PathElement, 'strokeColor'>): string {
  return DIAGRAM_STROKE_COLORS[path.strokeColor ?? PATH_DEFAULT_STROKE_COLOR];
}

export function pathStrokeWidth(path: Pick<PathElement, 'strokeWidthPreset'>): number {
  return DIAGRAM_EDGE_STROKE_WIDTHS[path.strokeWidthPreset ?? PATH_DEFAULT_STROKE_WIDTH];
}

export function pathFill(path: Pick<PathElement, 'closed' | 'fillColor'>): string {
  if (!path.closed || !path.fillColor) return 'none';
  return DIAGRAM_FILL_COLORS[path.fillColor];
}

/** The absolute position of an anchor's handle, or the anchor itself when it has none. */
export function pathHandlePoint(anchor: PathAnchor, side: 'in' | 'out'): StrokePoint {
  const handle = side === 'in' ? anchor.in : anchor.out;
  return handle ? { x: anchor.x + handle.x, y: anchor.y + handle.y } : { x: anchor.x, y: anchor.y };
}

function segmentIsStraight(from: PathAnchor, to: PathAnchor): boolean {
  const out = from.out;
  const into = to.in;
  return (!out || (out.x === 0 && out.y === 0)) && (!into || (into.x === 0 && into.y === 0));
}

function roundPathCoordinate(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function segmentData(from: PathAnchor, to: PathAnchor): string {
  const end = `${roundPathCoordinate(to.x)} ${roundPathCoordinate(to.y)}`;
  // A cubic whose controls sit on its endpoints draws the same line an `L`
  // does, so the simpler command is emitted instead — smaller, and far easier
  // to read when someone inspects a stored artifact.
  if (segmentIsStraight(from, to)) return `L ${end}`;

  const c1 = pathHandlePoint(from, 'out');
  const c2 = pathHandlePoint(to, 'in');
  return `C ${roundPathCoordinate(c1.x)} ${roundPathCoordinate(c1.y)} ${roundPathCoordinate(c2.x)} ${roundPathCoordinate(c2.y)} ${end}`;
}

/** Path data for the whole element. Shared, so editor and board card agree. */
export function pathSvgData(path: Pick<PathElement, 'anchors' | 'closed'>): string {
  const first = path.anchors[0];
  if (!first) return '';
  if (path.anchors.length === 1) {
    // A lone anchor is a dot: a zero-length path paints nothing at all.
    return `M ${roundPathCoordinate(first.x)} ${roundPathCoordinate(first.y)} l 0.1 0`;
  }

  let data = `M ${roundPathCoordinate(first.x)} ${roundPathCoordinate(first.y)}`;
  for (let index = 1; index < path.anchors.length; index += 1) {
    data += ` ${segmentData(path.anchors[index - 1]!, path.anchors[index]!)}`;
  }

  if (path.closed && path.anchors.length > 2) {
    data += ` ${segmentData(path.anchors.at(-1)!, first)} Z`;
  }
  return data;
}

// --- Angle constraint -----------------------------------------------------

/** Holding shift snaps to eighths of a turn, which includes true horizontal and vertical. */
export const CONSTRAIN_ANGLE_STEP_DEGREES = 45;

/**
 * `to`, rotated onto the nearest multiple of `step` degrees around `from`.
 *
 * The distance from `from` is kept rather than projected, so a constrained drag
 * tracks how far the pointer moved instead of collapsing as the pointer swings
 * away from the axis.
 */
export function constrainAngle(
  from: StrokePoint,
  to: StrokePoint,
  step: number = CONSTRAIN_ANGLE_STEP_DEGREES,
): StrokePoint {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance === 0) return { x: to.x, y: to.y };

  const stepRadians = (step * Math.PI) / 180;
  const snapped = Math.round(Math.atan2(deltaY, deltaX) / stepRadians) * stepRadians;
  // Rounded so a constrained point lands on the same grid the rest of the
  // canvas uses, rather than a hair off it from the trigonometry.
  return {
    x: Math.round((from.x + Math.cos(snapped) * distance) * 10) / 10,
    y: Math.round((from.y + Math.sin(snapped) * distance) * 10) / 10,
  };
}

/** A smooth anchor's handles mirror each other; this builds that pair. */
export function mirroredAnchorHandles(handle: PathHandle): Pick<PathAnchor, 'in' | 'out'> {
  return { in: { x: -handle.x, y: -handle.y }, out: { x: handle.x, y: handle.y } };
}

/** Bounds on paths, alongside the existing node, edge and ink caps. */
export const DIAGRAM_PATH_LIMIT = 100;
export const DIAGRAM_PATH_ANCHOR_LIMIT = 100;

// --- Tables ---------------------------------------------------------------
//
// A table is a grid of cells with explicit column widths and row heights, so a
// resized column is representable rather than derived. Cells are stored
// row-major in one flat array whose length is exactly rows × columns: a sparse
// map would be smaller for an empty table and worse for every other one, and a
// flat array makes "is this grid well-formed" a single check at the boundary.

export type TableCellAlign = 'left' | 'center' | 'right';

export const TABLE_CELL_ALIGNS = [
  'left',
  'center',
  'right',
] as const satisfies readonly TableCellAlign[];

export interface TableCell {
  text?: string;
  fill?: DiagramFillKey;
  align?: TableCellAlign;
  /** Text styling, per cell: a heading row is rarely the only thing emphasised. */
  bold?: boolean;
  color?: DiagramStrokeKey;
  fontSizePreset?: DiagramFontSizePreset;
}

export interface TableElement {
  id: string;
  x: number;
  y: number;
  /** Widths and heights double as the grid's dimensions. */
  colWidths: number[];
  rowHeights: number[];
  /** Row-major, exactly `rowHeights.length * colWidths.length` entries. */
  cells: TableCell[];
  /** Draws the first row as a heading: heavier weight over a tinted fill. */
  headerRow?: boolean;
  strokeColor?: DiagramStrokeKey;
  strokeWidthPreset?: DiagramStrokeWidthPreset;
  fontSizePreset?: DiagramFontSizePreset;
}

export const TABLE_DEFAULT_COL_WIDTH = 96;
export const TABLE_DEFAULT_ROW_HEIGHT = 32;

// A table has to stay legible once the sheet is scaled into a 300px board card,
// which is what sets the lower bounds; the upper ones keep one table from
// covering the whole canvas.
export const TABLE_MIN_COL_WIDTH = 40;
export const TABLE_MAX_COL_WIDTH = 400;
export const TABLE_MIN_ROW_HEIGHT = 24;
export const TABLE_MAX_ROW_HEIGHT = 200;

export const TABLE_MAX_ROWS = 20;
export const TABLE_MAX_COLS = 12;
export const TABLE_CELL_TEXT_LIMIT = 200;
export const DIAGRAM_TABLE_LIMIT = 20;

export const TABLE_DEFAULT_STROKE_COLOR: DiagramStrokeKey = 'grey';
export const TABLE_DEFAULT_STROKE_WIDTH: DiagramStrokeWidthPreset = 'thin';

export function tableRowCount(table: Pick<TableElement, 'rowHeights'>): number {
  return table.rowHeights.length;
}

export function tableColCount(table: Pick<TableElement, 'colWidths'>): number {
  return table.colWidths.length;
}

/** Row-major index of a cell, or -1 when it is outside the grid. */
export function tableCellIndex(
  table: Pick<TableElement, 'colWidths' | 'rowHeights'>,
  row: number,
  col: number,
): number {
  const rows = tableRowCount(table);
  const cols = tableColCount(table);
  if (row < 0 || col < 0 || row >= rows || col >= cols) return -1;
  return row * cols + col;
}

export function tableCellAt(
  table: Pick<TableElement, 'colWidths' | 'rowHeights' | 'cells'>,
  row: number,
  col: number,
): TableCell | null {
  const index = tableCellIndex(table, row, col);
  return index === -1 ? null : (table.cells[index] ?? null);
}

/** Running offsets down each axis, with a final entry for the far edge. */
function offsets(sizes: readonly number[]): number[] {
  const result = [0];
  for (const size of sizes) result.push(result[result.length - 1]! + size);
  return result;
}

export function tableColumnOffsets(table: Pick<TableElement, 'colWidths'>): number[] {
  return offsets(table.colWidths);
}

export function tableRowOffsets(table: Pick<TableElement, 'rowHeights'>): number[] {
  return offsets(table.rowHeights);
}

export function tableSize(table: Pick<TableElement, 'colWidths' | 'rowHeights'>): DiagramNodeSize {
  return {
    width: table.colWidths.reduce((total, width) => total + width, 0),
    height: table.rowHeights.reduce((total, height) => total + height, 0),
  };
}

export function tableStrokeColor(table: Pick<TableElement, 'strokeColor'>): string {
  return DIAGRAM_STROKE_COLORS[table.strokeColor ?? TABLE_DEFAULT_STROKE_COLOR];
}

/** Grid lines use the node width scale: they are borders, not arrows. */
export function tableStrokeWidth(table: Pick<TableElement, 'strokeWidthPreset'>): number {
  return DIAGRAM_NODE_STROKE_WIDTHS[table.strokeWidthPreset ?? TABLE_DEFAULT_STROKE_WIDTH];
}

export function tableFontSize(table: Pick<TableElement, 'fontSizePreset'>): number {
  return table.fontSizePreset ? DIAGRAM_FONT_SIZES[table.fontSizePreset] : DIAGRAM_LEGACY_FONT_SIZE;
}

/** A cell's own size when it has one, otherwise the table's. */
export function tableCellFontSize(
  table: Pick<TableElement, 'fontSizePreset'>,
  cell: TableCell | null,
): number {
  return cell?.fontSizePreset ? DIAGRAM_FONT_SIZES[cell.fontSizePreset] : tableFontSize(table);
}

export function tableCellColor(cell: TableCell | null): string {
  return cell?.color ? DIAGRAM_STROKE_COLORS[cell.color] : DIAGRAM_LABEL_INK;
}

/** Header cells are bold unless the cell says otherwise. */
export function tableCellBold(
  table: Pick<TableElement, 'headerRow'>,
  cell: TableCell | null,
  row: number,
): boolean {
  return cell?.bold ?? (Boolean(table.headerRow) && row === 0);
}

/** Header cells sit on a tint so the first row reads as a heading. */
export const TABLE_HEADER_FILL: DiagramFillKey = 'neutral';

export function tableCellFill(
  table: Pick<TableElement, 'headerRow'>,
  cell: TableCell | null,
  row: number,
): string {
  if (cell?.fill) return DIAGRAM_FILL_COLORS[cell.fill];
  if (table.headerRow && row === 0) return DIAGRAM_FILL_COLORS[TABLE_HEADER_FILL];
  return DIAGRAM_FILL_COLORS.surface;
}

/** Padding either side of cell text, in table units. */
export const TABLE_CELL_PADDING = 6;

/**
 * The lines of a cell's text, wrapped to its column and clipped to its row.
 *
 * Reuses the diagram's label wrapper so a table, a node label and a board card
 * all break text the same way and at the same measured-free glyph ratio.
 */
export function tableCellLines(
  table: Pick<TableElement, 'colWidths' | 'rowHeights' | 'fontSizePreset'>,
  cell: TableCell | null,
  col: number,
  row: number,
): string[] {
  const text = cell?.text?.trim();
  if (!text) return [];
  const width = table.colWidths[col] ?? TABLE_DEFAULT_COL_WIDTH;
  const height = table.rowHeights[row] ?? TABLE_DEFAULT_ROW_HEIGHT;
  const fontSize = tableCellFontSize(table, cell);
  const lineHeight = fontSize * 1.25;
  const maxLines = Math.max(1, Math.floor((height - 2) / lineHeight));
  return wrapDiagramLabel(text, width - TABLE_CELL_PADDING, fontSize, maxLines);
}

/** How tall a row needs to be for its tallest cell's wrapped text to fit. */
export function tableAutoRowHeight(
  table: Pick<TableElement, 'colWidths' | 'rowHeights' | 'cells' | 'fontSizePreset'>,
  row: number,
): number {
  let tallest = tableFontSize(table);
  let needed = 1;
  for (let col = 0; col < tableColCount(table); col += 1) {
    const cell = tableCellAt(table, row, col);
    const text = cell?.text?.trim();
    if (!text) continue;
    // Each cell is measured at its own size, so one large cell sets the row.
    const fontSize = tableCellFontSize(table, cell);
    tallest = Math.max(tallest, fontSize);
    const width = table.colWidths[col] ?? TABLE_DEFAULT_COL_WIDTH;
    // Wrapped against a tall row so the count is what the text needs, not what
    // the row currently allows.
    needed = Math.max(
      needed,
      wrapDiagramLabel(text, width - TABLE_CELL_PADDING, fontSize, TABLE_MAX_ROWS).length,
    );
  }
  return Math.min(
    TABLE_MAX_ROW_HEIGHT,
    Math.max(TABLE_MIN_ROW_HEIGHT, Math.ceil(needed * tallest * 1.25 + 10)),
  );
}

// --- Paint order ----------------------------------------------------------

export type StudioElementKind = 'node' | 'edge' | 'ink' | 'path' | 'table';

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
  paths?: readonly { id: string }[];
  tables?: readonly { id: string }[];
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
    ...(artifact.paths ?? []).map((path) => ({ kind: 'path' as const, key: path.id })),
    ...(artifact.tables ?? []).map((table) => ({ kind: 'table' as const, key: table.id })),
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
