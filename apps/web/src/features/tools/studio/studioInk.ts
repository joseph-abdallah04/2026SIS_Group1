// Ink on the studio canvas, as the editor works with it.
//
// The stored shape (`InkElement`, packed points) lives in `@roundtable/shared`
// and the stroke maths is shared with the drawing tool. What is here is the
// part only an interactive canvas needs: the unpacked working form, identity,
// the eraser, and turning a screen-space eraser into scene units.

import {
  inkStrokeWidth,
  packInkPoints,
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
