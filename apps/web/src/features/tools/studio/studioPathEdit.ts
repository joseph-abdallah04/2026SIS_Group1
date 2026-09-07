// Editing a path that already exists.
//
// Every operation returns a new path rather than mutating one, so each gesture
// can be a single history entry and undo restores the whole thing. Kept pure
// and out of the editor for the same reason the draft state machine is: the
// fiddly parts — mirroring a tangent, breaking it, deciding whether an anchor
// can go — are worth testing without a canvas.

import {
  constrainAngle,
  mirroredAnchorHandles,
  type PathAnchor,
  type PathElement,
  type PathHandle,
  type StrokePoint,
} from '@roundtable/shared';

export type PathHandleSide = 'in' | 'out';

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** True when the anchor has a curve on either side of it. */
export function isSmoothAnchor(anchor: PathAnchor): boolean {
  return Boolean(anchor.in ?? anchor.out);
}

/**
 * Move one anchor, carrying its handles with it.
 *
 * Handles are stored as offsets precisely so this is a translation and the
 * curve keeps its shape; `constrain` snaps the move to 45° from where the
 * anchor started, which is what Shift does everywhere else on the canvas.
 */
export function moveAnchor(
  path: PathElement,
  index: number,
  to: StrokePoint,
  origin?: StrokePoint,
  constrain = false,
): PathElement {
  const anchor = path.anchors[index];
  if (!anchor) return path;
  const target = constrain && origin ? constrainAngle(origin, to) : to;

  return {
    ...path,
    anchors: path.anchors.map((current, currentIndex) =>
      currentIndex === index ? { ...current, x: round(target.x), y: round(target.y) } : current,
    ),
  };
}

/**
 * Drag one handle.
 *
 * The opposite handle mirrors by default, which keeps the curve smooth through
 * the anchor. `breakTangent` (Alt) leaves it alone, turning a smooth anchor
 * into a cusp — the two sides then bend independently.
 */
export function moveHandle(
  path: PathElement,
  index: number,
  side: PathHandleSide,
  to: StrokePoint,
  breakTangent = false,
): PathElement {
  const anchor = path.anchors[index];
  if (!anchor) return path;

  const dragged: PathHandle = { x: round(to.x - anchor.x), y: round(to.y - anchor.y) };
  const opposite: PathHandleSide = side === 'in' ? 'out' : 'in';
  const next: PathAnchor = { x: anchor.x, y: anchor.y, [side]: dragged };

  if (breakTangent) {
    // Whatever the other side already had stays exactly as it was.
    const kept = anchor[opposite];
    if (kept) next[opposite] = kept;
  } else {
    next[opposite] = { x: -dragged.x, y: -dragged.y };
  }

  return {
    ...path,
    anchors: path.anchors.map((current, currentIndex) => (currentIndex === index ? next : current)),
  };
}

/**
 * Corner ↔ smooth.
 *
 * Smoothing an anchor has to invent a tangent, and the natural one runs along
 * the line between its neighbours; a third of the way to each keeps the curve
 * close to the corner it replaced rather than ballooning past it. An endpoint
 * has only one neighbour, so it leans on that.
 */
export function toggleAnchorSmooth(path: PathElement, index: number): PathElement {
  const anchor = path.anchors[index];
  if (!anchor) return path;

  if (isSmoothAnchor(anchor)) {
    return {
      ...path,
      anchors: path.anchors.map((current, currentIndex) =>
        currentIndex === index ? { x: current.x, y: current.y } : current,
      ),
    };
  }

  const previous = path.anchors[index - 1] ?? (path.closed ? path.anchors.at(-1) : undefined);
  const next = path.anchors[index + 1] ?? (path.closed ? path.anchors[0] : undefined);
  const from = previous ?? anchor;
  const to = next ?? anchor;
  const direction = { x: to.x - from.x, y: to.y - from.y };
  if (direction.x === 0 && direction.y === 0) return path;

  const handle: PathHandle = { x: round(direction.x / 3), y: round(direction.y / 3) };
  return {
    ...path,
    anchors: path.anchors.map((current, currentIndex) =>
      currentIndex === index
        ? { x: current.x, y: current.y, ...mirroredAnchorHandles(handle) }
        : current,
    ),
  };
}

/**
 * Drop one anchor.
 *
 * Returns null when the path would be left with fewer than two anchors, which
 * is nothing worth drawing — the caller deletes the whole path instead.
 */
export function removeAnchor(path: PathElement, index: number): PathElement | null {
  if (index < 0 || index >= path.anchors.length) return path;
  if (path.anchors.length <= 2) return null;
  return { ...path, anchors: path.anchors.filter((_, current) => current !== index) };
}

/**
 * Shift the whole path.
 *
 * Handles are offsets, so only the anchors move — the curve comes along
 * unchanged, which is what makes dragging a shape feel rigid rather than
 * elastic.
 */
export function movePathBy(path: PathElement, dx: number, dy: number): PathElement {
  return {
    ...path,
    anchors: path.anchors.map((anchor) => ({
      ...anchor,
      x: round(anchor.x + dx),
      y: round(anchor.y + dy),
    })),
  };
}

/** Index of the anchor within `tolerance` of a point, nearest first. */
export function anchorAtPoint(
  path: PathElement,
  point: StrokePoint,
  tolerance: number,
): number | null {
  let best: { index: number; distance: number } | null = null;
  path.anchors.forEach((anchor, index) => {
    const distance = Math.hypot(anchor.x - point.x, anchor.y - point.y);
    if (distance <= tolerance && (!best || distance < best.distance)) best = { index, distance };
  });
  return best === null ? null : (best as { index: number }).index;
}
