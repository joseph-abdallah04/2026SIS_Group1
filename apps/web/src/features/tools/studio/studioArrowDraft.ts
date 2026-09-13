// Drawing an arrow, as state rather than as event handlers.
//
// The same shape as `studioPaths`: an arrow being placed is two endpoints and
// wherever the pointer is, so everything here is a pure function over that.
// Keeping it out of the editor means the awkward parts — deciding what the
// pointer is near enough to bind to, refusing a zero-length arrow, working out
// what dragging an elbow's middle leg means — are testable without a canvas.

import {
  arrowGeometry,
  diagramBoundaryScale,
  type ArrowAttach,
  type ArrowElement,
  type ArrowEndpoint,
  type ArrowPoint,
  type ArrowRoute,
  type ArrowTarget,
  type ArrowTargetLookup,
  type DiagramStrokeKey,
  type DiagramStrokeStyle,
  type DiagramStrokeWidthPreset,
} from '@roundtable/shared';

export function createArrowId(): string {
  return `arrow-${globalThis.crypto.randomUUID()}`;
}

/**
 * How close the pointer must come to an element to bind to it, in CSS pixels.
 * Scaled to scene units by `arrowSnapToleranceForView`, so the catchment stays
 * the same size on screen however far in the canvas is zoomed.
 */
export const ARROW_SNAP_TOLERANCE = 14;

interface ViewExtent {
  width: number;
  height: number;
}

export function arrowSnapToleranceForView(view: ViewExtent, bounds: ViewExtent): number {
  if (bounds.width <= 0 || bounds.height <= 0) return ARROW_SNAP_TOLERANCE;
  return ARROW_SNAP_TOLERANCE * Math.max(view.width / bounds.width, view.height / bounds.height);
}

/**
 * Shorter than this and the arrow is a smudge, not a mark.
 *
 * A press that never became a drag lands here: it leaves the placement open for
 * a second click rather than dropping an arrow with both ends in one spot.
 */
export const ARROW_MIN_LENGTH = 6;

export interface ArrowStyle {
  strokeColor?: DiagramStrokeKey;
  strokeWidthPreset?: DiagramStrokeWidthPreset;
  strokeStyle?: DiagramStrokeStyle;
}

export interface ArrowSnap {
  elementId: string;
  /** Where to show the feedback dot: exactly where the arrow would attach. */
  point: ArrowPoint;
  /** That point as a fraction of the element's box, when it is worth pinning. */
  at?: ArrowAttach;
}

/**
 * How near an outline counts as aiming at the edge rather than at the element.
 *
 * Inside this band the attachment is pinned where it was dropped, so an arrow
 * can meet a table's left edge two thirds of the way down. Dropped further in
 * than this, the arrow keeps the old behaviour and aims at the centre, so it
 * slides around the outline as the far end moves. A drawing has no meaningful
 * inside, so it always pins.
 */
const EDGE_BAND = 1.6;

function centreOf(target: ArrowTarget): ArrowPoint {
  return { x: target.box.x + target.box.width / 2, y: target.box.y + target.box.height / 2 };
}

/**
 * How far the point is from an element's outline, and where on it.
 *
 * Measured along the ray from the element's centre, which is the same rule the
 * arrow itself lands by — so the feedback dot sits exactly where the arrow will
 * attach if the far end is in that direction. A point inside the outline counts
 * as touching: hovering over a shape should bind to it, not require the rim.
 */
function outlineHit(target: ArrowTarget, point: ArrowPoint): { distance: number; on: ArrowPoint } {
  const centre = centreOf(target);
  const delta = { x: point.x - centre.x, y: point.y - centre.y };
  if (delta.x === 0 && delta.y === 0) return { distance: 0, on: centre };

  const size = { width: target.box.width, height: target.box.height };
  const scale = diagramBoundaryScale(target.shape, size, delta);
  const on = { x: centre.x + delta.x * scale, y: centre.y + delta.y * scale };
  // `scale` is how far along `delta` the outline sits. At or past 1 the point is
  // within the outline, so the pointer is over the element itself.
  if (scale >= 1) return { distance: 0, on };
  return { distance: Math.hypot(point.x - on.x, point.y - on.y), on };
}

function area(target: ArrowTarget): number {
  return target.box.width * target.box.height;
}

/** A point on an element's box, as the fraction the contract stores. */
function attachFor(target: ArrowTarget, point: ArrowPoint): ArrowAttach {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return {
    u: target.box.width === 0 ? 0.5 : clamp((point.x - target.box.x) / target.box.width),
    v: target.box.height === 0 ? 0.5 : clamp((point.y - target.box.y) / target.box.height),
  };
}

/**
 * The element an endpoint dropped here should bind to, if any.
 *
 * Ties are broken by the smaller element, so a shape sitting inside a big
 * drawing's extent wins over the drawing: the small thing under the pointer is
 * what was aimed at.
 */
