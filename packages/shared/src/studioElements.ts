// Studio element contract — diagram artifact v4.
//
// v4 lets one diagram hold free-form elements alongside its nodes and edges, so
// a user can sketch *and* diagram in a single artifact instead of choosing a
// tool up front. Ink, decorative paths and tables all live here.
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
  DIAGRAM_FILL_COLORS,
  DIAGRAM_FONT_SIZES,
  DIAGRAM_LABEL_INK,
  DIAGRAM_LEGACY_FONT_SIZE,
  DIAGRAM_NODE_STROKE_WIDTHS,
  DIAGRAM_STROKE_COLORS,
  diagramNodesInDrawOrder,
  rotatePoint,
  rotationTransform,
  wrapDiagramLabel,
  type DiagramEdge,
  type DiagramFillKey,
  type DiagramFontSizePreset,
  type DiagramNode,
  type DiagramNodeSize,
  type RotatableBox,
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
  /**
   * v4.5 rotation about the stroke's own bounding-box centre, in degrees.
   *
   * An angle rather than rotated points: baking the turn into `points` would
   * re-round every coordinate to one decimal place each time, so a stroke
   * nudged round a few degrees at a time would slowly lose its shape.
   */
  rotation?: number;
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
  /** v4.5 rotation about the path's own bounding-box centre, in degrees. */
  rotation?: number;
}

/**
 * The box a set of scene points describes, before any rotation.
 *
 * This is the frame ink and paths are turned in: their points are absolute, so
 * the centre they pivot about has to come from the points themselves. Shared so
 * the editor, the board card and the assistant preview all turn a stroke about
 * exactly the same point — a centre that differed by a pixel between surfaces
 * would show up as artwork that shifts when a proposal is posted.
 */
export function pointsBounds(points: readonly { x: number; y: number }[]): RotatableBox | null {
  const first = points[0];
  if (!first) return null;
  let minX = first.x;
  let minY = first.y;
  let maxX = first.x;
  let maxY = first.y;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * A path's unrotated extent, from its anchors alone.
 *
 * This is the box a path *turns about* and the box arrow attach points are
 * fractions of, so it must not change meaning: widening it to the curve would
 * move the pivot of every stored rotated path, and slide every arrow already
 * attached to one. What the path *covers* is `pathCurveLocalBounds`.
 */
export function pathLocalBounds(path: Pick<PathElement, 'anchors'>): RotatableBox | null {
  return pointsBounds(path.anchors);
}

/**
 * The parameters in (0, 1) where one axis of a cubic bezier turns around.
 *
 * B'(t) is a quadratic in t; its roots are where the curve stops moving along
 * that axis, which is the only place it can bulge past its endpoints.
 */
function cubicTurningPoints(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const roots: number[] = [];
  if (Math.abs(a) < 1e-9) {
    if (Math.abs(b) > 1e-9) roots.push(-c / b);
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      roots.push((-b + root) / (2 * a), (-b - root) / (2 * a));
    }
  }
  return roots.filter((t) => t > 0 && t < 1);
}

function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/**
 * The box a path actually paints, bulges included, before any rotation.
 *
 * A bezier can swing well outside its anchors, so a frame drawn around the
 * anchors alone cut through the curve it was meant to enclose. This is the box
 * for everything that is about what the path covers — the selection frame, the
 * marquee, the canvas-edge clamp, alignment, and how a proposal is framed —
 * while `pathLocalBounds` stays the pivot and attach box. Stroke width is left
 * to the caller, as it is for every other element's bounds.
 */
export function pathCurveLocalBounds(
  path: Pick<PathElement, 'anchors' | 'closed'>,
): RotatableBox | null {
  const anchors = path.anchors;
  const first = anchors[0];
  if (!first) return null;
  const points: StrokePoint[] = anchors.map((anchor) => ({ x: anchor.x, y: anchor.y }));

  const addSegment = (from: PathAnchor, to: PathAnchor) => {
    if (segmentIsStraight(from, to)) return;
    const c1 = pathHandlePoint(from, 'out');
    const c2 = pathHandlePoint(to, 'in');
    for (const axis of ['x', 'y'] as const) {
      for (const t of cubicTurningPoints(from[axis], c1[axis], c2[axis], to[axis])) {
        points.push({
          x: cubicAt(from.x, c1.x, c2.x, to.x, t),
          y: cubicAt(from.y, c1.y, c2.y, to.y, t),
        });
      }
    }
  };

  for (let index = 1; index < anchors.length; index += 1) {
    addSegment(anchors[index - 1]!, anchors[index]!);
  }
  if (path.closed && anchors.length > 2) addSegment(anchors.at(-1)!, first);

  return pointsBounds(points);
}

