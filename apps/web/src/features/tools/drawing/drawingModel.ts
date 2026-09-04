import { DRAWING_SVG_LIMIT } from '../artifactLimits';

// This ratio closely matches the board card's 230x160 preview, avoiding visible distortion.
export const DRAWING_VIEWBOX_WIDTH = 720;
export const DRAWING_VIEWBOX_HEIGHT = 500;

export const DRAWING_INKS = {
  ink: '#080C15',
  ocean: '#4D6A74',
  gold: '#E0A33C',
  rose: '#B85C6F',
} as const;

// Three widths stay distinct after the 720x500 artwork scales into the board preview.
export const PEN_WIDTHS = [4, 8, 14] as const;

export type DrawingInk = keyof typeof DRAWING_INKS;
export type PenWidth = (typeof PEN_WIDTHS)[number];

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

export type PreparedDrawing = { ok: true; svg: string } | { ok: false; error: string };

// Sub-two-unit tolerance removes pointer noise without flattening intentional corners.
const SIMPLIFICATION_TOLERANCE = 1.5;
// A twelve-pixel screen target stays precise on desktop while remaining usable on touch screens.
const ERASER_RADIUS_CSS_PX = 12;

function squaredDistance(first: DrawingPoint, second: DrawingPoint): number {
  const deltaX = first.x - second.x;
  const deltaY = first.y - second.y;
  return deltaX * deltaX + deltaY * deltaY;
}

function squaredSegmentDistance(
  point: DrawingPoint,
  start: DrawingPoint,
  end: DrawingPoint,
): number {
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

function simplifyRadialDistance(
  points: readonly DrawingPoint[],
  squaredTolerance: number,
): DrawingPoint[] {
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

function simplifyDouglasPeucker(
  points: readonly DrawingPoint[],
  squaredTolerance: number,
): DrawingPoint[] {
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

export function simplifyStroke(
  points: readonly DrawingPoint[],
  tolerance = SIMPLIFICATION_TOLERANCE,
): DrawingPoint[] {
  if (points.length <= 2) return [...points];
  const squaredTolerance = tolerance * tolerance;
  return simplifyDouglasPeucker(simplifyRadialDistance(points, squaredTolerance), squaredTolerance);
}

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

function strokeTouchesPoint(stroke: DrawingStroke, point: DrawingPoint, radius: number): boolean {
  const hitRadius = radius + stroke.width / 2;
  const squaredHitRadius = hitRadius * hitRadius;

  if (stroke.points.length === 1) {
    const onlyPoint = stroke.points[0];
    return onlyPoint ? squaredDistance(onlyPoint, point) <= squaredHitRadius : false;
  }

  for (let index = 1; index < stroke.points.length; index += 1) {
    const start = stroke.points[index - 1];
    const end = stroke.points[index];
    if (start && end && squaredSegmentDistance(point, start, end) <= squaredHitRadius) {
      return true;
    }
  }

  return false;
}

export function eraseStrokesAtPoint(
  strokes: readonly DrawingStroke[],
  point: DrawingPoint,
  radius = ERASER_RADIUS_CSS_PX,
): DrawingStroke[] {
  return strokes.filter((stroke) => !strokeTouchesPoint(stroke, point, radius));
}

function roundCoordinate(value: number): string {
  return String(Math.round(value * 10) / 10);
}

export function strokePathData(points: readonly DrawingPoint[]): string {
  const first = points[0];
  if (!first) return '';
  if (points.length === 1) {
    return `M ${roundCoordinate(first.x)} ${roundCoordinate(first.y)} l 0.1 0`;
  }

  let path = `M ${roundCoordinate(first.x)} ${roundCoordinate(first.y)}`;

  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const next = points[index + 1];
    if (!point || !next) continue;
    const midpoint = {
      x: (point.x + next.x) / 2,
      y: (point.y + next.y) / 2,
    };
    path += ` Q ${roundCoordinate(point.x)} ${roundCoordinate(point.y)} ${roundCoordinate(midpoint.x)} ${roundCoordinate(midpoint.y)}`;
  }

  const last = points.at(-1);
  return last ? `${path} L ${roundCoordinate(last.x)} ${roundCoordinate(last.y)}` : path;
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

export function prepareDrawing(strokes: readonly DrawingStroke[]): PreparedDrawing {
  if (!strokes.some((stroke) => stroke.points.length > 0)) {
    return { ok: false, error: 'Draw something before proposing this sketch.' };
  }

  const svg = serializeDrawingSvg(strokes);
  if (svg.length > DRAWING_SVG_LIMIT) {
    return {
      ok: false,
      error: 'This sketch is too detailed to propose. Undo a few strokes and try again.',
    };
  }

  return { ok: true, svg };
}
