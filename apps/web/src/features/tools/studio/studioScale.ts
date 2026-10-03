// Resizing an element from its selection frame: which handle does what, and
// how a hand-drawn mark is scaled.
//
// A shape stores a width and a height, so resizing one is `resizeNode`'s job.
// Ink and pen paths store nothing but points, so "resize" means moving every
// point — and a doodle stretched along one axis stops being the doodle that was
// drawn, so they only ever scale uniformly. Their stroke weight is a preset, not
// a length, so it is left exactly as it was: a thin line stays thin at any size.
//
// Pure, so every edge case — a turned stroke, the sheet's edge, a mark scaled
// to nothing — is testable without a canvas.

import {
  DIAGRAM_CANVAS_HEIGHT,
  DIAGRAM_CANVAS_WIDTH,
  pathCurveLocalBounds,
  pathLocalBounds,
  pathPaintedBounds,
  inkPaintedBounds,
  pointsBounds,
  rotatePoint,
  type PathElement,
} from '@roundtable/shared';

import type { DiagramPoint, DiagramRect } from '../diagram/diagramModel';
import type { StudioInkStroke } from './studioInk';

/** The eight places a selection frame can be pulled from. */
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const RESIZE_CORNER_HANDLES: readonly ResizeHandle[] = ['nw', 'ne', 'se', 'sw'];
export const RESIZE_EDGE_HANDLES: readonly ResizeHandle[] = ['n', 'e', 's', 'w'];

export const RESIZE_HANDLE_LABELS: Record<ResizeHandle, string> = {
  nw: 'Resize from the top left',
  n: 'Resize from the top',
  ne: 'Resize from the top right',
  e: 'Resize from the right',
  se: 'Resize from the bottom right',
  s: 'Resize from the bottom',
  sw: 'Resize from the bottom left',
  w: 'Resize from the left',
};

/**
 * The smallest a hand-drawn mark can be scaled to, along its longer side.
 *
 * Small enough never to get in the way, large enough that the mark can still
 * be selected and scaled back up: a stroke scaled to nothing cannot be found.
 */
export const MIN_SCALED_EXTENT = 8;

/** Which way each axis of a handle moves: -1 the low edge, 1 the high, 0 neither. */
export function handleAxes(handle: ResizeHandle): { hx: -1 | 0 | 1; hy: -1 | 0 | 1 } {
  return {
    hx: handle.includes('w') ? -1 : handle.includes('e') ? 1 : 0,
    hy: handle.includes('n') ? -1 : handle.includes('s') ? 1 : 0,
  };
}

/**
 * The point of `box` a pull on `handle` leaves where it is: the opposite
 * corner, the middle of the opposite edge, or — resizing from the centre — the
 * centre itself.
 */
export function heldPoint(
  box: DiagramRect,
  handle: ResizeHandle,
  fromCentre = false,
): DiagramPoint {
  const { hx, hy } = handleAxes(handle);
  const along = (h: number, lo: number, extent: number) =>
    fromCentre || h === 0 ? lo + extent / 2 : h > 0 ? lo : lo + extent;
  return { x: along(hx, box.x, box.width), y: along(hy, box.y, box.height) };
}

/** Where on `box` the handle itself sits. */
export function handlePoint(box: DiagramRect, handle: ResizeHandle): DiagramPoint {
  const { hx, hy } = handleAxes(handle);
  const along = (h: number, lo: number, extent: number) =>
    h === 0 ? lo + extent / 2 : h > 0 ? lo + extent : lo;
  return { x: along(hx, box.x, box.width), y: along(hy, box.y, box.height) };
}

/**
 * The resize cursor for a handle on an element turned by `rotation`.
 *
 * A browser only has four double-headed arrows, and a fixed one per handle is
 * wrong the moment the element turns: the top edge of a shape turned a quarter
 * is a vertical line, and pulling it left and right showed an up-down arrow.
 */
export function resizeCursorFor(handle: ResizeHandle, rotation = 0): string {
  const base: Record<ResizeHandle, number> = {
    e: 0,
    se: 45,
    s: 90,
    sw: 135,
    w: 180,
    nw: 225,
    n: 270,
    ne: 315,
  };
  const angle = (((base[handle] + rotation) % 180) + 180) % 180;
  const step = Math.round(angle / 45) % 4;
  return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][step]!;
}

/**
 * How much a pull on `handle` scales `box` uniformly.
 *
 * Measured along the line from the held point through the handle, so the scale
 * follows how far the pointer travelled *outward* and a sideways wobble does
 * nothing. `pull` is already in the element's own unturned frame.
 */
export function uniformScaleFromPull(
  box: DiagramRect,
  handle: ResizeHandle,
  pull: DiagramPoint,
  fromCentre = false,
): number {
  const held = heldPoint(box, handle, fromCentre);
  const grip = handlePoint(box, handle);
  const reach = { x: grip.x - held.x, y: grip.y - held.y };
  const length = reach.x * reach.x + reach.y * reach.y;
  // A handle on an axis the mark has no extent along — the top edge of a
  // perfectly flat line — has nothing to scale.
  if (length < 1e-6) return 1;
  return ((grip.x + pull.x - held.x) * reach.x + (grip.y + pull.y - held.y) * reach.y) / length;
}

interface ScaleGeometry {
  /** The frame the handles are on, unturned. */
  frame: DiagramRect;
  /** The point the element turns about, which is not always the frame's middle. */
  pivot: DiagramPoint;
  rotation: number;
}