const ORIGIN = { x: 0, y: 0 };

/**
 * What a path paints on the sheet once it is turned, measured on the turned
 * curve itself.
 *
 * Turning the curve's unturned box instead gave the box around a turned
 * *frame*, which for a diagonal or a bulge is far bigger than the line: the
 * canvas-edge clamp then held the path away from the edge by a gap anyone could
 * see. A turn is affine, so the turned curve is the bezier of the turned
 * controls — the anchors turn about the path's pivot, the anchors' centre, and
 * the handles, which are offsets from their anchor, turn as directions — and the
 * extrema search runs on that exactly as it does on an unturned one.
 */
export function pathPaintedBounds(
  path: Pick<PathElement, 'anchors' | 'closed' | 'rotation'>,
): RotatableBox | null {
  const pivotBox = pathLocalBounds(path);
  if (!pivotBox) return null;
  const degrees = path.rotation;
  if (!degrees) return pathCurveLocalBounds(path);
  const pivot = { x: pivotBox.x + pivotBox.width / 2, y: pivotBox.y + pivotBox.height / 2 };
  return pathCurveLocalBounds({
    ...(path.closed !== undefined ? { closed: path.closed } : {}),
    anchors: path.anchors.map((anchor) => {
      const at = rotatePoint(anchor, pivot, degrees);
      const turned: PathAnchor = { x: at.x, y: at.y };
      if (anchor.in) turned.in = rotatePoint(anchor.in, ORIGIN, degrees);
      if (anchor.out) turned.out = rotatePoint(anchor.out, ORIGIN, degrees);
      return turned;
    }),
  });
}

/**
 * What a freehand stroke paints once it is turned: its points, turned about
 * the centre of their own box (the pivot `inkRotationTransform` draws with),
 * and the box around those. Not the turned box of the points — for a diagonal
 * stroke that is a square around a line.
 */
export function inkPaintedBounds(stroke: {
  points: readonly { x: number; y: number }[];
  rotation?: number | undefined;
}): RotatableBox | null {
  const local = pointsBounds(stroke.points);
  const degrees = stroke.rotation;
  // Half a turn about the box's own centre puts the points back in that box.
  if (!local || !degrees || degrees % 180 === 0) return local;
  const centre = { x: local.x + local.width / 2, y: local.y + local.height / 2 };
  return pointsBounds(stroke.points.map((point) => rotatePoint(point, centre, degrees)));
}

/** The turn to draw a path with, or nothing when it is not turned. */
export function pathRotationTransform(
  path: Pick<PathElement, 'anchors' | 'rotation'>,
): string | undefined {
  const local = pathLocalBounds(path);
  return local ? rotationTransform(local, path.rotation) : undefined;
}

/** The turn to draw a stroke with, given its points already unpacked. */
export function inkRotationTransform(
  stroke: Pick<InkElement, 'rotation'> & { points: readonly { x: number; y: number }[] },
): string | undefined {
  const local = pointsBounds(stroke.points);
  return local ? rotationTransform(local, stroke.rotation) : undefined;
}

export const PATH_DEFAULT_STROKE_COLOR: DiagramStrokeKey = 'ink';
export const PATH_DEFAULT_STROKE_WIDTH: DiagramStrokeWidthPreset = 'regular';

/**
 * A drawn line's own width scale, wider apart than the arrow scale it used to
 * borrow. An arrow's three presets sit close together because an arrow is
 * connective tissue and a heavy one shouts; a pen line is the drawing, and its
 * three weights have to be told apart at a glance. Arrows keep their own table,
 * so no stored diagram's arrows change under this.
 */
export const DIAGRAM_PATH_STROKE_WIDTHS: Record<DiagramStrokeWidthPreset, number> = {
  thin: 1,
  regular: 3,
  thick: 6,
};

export function pathStrokeColor(path: Pick<PathElement, 'strokeColor'>): string {
  return DIAGRAM_STROKE_COLORS[path.strokeColor ?? PATH_DEFAULT_STROKE_COLOR];
}

