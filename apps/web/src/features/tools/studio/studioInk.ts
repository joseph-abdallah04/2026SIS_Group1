// Ink helpers for the studio canvas (diagram artifact v4).
//
// The stroke maths itself lives in `@roundtable/shared` so the editor and the
// board card draw a stroke identically. What is left here is the part that only
// an interactive canvas needs: identity, and turning a screen-space eraser into
// scene units.

import type { DiagramRect, DiagramSurfaceBounds } from '../diagram/diagramModel';

export function createInkId(): string {
  return `ink-${globalThis.crypto.randomUUID()}`;
}

/**
 * A twelve-pixel screen target — precise with a mouse, still reachable with a
 * finger. It is converted into scene units so the eraser stays the same size
 * under the pointer at every zoom level, rather than growing as you zoom in.
 */
const ERASER_RADIUS_CSS_PX = 12;

export function eraserRadiusForView(view: DiagramRect, bounds: DiagramSurfaceBounds): number {
  if (bounds.width <= 0 || bounds.height <= 0) return ERASER_RADIUS_CSS_PX;
  return ERASER_RADIUS_CSS_PX * Math.max(view.width / bounds.width, view.height / bounds.height);
}
