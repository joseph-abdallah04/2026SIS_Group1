// The pen and line tools, as state rather than as event handlers.
//
// A path being drawn is just a list of anchors plus wherever the pointer is, so
// everything here is a pure function over that pair. Keeping it out of the
// editor means the awkward parts — closing onto the first anchor, finishing a
// path that never got a second anchor, mirroring a handle — are testable
// without a canvas.

import {
  constrainAngle,
  mirroredAnchorHandles,
  type DiagramFillKey,
  type DiagramStrokeKey,
  type DiagramStrokeStyle,
  type DiagramStrokeWidthPreset,
  type PathAnchor,
  type PathElement,
  type StrokePoint,
} from '@roundtable/shared';

export interface PathStyle {
  strokeColor?: DiagramStrokeKey;
  strokeWidthPreset?: DiagramStrokeWidthPreset;
  strokeStyle?: DiagramStrokeStyle;
  fillColor?: DiagramFillKey;
}

export function createPathId(): string {
  return `path-${globalThis.crypto.randomUUID()}`;
}

/**
 * How close the pointer must come to the first anchor to close the path.
 *
 * In scene units at 1:1. The editor scales it by the current zoom so the target
 * stays the same size on screen however far in you are.
 */
export const PATH_CLOSE_TOLERANCE = 10;

export function isNearFirstAnchor(
  anchors: readonly PathAnchor[],
  point: StrokePoint,
  tolerance: number,
): boolean {
  const first = anchors[0];
  // Two anchors already exist before closing means anything, and a path needs
  // three to enclose an area rather than double back on itself.
  if (!first || anchors.length < 3) return false;
  return Math.hypot(first.x - point.x, first.y - point.y) <= tolerance;
}

/**
 * Where the next anchor goes.
 *
 * With shift held it snaps to 45° from the previous anchor, which is what makes
 * a truly horizontal or vertical segment possible; the first anchor has nothing
 * to measure from, so it lands where the pointer is.
 */
export function nextAnchorPoint(
  anchors: readonly PathAnchor[],
  point: StrokePoint,
  constrain: boolean,
): StrokePoint {
  const previous = anchors.at(-1);
  if (!constrain || !previous) return point;
  return constrainAngle({ x: previous.x, y: previous.y }, point);
}

/**
 * The anchor a drag off a placed point produces.
 *
 * Dragging pulls the outgoing handle towards the pointer and mirrors it on the
 * way in, which is the smooth anchor every vector pen draws. A press with no
 * drag leaves both handles absent, which is a corner.
 */
export function anchorWithDraggedHandle(
  anchor: PathAnchor,
  pointer: StrokePoint | null,
): PathAnchor {
  if (!pointer) return { x: anchor.x, y: anchor.y };
  const handle = { x: pointer.x - anchor.x, y: pointer.y - anchor.y };
  if (handle.x === 0 && handle.y === 0) return { x: anchor.x, y: anchor.y };
  return { x: anchor.x, y: anchor.y, ...mirroredAnchorHandles(handle) };
}

/**
 * The path as it should be drawn mid-gesture: the committed anchors plus a
 * provisional one under the pointer, so the segment being aimed is visible.
 */
export function draftAnchors(
  anchors: readonly PathAnchor[],
  cursor: StrokePoint | null,
): PathAnchor[] {
  if (!cursor || anchors.length === 0) return [...anchors];
  return [...anchors, { x: cursor.x, y: cursor.y }];
}

/**
 * Finish a draft.
 *
 * Returns null when there is nothing worth keeping — a single click that placed
 * one anchor and went nowhere is a mis-click, not a path, and silently dropping
 * it is kinder than leaving a dot on the canvas.
 */
export function finishPathDraft(
  anchors: readonly PathAnchor[],
  closed: boolean,
  style: PathStyle,
): PathElement | null {
  if (anchors.length < 2) return null;
  return {
    id: createPathId(),
    anchors: anchors.map((anchor) => ({ ...anchor })),
    ...(closed ? { closed: true } : {}),
    ...(style.strokeColor ? { strokeColor: style.strokeColor } : {}),
    ...(style.strokeWidthPreset ? { strokeWidthPreset: style.strokeWidthPreset } : {}),
    ...(style.strokeStyle && style.strokeStyle !== 'solid'
      ? { strokeStyle: style.strokeStyle }
      : {}),
    // A fill only means anything on a closed path, and the write path rejects
    // one on an open path, so it is dropped here rather than sent to be refused.
    ...(closed && style.fillColor ? { fillColor: style.fillColor } : {}),
  };
}