export function snapArrowPoint(
  point: ArrowPoint,
  targets: Iterable<ArrowTarget>,
  tolerance = ARROW_SNAP_TOLERANCE,
): ArrowSnap | null {
  let best: (ArrowSnap & { distance: number; area: number }) | null = null;
  for (const target of targets) {
    const hit = outlineHit(target, point);
    if (hit.distance > tolerance) continue;

    // A drawing is landed on wherever it was aimed; a solid element pins only
    // when the aim was at its edge, and otherwise keeps aiming at its centre.
    const pinned =
      target.freeform || hit.distance > 0 || outlineDepth(target, point) <= tolerance * EDGE_BAND;
    const on = target.freeform ? point : hit.on;
    const candidate: ArrowSnap & { distance: number; area: number } = {
      elementId: target.id,
      point: on,
      ...(pinned ? { at: attachFor(target, on) } : {}),
      distance: hit.distance,
      area: area(target),
    };

    if (
      best === null ||
      candidate.distance < best.distance ||
      (candidate.distance === best.distance && candidate.area < best.area)
    ) {
      best = candidate;
    }
  }
  return best
    ? { elementId: best.elementId, point: best.point, ...(best.at ? { at: best.at } : {}) }
    : null;
}

/** How far inside the outline the point sits, for the edge band above. */
function outlineDepth(target: ArrowTarget, point: ArrowPoint): number {
  const centre = centreOf(target);
  const delta = { x: point.x - centre.x, y: point.y - centre.y };
  if (delta.x === 0 && delta.y === 0) return Number.POSITIVE_INFINITY;
  const size = { width: target.box.width, height: target.box.height };
  const scale = diagramBoundaryScale(target.shape, size, delta);
  const on = { x: centre.x + delta.x * scale, y: centre.y + delta.y * scale };
  return Math.hypot(point.x - on.x, point.y - on.y);
}

/** An endpoint at this point, bound to whatever it landed on. */
export function arrowEndpointAt(
  point: ArrowPoint,
  targets: Iterable<ArrowTarget>,
  tolerance = ARROW_SNAP_TOLERANCE,
): ArrowEndpoint {
  const snap = snapArrowPoint(point, targets, tolerance);
  // The point is kept even when bound: it is where the arrow falls back to if
  // that element is ever deleted.
  if (!snap) return { x: point.x, y: point.y };
  return {
    x: point.x,
    y: point.y,
    elementId: snap.elementId,
    ...(snap.at ? { at: snap.at } : {}),
  };
}

export interface ArrowDraft {
  from: ArrowEndpoint;
  to: ArrowEndpoint;
  route: ArrowRoute;
}

export function draftArrow(draft: ArrowDraft, style: ArrowStyle = {}): ArrowElement {
  return {
    id: 'arrow-draft',
    from: draft.from,
    to: draft.to,
    ...(draft.route === 'elbow' ? { route: 'elbow' as const } : {}),
    ...(style.strokeColor ? { strokeColor: style.strokeColor } : {}),
    ...(style.strokeWidthPreset ? { strokeWidthPreset: style.strokeWidthPreset } : {}),
    ...(style.strokeStyle && style.strokeStyle !== 'solid'
      ? { strokeStyle: style.strokeStyle }
      : {}),
  };
}

/** Has the pointer travelled far enough for this to be an arrow? */
export function isArrowWorthPlacing(draft: ArrowDraft): boolean {
  // Both ends on one element is a self-loop, which is drawn around that element
  // and so has a length of its own however close the two drops were.
  if (draft.from.elementId !== undefined && draft.from.elementId === draft.to.elementId) {
    return true;
  }
  return Math.hypot(draft.to.x - draft.from.x, draft.to.y - draft.from.y) >= ARROW_MIN_LENGTH;
}

/** The finished arrow, with a fresh id. */
export function finishArrow(draft: ArrowDraft, style: ArrowStyle = {}): ArrowElement | null {
  if (!isArrowWorthPlacing(draft)) return null;
  return { ...draftArrow(draft, style), id: createArrowId() };
}

/**
 * What dragging an elbow's middle leg to this point means, as a `bend`.
 *
 * The leg runs along one axis and slides along the other, so only one of the
 * pointer's coordinates matters — which one depends on the axis the route led
 * with, and that is decided by the endpoints rather than stored.
 */
export function bendForPointer(
  arrow: ArrowElement,
  pointer: ArrowPoint,
  lookup?: ArrowTargetLookup,
): number {
  const geometry = arrowGeometry({ ...arrow, bend: 0 }, lookup);
  const [start, corner] = geometry.points;
  if (!start || !corner || geometry.points.length < 4) return arrow.bend ?? 0;

  // A route that leads horizontally turns at a shared x, so its middle leg is
  // the vertical one and slides sideways.
  const vertical = Math.abs(corner.x - start.x) > Math.abs(corner.y - start.y);
  return Math.round(vertical ? pointer.x - corner.x : pointer.y - corner.y);
}

/** Where the handle for that middle leg sits. */
export function elbowHandlePoint(
  arrow: ArrowElement,
  lookup?: ArrowTargetLookup,
): ArrowPoint | null {
  const geometry = arrowGeometry(arrow, lookup);
  if (geometry.points.length < 4) return null;
  const [, first, second] = geometry.points;
  if (!first || !second) return null;
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}