/**
 * The point-by-point map for scaling by `scale` about the handle's held point.
 *
 * Scaling moves the centre the element turns about, so on a turned element the
 * held corner would swing across the canvas as it grows. The translation `t`
 * puts it back where it is drawn — the same fix `resizeNode` makes for shapes.
 */
function scaleMap(
  geometry: ScaleGeometry,
  handle: ResizeHandle,
  scale: number,
  fromCentre: boolean,
): (point: DiagramPoint) => DiagramPoint {
  const held = heldPoint(geometry.frame, handle, fromCentre);
  const { pivot, rotation } = geometry;
  const scaledPivot = {
    x: held.x + (pivot.x - held.x) * scale,
    y: held.y + (pivot.y - held.y) * scale,
  };
  const shift = { x: pivot.x - scaledPivot.x, y: pivot.y - scaledPivot.y };
  const turnedShift = rotation ? rotatePoint(shift, { x: 0, y: 0 }, rotation) : shift;
  const t = { x: shift.x - turnedShift.x, y: shift.y - turnedShift.y };
  return (point) => ({
    x: roundTenth(held.x + (point.x - held.x) * scale + t.x),
    y: roundTenth(held.y + (point.y - held.y) * scale + t.y),
  });
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function insideSheet(box: DiagramRect | null): boolean {
  if (!box) return true;
  const slack = 0.5;
  return (
    box.x >= -slack &&
    box.y >= -slack &&
    box.x + box.width <= DIAGRAM_CANVAS_WIDTH + slack &&
    box.y + box.height <= DIAGRAM_CANVAS_HEIGHT + slack
  );
}

/**
 * The scale actually applied: no smaller than the minimum, and no larger than
 * keeps the mark on the sheet.
 *
 * Shrinking is always allowed down to the minimum, even for a mark that already
 * hangs off the sheet — refusing would leave no way to fix it. Growing stops at
 * the largest scale that still fits, found by bisection because the painted
 * box of a turned curve has no convenient closed form.
 */
function clampScale(
  requested: number,
  frame: DiagramRect,
  fits: (scale: number) => boolean,
): number {
  const longest = Math.max(frame.width, frame.height);
  const minimum = longest > 0 ? Math.min(1, MIN_SCALED_EXTENT / longest) : 1;
  const scale = Math.max(requested, minimum);
  if (scale <= 1 || fits(scale)) return scale;
  if (!fits(1)) return 1;
  let low = 1;
  let high = scale;
  for (let step = 0; step < 24; step += 1) {
    const middle = (low + high) / 2;
    if (fits(middle)) low = middle;
    else high = middle;
  }
  return low;
}

function pullInFrame(delta: DiagramPoint, rotation: number): DiagramPoint {
  return rotation ? rotatePoint(delta, { x: 0, y: 0 }, -rotation) : delta;
}

function centreOf(box: DiagramRect): DiagramPoint {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * A freehand stroke scaled from one of its frame's handles.
 *
 * `delta` is how far the pointer has moved since the press, in scene units;
 * `stroke` is the stroke as it was at the press, so a whole gesture is one
 * scale from one starting point rather than an accumulation of rounded steps.
 */
export function scaleInk(
  stroke: StudioInkStroke,
  handle: ResizeHandle,
  delta: DiagramPoint,
  fromCentre = false,
): StudioInkStroke {
  const frame = pointsBounds(stroke.points);
  if (!frame) return stroke;
  const rotation = stroke.rotation ?? 0;
  const geometry: ScaleGeometry = { frame, pivot: centreOf(frame), rotation };
  const apply = (scale: number): StudioInkStroke => {
    const map = scaleMap(geometry, handle, scale, fromCentre);
    return { ...stroke, points: stroke.points.map(map) };
  };
  const requested = uniformScaleFromPull(frame, handle, pullInFrame(delta, rotation), fromCentre);
  const scale = clampScale(requested, frame, (candidate) => {
    // What the turned stroke paints, not the turned box around it: that box
    // stopped a diagonal stroke well short of the edge it could visibly reach.
    return insideSheet(inkPaintedBounds(apply(candidate)));
  });
  return apply(scale);
}

/**
 * A pen or line path scaled from one of its frame's handles.
 *
 * The frame is what the path paints, bulges included, so its corners are where
 * the handles are drawn; the pivot stays the anchors' centre, as it always has.
 * Bezier handles are offsets, so they scale without moving.
 */
export function scalePath(
  path: PathElement,
  handle: ResizeHandle,
  delta: DiagramPoint,
  fromCentre = false,
): PathElement {
  const frame = pathCurveLocalBounds(path);
  const pivotBox = pathLocalBounds(path);
  if (!frame || !pivotBox) return path;
  const rotation = path.rotation ?? 0;
  const geometry: ScaleGeometry = { frame, pivot: centreOf(pivotBox), rotation };
  const apply = (scale: number): PathElement => {
    const map = scaleMap(geometry, handle, scale, fromCentre);
    const offset = (offsetBy: { x: number; y: number } | undefined) =>
      offsetBy && { x: roundTenth(offsetBy.x * scale), y: roundTenth(offsetBy.y * scale) };
    return {
      ...path,
      anchors: path.anchors.map((anchor) => {
        const moved = map(anchor);
        const next = { ...anchor, x: moved.x, y: moved.y };
        if (anchor.in) next.in = offset(anchor.in);
        if (anchor.out) next.out = offset(anchor.out);
        return next;
      }),
    };
  };
  const requested = uniformScaleFromPull(frame, handle, pullInFrame(delta, rotation), fromCentre);
  const scale = clampScale(requested, frame, (candidate) =>
    insideSheet(pathPaintedBounds(apply(candidate))),
  );
  return apply(scale);
}
