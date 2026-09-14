/**
 * The drawing artifact contract.
 *
 * A drawing is a list of strokes. The SVG stored beside them is a *rendering*
 * of those strokes, kept so a card can be displayed without the editor and
 * without a client that understands strokes at all.
 *
 * Both are stored because the relationship is one-way: serialising simplifies
 * each stroke's points, so an SVG cannot be turned back into the strokes that
 * produced it. Without the strokes, reopening a drawing to edit it would mean
 * starting from a blank canvas and replacing the artwork rather than changing
 * it. Keeping them makes an edit a true round trip.
 *
 * Only the keys and bounds live here — the ink hex values are presentation and
 * stay with the editor. This is the same split the diagram contract uses.
 */

export const DRAWING_INK_KEYS = ['ink', 'ocean', 'gold', 'rose'] as const;
export type DrawingInk = (typeof DRAWING_INK_KEYS)[number];

/** Three widths that stay distinct once artwork scales into a board card. */
export const DRAWING_PEN_WIDTHS = [4, 8, 14] as const;
export type DrawingPenWidth = (typeof DRAWING_PEN_WIDTHS)[number];

/** The coordinate space every stroke is expressed in. */
export const DRAWING_VIEWBOX_WIDTH = 720;
export const DRAWING_VIEWBOX_HEIGHT = 500;

/**
 * One stroke, as stored.
 *
 * Points are a flat `[x0, y0, x1, y1, …]` list rather than `{x, y}` objects:
 * the same path costs roughly a third as many characters, which matters
 * because the strokes and the SVG they render share one size budget.
 */
export interface DrawingStrokeData {
  ink: DrawingInk;
  width: DrawingPenWidth;
  points: number[];
}

/**
 * Ceiling for a drawing artifact, counting the SVG and the strokes together.
 *
 * docs/02 §8.5 caps artifacts at roughly 100KB. That budget belongs to the
 * whole artifact, so storing the strokes does not raise it — a drawing
 * detailed enough to exceed it was already close to the limit.
 */
export const DRAWING_ARTIFACT_LIMIT = 100_000;

/** Flatten editor strokes for storage. */
export function packDrawingPoints(points: readonly { x: number; y: number }[]): number[] {
  const packed: number[] = [];
  for (const point of points) {
    // One decimal place: the artwork is 720x500, so a tenth of a unit is far
    // finer than a pen stroke can be seen at, and full float precision would
    // spend most of the size budget on digits nobody can perceive.
    packed.push(Math.round(point.x * 10) / 10, Math.round(point.y * 10) / 10);
  }
  return packed;
}

/** Rebuild editor points from storage, ignoring a trailing unpaired value. */
export function unpackDrawingPoints(points: readonly number[]): { x: number; y: number }[] {
  const unpacked: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    unpacked.push({ x: points[i]!, y: points[i + 1]! });
  }
  return unpacked;
}

// --- Stroke geometry ------------------------------------------------------
//
// Shared by the drawing tool and the studio canvas's v4 ink. Both draw the same
// kind of mark, so simplification, path data and hit-testing live here once
// rather than once per surface — and the board card, which renders both without
// either editor, gets the identical result.
//
// These work on unpacked `{x, y}` points: packing is a storage concern, and
// every caller is either mid-gesture or about to render.

export interface StrokePoint {
  x: number;
  y: number;
}

/** Sub-two-unit tolerance removes pointer noise without flattening corners. */
export const STROKE_SIMPLIFICATION_TOLERANCE = 1.5;

function squaredDistance(first: StrokePoint, second: StrokePoint): number {
  const deltaX = first.x - second.x;
  const deltaY = first.y - second.y;
  return deltaX * deltaX + deltaY * deltaY;
}

function squaredSegmentDistance(point: StrokePoint, start: StrokePoint, end: StrokePoint): number {
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
  points: readonly StrokePoint[],
  squaredTolerance: number,
): StrokePoint[] {
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
  points: readonly StrokePoint[],
  squaredTolerance: number,
): StrokePoint[] {
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

export function simplifyStrokePoints(
  points: readonly StrokePoint[],
  tolerance = STROKE_SIMPLIFICATION_TOLERANCE,
): StrokePoint[] {
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
export function strokePathData(points: readonly StrokePoint[]): string {
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

/**
 * True when an eraser of `radius` at `point` covers any part of the stroke.
 * `width` is the stroke's own thickness, which widens the hit area.
 */
export function strokePointsTouch(
  points: readonly StrokePoint[],
  width: number,
  point: StrokePoint,
  radius: number,
): boolean {
  const hitRadius = radius + width / 2;
  const squaredHitRadius = hitRadius * hitRadius;

  if (points.length === 1) {
    const onlyPoint = points[0];
    return onlyPoint ? squaredDistance(onlyPoint, point) <= squaredHitRadius : false;
  }

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (start && end && squaredSegmentDistance(point, start, end) <= squaredHitRadius) {
      return true;
    }
  }

  return false;
}
