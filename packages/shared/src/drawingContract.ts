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
