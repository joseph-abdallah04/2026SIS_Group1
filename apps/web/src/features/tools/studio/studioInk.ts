// Ink on the studio canvas, as the editor works with it.
//
// The stored shape (`InkElement`, packed points) lives in `@roundtable/shared`
// and the stroke maths is shared with the drawing tool. What is here is the
// part only an interactive canvas needs: the unpacked working form, identity,
// the eraser, and turning a screen-space eraser into scene units.

import {
  DIAGRAM_INK_POINT_LIMIT,
  inkStrokeWidth,
  packInkPoints,
  simplifyStrokePoints,
  strokePointsTouch,
  unpackDrawingPoints,
  type DiagramStrokeKey,
  type DiagramStrokeWidthPreset,
  type InkElement,
  type StrokePoint,
} from '@roundtable/shared';

// Deliberately structural rather than importing `DiagramRect` from the diagram
// model: that module packs ink through `inkToData` below, and naming its types
// here would put a cycle between the two.
interface ViewExtent {
  width: number;
  height: number;
}

/**
 * A stroke mid-edit. Points stay unpacked so rendering and hit-testing do not
 * unpack on every frame; `inkToData` packs them once, at the write boundary.
 * This is the same split the drawing tool uses for `DrawingStroke`.
 */
export interface StudioInkStroke {
  id: string;
  points: StrokePoint[];
  strokeColor?: DiagramStrokeKey;
  strokeWidthPreset?: DiagramStrokeWidthPreset;
}

export function createInkId(): string {
  return `ink-${globalThis.crypto.randomUUID()}`;
}

/** Editor strokes as stored: simplified once, then packed. */
/**
 * The most points a stroke may carry. The contract's cap counts packed numbers,
 * two per drawn point.
 */
const MAX_STROKE_POINTS = Math.floor(DIAGRAM_INK_POINT_LIMIT / 2);

/**
 * A finished stroke, trimmed to something the artifact can actually hold.
 *
 * A pointer reports a position every few milliseconds, so a long unhurried
 * stroke arrives with thousands of points — far past the cap, and a stroke over
 * the cap is refused by the write path and dropped by the read path. Neither
 * failure says anything useful: proposing just stops working, and a saved
 * canvas comes back without its drawing.
 *
 * Simplified first, which is what the drawing tool has always done to its own
 * strokes and is invisible at this tolerance. Simplification has no ceiling of
 * its own, though — a genuinely intricate scribble stays intricate — so an
 * even thinning follows for the stroke that is still too long. Losing every
 * other point of an enormous stroke is a change nobody can see; losing the
 * whole stroke is not.
 */
export function fitInkStroke(stroke: StudioInkStroke): StudioInkStroke {
  const simplified = simplifyStrokePoints(stroke.points);
  if (simplified.length <= MAX_STROKE_POINTS) return { ...stroke, points: simplified };

  const step = simplified.length / MAX_STROKE_POINTS;
  const thinned: StrokePoint[] = [];
  for (let index = 0; thinned.length < MAX_STROKE_POINTS - 1; index += 1) {
    const point = simplified[Math.floor(index * step)];
    if (!point) break;
    thinned.push(point);
  }
  // The last point is kept whatever the arithmetic says: a stroke that stops
  // short of where the pointer was lifted reads as a different stroke.
  thinned.push(simplified[simplified.length - 1]!);
  return { ...stroke, points: thinned };
}

export function inkToData(strokes: readonly StudioInkStroke[]): InkElement[] {
  return strokes
    .filter((stroke) => stroke.points.length > 0)
    .map((stroke) => ({
      id: stroke.id,
      points: packInkPoints(stroke.points),
      ...(stroke.strokeColor ? { strokeColor: stroke.strokeColor } : {}),
      ...(stroke.strokeWidthPreset ? { strokeWidthPreset: stroke.strokeWidthPreset } : {}),
    }));
}

/** Stored strokes as the editor works on them. */
export function dataToInk(strokes: readonly InkElement[]): StudioInkStroke[] {
  return strokes.map((stroke) => ({
    id: stroke.id,
    points: unpackDrawingPoints(stroke.points),
    ...(stroke.strokeColor ? { strokeColor: stroke.strokeColor } : {}),
    ...(stroke.strokeWidthPreset ? { strokeWidthPreset: stroke.strokeWidthPreset } : {}),
  }));
}

/** Whole-stroke eraser, matching the drawing tool: a touched stroke goes entirely. */
export function eraseInkAtPoint(
  strokes: readonly StudioInkStroke[],
  point: StrokePoint,
  radius: number,
): StudioInkStroke[] {
  return strokes.filter(
    (stroke) => !strokePointsTouch(stroke.points, inkStrokeWidth(stroke), point, radius),
  );
}

/**
 * A twelve-pixel screen target — precise with a mouse, still reachable with a
 * finger. It is converted into scene units so the eraser stays the same size
 * under the pointer at every zoom level, rather than growing as you zoom in.
 */
const ERASER_RADIUS_CSS_PX = 12;

export function eraserRadiusForView(view: ViewExtent, bounds: ViewExtent): number {
  if (bounds.width <= 0 || bounds.height <= 0) return ERASER_RADIUS_CSS_PX;
  return ERASER_RADIUS_CSS_PX * Math.max(view.width / bounds.width, view.height / bounds.height);
}
