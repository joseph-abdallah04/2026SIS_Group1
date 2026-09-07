import {
  DRAWING_PEN_WIDTHS,
  simplifyStrokePoints,
  strokePathData,
  strokePointsTouch,
  DRAWING_VIEWBOX_HEIGHT,
  DRAWING_VIEWBOX_WIDTH,
  packDrawingPoints,
  unpackDrawingPoints,
  type DrawingInk,
  type DrawingPenWidth,
  type DrawingStrokeData,
} from '@roundtable/shared';

import { DRAWING_SVG_LIMIT } from '../artifactLimits';

// This ratio closely matches the board card's 230x160 preview, avoiding visible distortion.

export const DRAWING_INKS = {
  ink: '#080C15',
  ocean: '#4D6A74',
  gold: '#E0A33C',
  rose: '#B85C6F',
} as const;

// Three widths stay distinct after the 720x500 artwork scales into the board preview.

export type PenWidth = DrawingPenWidth;
export const PEN_WIDTHS = DRAWING_PEN_WIDTHS;
export { DRAWING_VIEWBOX_WIDTH, DRAWING_VIEWBOX_HEIGHT };
export type { DrawingInk };

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface DrawingStroke {
  id: string;
  ink: DrawingInk;
  width: PenWidth;
  points: DrawingPoint[];
}

export interface DrawingSurfaceBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type PreparedDrawing =
  { ok: true; svg: string; strokes: DrawingStrokeData[] } | { ok: false; error: string };

// A twelve-pixel screen target stays precise on desktop while remaining usable on touch screens.
const ERASER_RADIUS_CSS_PX = 12;

// The stroke maths is shared with the studio canvas (`drawingContract.ts`), so
// both surfaces and the board card simplify and draw a stroke identically.
// Re-exported under this module's existing names so its callers are unchanged.
export const simplifyStroke = simplifyStrokePoints;
export { strokePathData };

export function clampDrawingPoint(point: DrawingPoint): DrawingPoint {
  return {
    x: Math.min(DRAWING_VIEWBOX_WIDTH, Math.max(0, point.x)),
    y: Math.min(DRAWING_VIEWBOX_HEIGHT, Math.max(0, point.y)),
  };
}

export function clientPointToDrawingPoint(
  clientPoint: DrawingPoint,
  bounds: DrawingSurfaceBounds,
): DrawingPoint {
  if (bounds.width <= 0 || bounds.height <= 0) return { x: 0, y: 0 };
  return clampDrawingPoint({
    x: ((clientPoint.x - bounds.left) / bounds.width) * DRAWING_VIEWBOX_WIDTH,
    y: ((clientPoint.y - bounds.top) / bounds.height) * DRAWING_VIEWBOX_HEIGHT,
  });
}

export function eraserRadiusForSurface(bounds: DrawingSurfaceBounds): number {
  if (bounds.width <= 0 || bounds.height <= 0) return ERASER_RADIUS_CSS_PX;
  return (
    ERASER_RADIUS_CSS_PX *
    Math.max(DRAWING_VIEWBOX_WIDTH / bounds.width, DRAWING_VIEWBOX_HEIGHT / bounds.height)
  );
}

export function eraseStrokesAtPoint(
  strokes: readonly DrawingStroke[],
  point: DrawingPoint,
  radius = ERASER_RADIUS_CSS_PX,
): DrawingStroke[] {
  return strokes.filter((stroke) => !strokePointsTouch(stroke.points, stroke.width, point, radius));
}

export function serializeDrawingSvg(strokes: readonly DrawingStroke[]): string {
  const paths = strokes
    .filter((stroke) => stroke.points.length > 0)
    .map((stroke) => {
      const path = strokePathData(simplifyStroke(stroke.points));
      return `<path d="${path}" stroke="${DRAWING_INKS[stroke.ink]}" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DRAWING_VIEWBOX_WIDTH} ${DRAWING_VIEWBOX_HEIGHT}" fill="none">${paths}</svg>`;
}

/**
 * How much of the artifact budget a drawing uses.
 *
 * The rendered SVG and the strokes are stored together and share one limit, so
 * anything reporting or enforcing that budget has to count both. This exists so
 * the editor's meter and the check on save cannot drift: metering the SVG alone
 * let a dense sketch look comfortably under budget and then be refused.
 *
 * Takes the SVG rather than the strokes it came from, because the caller has
 * already serialised it and doing so again on every stroke is not free.
 */
export function drawingArtifactSize(svg: string, strokes: readonly DrawingStroke[]): number {
  return svg.length + JSON.stringify(strokesToData(strokes)).length;
}

export function prepareDrawing(strokes: readonly DrawingStroke[]): PreparedDrawing {
  if (!strokes.some((stroke) => stroke.points.length > 0)) {
    return { ok: false, error: 'Draw something before proposing this sketch.' };
  }

  const svg = serializeDrawingSvg(strokes);
  const stored = strokesToData(strokes);

  // Both halves share one budget, and they are stored together, so they are
  // measured together. Checking only the SVG would let a drawing through that
  // the server then rejects for the size of its strokes.
  if (drawingArtifactSize(svg, strokes) > DRAWING_SVG_LIMIT) {
    return {
      ok: false,
      error: 'This sketch is too detailed to propose. Undo a few strokes and try again.',
    };
  }

  return { ok: true, svg, strokes: stored };
}

/**
 * Strokes as they are stored.
 *
 * Simplified first, so what is kept is exactly what the SVG draws — storing the
 * raw pointer samples would cost far more and reproduce detail the rendering
 * already discarded.
 */
export function strokesToData(strokes: readonly DrawingStroke[]): DrawingStrokeData[] {
  return strokes
    .filter((stroke) => stroke.points.length > 0)
    .map((stroke) => ({
      ink: stroke.ink,
      width: stroke.width,
      points: packDrawingPoints(simplifyStroke(stroke.points)),
    }));
}

/** Strokes as the editor works on them. Ids are local, so they are minted here. */
export function dataToStrokes(strokes: readonly DrawingStrokeData[]): DrawingStroke[] {
  return strokes.map((stroke, index) => ({
    id: `stored-${index}`,
    ink: stroke.ink,
    width: stroke.width,
    points: unpackDrawingPoints(stroke.points),
  }));
}