export function pathStrokeWidth(path: Pick<PathElement, 'strokeWidthPreset'>): number {
  return DIAGRAM_PATH_STROKE_WIDTHS[path.strokeWidthPreset ?? PATH_DEFAULT_STROKE_WIDTH];
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

/**
 * Cells merged into one (contract v4.6). The top-left cell — the anchor — is the
 * merged cell: its content and styling are what shows, across every row and
 * column the merge spans. The cells it covers stay in `cells`, empty, so the
 * grid stays one cell per column per row and nothing that indexes it by row and
 * column has to know merges exist.
 */
export interface TableMerge {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
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
  /** Absent means nothing is merged, which is every table before v4.6. */
  merges?: TableMerge[];
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
/** No more merges than a full table has pairs of cells. */
export const TABLE_MERGE_LIMIT = (TABLE_MAX_ROWS * TABLE_MAX_COLS) / 2;
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

function mergesOverlap(a: TableMerge, b: TableMerge): boolean {
  return (
    a.row < b.row + b.rowSpan &&
    b.row < a.row + a.rowSpan &&
    a.col < b.col + b.colSpan &&
    b.col < a.col + a.colSpan
  );
}

/**
 * The merges a grid of `rows` by `cols` can actually hold, in reading order.
 *
 * Kept: whole-number corners and spans, inside the grid, bigger than one cell,
 * and not overlapping one kept before it. The write path refuses a list this
 * would change; the read path keeps what it returns. One rule, so the two can
 * never disagree about what a merge is.
 */
export function normalizeTableMerges(
  rows: number,
  cols: number,
  merges: readonly TableMerge[],
): TableMerge[] {
  const kept: TableMerge[] = [];
  for (const { row, col, rowSpan, colSpan } of merges) {
    if (kept.length >= TABLE_MERGE_LIMIT) break;
    if (![row, col, rowSpan, colSpan].every(Number.isInteger)) continue;
    if (row < 0 || col < 0 || rowSpan < 1 || colSpan < 1) continue;
    if (rowSpan === 1 && colSpan === 1) continue;
    if (row + rowSpan > rows || col + colSpan > cols) continue;
    const merge = { row, col, rowSpan, colSpan };
    if (kept.some((other) => mergesOverlap(other, merge))) continue;
    kept.push(merge);
  }
  return kept.sort((a, b) => a.row - b.row || a.col - b.col);
}

/** The merge a cell is part of, anchor or covered, if any. */
export function tableMergeAt(
  table: Pick<TableElement, 'merges'>,
  row: number,
  col: number,
): TableMerge | null {
  for (const merge of table.merges ?? []) {
    if (
      row >= merge.row &&
      row < merge.row + merge.rowSpan &&
      col >= merge.col &&
      col < merge.col + merge.colSpan
    ) {
      return merge;
    }
  }
  return null;
}

/** The area a cell stands for: its merge, or just itself. */
export function tableCellArea(
  table: Pick<TableElement, 'merges'>,
  row: number,
  col: number,
): TableMerge {
  return tableMergeAt(table, row, col) ?? { row, col, rowSpan: 1, colSpan: 1 };
}

/** Inside a merge but not its anchor: part of a bigger cell, with nothing of its own. */
export function tableCellIsCovered(
  table: Pick<TableElement, 'merges'>,
  row: number,
  col: number,
): boolean {
  const merge = tableMergeAt(table, row, col);
  return merge !== null && (merge.row !== row || merge.col !== col);
}

/**
 * Every cell a merge covers emptied, as v4.6 stores them: the top-left cell
 * alone holds a merged cell's content and look. The same table back when
 * nothing needed clearing, so callers can tell an edit from none.
 */
export function clearCoveredCells<
  T extends Pick<TableElement, 'colWidths' | 'rowHeights' | 'cells' | 'merges'>,
>(table: T): T {
  if (!table.merges?.length) return table;
  const cols = table.colWidths.length;
  let changed = false;
  const cells = table.cells.map((cell, index) => {
    if (!tableCellIsCovered(table, Math.floor(index / cols), index % cols)) return cell;
    if (Object.keys(cell).length === 0) return cell;
    changed = true;
    return {};
  });
  return changed ? { ...table, cells } : table;
}

/** How big an area is: the rows and columns it spans, added up. */
export function tableAreaSize(
  table: Pick<TableElement, 'colWidths' | 'rowHeights'>,
  area: TableMerge,
): DiagramNodeSize {
  let width = 0;
  let height = 0;
  for (let col = area.col; col < area.col + area.colSpan; col += 1) {
    width += table.colWidths[col] ?? 0;
  }
  for (let row = area.row; row < area.row + area.rowSpan; row += 1) {
    height += table.rowHeights[row] ?? 0;
  }
  return { width, height };
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
  table: Pick<TableElement, 'colWidths' | 'rowHeights' | 'fontSizePreset' | 'merges'>,
  cell: TableCell | null,
  col: number,
  row: number,
): string[] {
  const text = cell?.text?.trim();
  if (!text) return [];
  // A merged cell wraps across everything it spans; a covered one shows nothing.
  if (tableCellIsCovered(table, row, col)) return [];
  const area = tableAreaSize(table, tableCellArea(table, row, col));
  const width = area.width || TABLE_DEFAULT_COL_WIDTH;
  const height = area.height || TABLE_DEFAULT_ROW_HEIGHT;
  const fontSize = tableCellFontSize(table, cell);
  const lineHeight = fontSize * 1.25;
  const maxLines = Math.max(1, Math.floor((height - 2) / lineHeight));
  return wrapDiagramLabel(text, width - TABLE_CELL_PADDING, fontSize, maxLines);
}

/** How tall a row needs to be for its tallest cell's wrapped text to fit. */
/** Cell text is spaced exactly as a node label is, and a row keeps this much air. */
const TABLE_LINE_HEIGHT = 1.25;
const TABLE_ROW_PADDING = 10;

/**
 * How tall one cell's text is at a given width: its own line count at its own
 * size. Capped by what the tallest a row may be can show at that size, rather
 * than by `TABLE_MAX_ROWS`, which counts rows in a table and has nothing to say
 * about lines in a cell.
 */
function measureTableText(
  table: Pick<TableElement, 'fontSizePreset'>,
  cell: TableCell | null,
  width: number,
  maxHeight: number = TABLE_MAX_ROW_HEIGHT,
): number {
  const text = cell?.text?.trim();
  if (!text) return 0;
  const fontSize = tableCellFontSize(table, cell);
  const maxLines = Math.max(
    1,
    Math.floor((maxHeight - TABLE_ROW_PADDING) / (fontSize * TABLE_LINE_HEIGHT)),
  );
  const lines = wrapDiagramLabel(text, width - TABLE_CELL_PADDING, fontSize, maxLines).length;
  return lines * fontSize * TABLE_LINE_HEIGHT;
}

export function tableAutoRowHeight(
  table: Pick<TableElement, 'colWidths' | 'rowHeights' | 'cells' | 'fontSizePreset' | 'merges'>,
  row: number,
): number {
  // Each cell is measured whole — its own line count at its own size — and the
  // row takes the tallest of those. Taking the most lines and the largest font
  // as separate maxima multiplied one cell's height by another's: five wrapped
  // lines at 11px beside a single extra-large word made the row six times
  // taller than anything in it needed.
  let needed = tableFontSize(table) * TABLE_LINE_HEIGHT;
  for (let col = 0; col < tableColCount(table); col += 1) {
    const area = tableCellArea(table, row, col);
    // A covered cell has nothing of its own, and a merge down several rows is
    // made room for across all of them (`tableMergeNeededHeight`), not by
    // stretching this one.
    if (area.row !== row || area.col !== col || area.rowSpan > 1) continue;
    const width = tableAreaSize(table, area).width || TABLE_DEFAULT_COL_WIDTH;
    needed = Math.max(needed, measureTableText(table, tableCellAt(table, row, col), width));
  }
  return Math.min(
    TABLE_MAX_ROW_HEIGHT,
    Math.max(TABLE_MIN_ROW_HEIGHT, Math.ceil(needed + TABLE_ROW_PADDING)),
  );
}

/** How tall, all told, the rows a merge spans have to be for its text to fit. */
export function tableMergeNeededHeight(
  table: Pick<TableElement, 'colWidths' | 'rowHeights' | 'cells' | 'fontSizePreset' | 'merges'>,
  merge: TableMerge,
): number {
  const width = tableAreaSize(table, merge).width || TABLE_DEFAULT_COL_WIDTH;
  const most = TABLE_MAX_ROW_HEIGHT * merge.rowSpan;
  const text = measureTableText(table, tableCellAt(table, merge.row, merge.col), width, most);
  return Math.min(most, Math.ceil(text + TABLE_ROW_PADDING));
}

// --- Paint order ----------------------------------------------------------

export type StudioElementKind = 'node' | 'edge' | 'ink' | 'path' | 'table' | 'arrow';

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
  arrows?: readonly { id: string }[];
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
    // Arrows last, so a connector is never buried under what it connects.
    ...(artifact.arrows ?? []).map((arrow) => ({ kind: 'arrow' as const, key: arrow.id })),
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
