// Grid snapping for a studio drag.
//
// The canvas has exactly one snapping rule, and it is the one the diagram has
// always had: positions land on the 8-unit grid, and the canvas's snap toggle
// turns it off. Ink, paths and tables had no snapping at all before this, so
// they drifted off the grid the shapes sat on; this puts every element on the
// same footing.
//
// Snapping a drag to *other elements* was tried and removed: guides firing off
// nearby edges made a drag feel like it was being grabbed at, which is worse
// than landing a few units out. If it ever returns it should be a separate,
// explicitly enabled mode rather than something layered onto this.

import {
  DIAGRAM_CANVAS_HEIGHT,
  DIAGRAM_CANVAS_WIDTH,
  snapToGrid,
  type DiagramPoint,
  type DiagramRect,
} from '../diagram/diagramModel';
import {
  handleAxes,
  handlePoint,
  heldPoint,
  uniformScaleFromPull,
  type ResizeHandle,
} from './studioScale';

/**
 * Adjust a proposed drag so the moving artwork lands on the grid.
 *
 * `moving` is where the dragged bounds would end up before snapping. A group is
 * snapped by its outer box rather than by any one member, so a multi-element
 * drag keeps its internal spacing exactly.
 */
export function snapDragToGrid(
  moving: DiagramRect,
  delta: DiagramPoint,
  snapEnabled: boolean,
): DiagramPoint {
  if (!snapEnabled) return delta;
  return {
    x: delta.x + (snapToGrid(moving.x) - moving.x),
    y: delta.y + (snapToGrid(moving.y) - moving.y),
  };
}

/** The box around a set of boxes, which is what a group drag snaps by. */
export function unionBounds(rects: readonly DiagramRect[]): DiagramRect | null {
  const first = rects[0];
  if (!first) return null;
  let minX = first.x;
  let minY = first.y;
  let maxX = first.x + first.width;
  let maxY = first.y + first.height;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function offsetRect(rect: DiagramRect, delta: DiagramPoint): DiagramRect {
  return { ...rect, x: rect.x + delta.x, y: rect.y + delta.y };
}

/**
 * Hold a dragged group inside the sheet.
 *
 * `moving` is where the dragged bounds would land. The *delta* is shrunk rather
 * than each element's position, for the same reason `snapDragToGrid` works on
 * the group's outer box: a group keeps its internal spacing exactly, instead of
 * collapsing as members hit the edge at different moments.
 *
 * Nodes were already held in by `moveNodesBy`; ink, paths, tables and arrows
 * were not, so a nudged drawing could be walked straight off the canvas and out
 * of reach. Clamping the shared delta covers every kind at once.
 */
export function clampDragToCanvas(moving: DiagramRect, delta: DiagramPoint): DiagramPoint {
  const axis = (start: number, extent: number, limit: number, value: number): number => {
    // Far edge first, then near: a group bigger than the sheet has no offset
    // that fits, so it pins to the near edge rather than jittering between two
    // constraints it cannot satisfy at once.
    const withinFar = Math.min(start, limit - extent);
    const withinNear = Math.max(withinFar, 0);
    return value + (withinNear - start);
  };

  return {
    x: axis(moving.x, moving.width, DIAGRAM_CANVAS_WIDTH, delta.x),
    y: axis(moving.y, moving.height, DIAGRAM_CANVAS_HEIGHT, delta.y),
  };
}

/**
 * Adjust a resize pull so the edge being pulled lands on the grid.
 *
 * The same rule a shape's own resize keeps — its pulled edge on the grid —
 * for anything scaled from a frame: a multi-selection, a table from its
 * corner, a freehand stroke or a pen path. Only the pulled edge is snapped;
 * the held one stays where it was, so a group that started off the grid is
 * not jolted across by the first pixel of a pull.
 *
 * A `uniform` scale moves both axes together, so only one edge can be put on
 * the grid: the one along the longer reach, which is the one the eye follows.
 * The pull is returned re-aimed along the handle so that it asks for exactly
 * that scale.
 */
export function snapResizePull(
  frame: DiagramRect,
  handle: ResizeHandle,
  pull: DiagramPoint,
  { uniform = false, fromCentre = false }: { uniform?: boolean; fromCentre?: boolean } = {},
): DiagramPoint {
  const { hx, hy } = handleAxes(handle);
  const held = heldPoint(frame, handle, fromCentre);
  const grip = handlePoint(frame, handle);
  // From the centre both sides move, so the pulled edge travels half as far as
  // the size changes — which is exactly the pointer's own travel.
  const snapAxis = (h: number, heldAt: number, gripAt: number, travel: number): number => {
    if (h === 0) return travel;
    const edge = gripAt + travel;
    const snapped = snapToGrid(edge);
    // Never snap through the held edge: a tiny frame would flip inside out.
    if ((snapped - heldAt) * h <= 0) return travel;
    return travel + (snapped - edge);
  };

  if (!uniform) {
    return {
      x: snapAxis(hx, held.x, grip.x, pull.x),
      y: snapAxis(hy, held.y, grip.y, pull.y),
    };
  }

  const reach = { x: grip.x - held.x, y: grip.y - held.y };
  const scale = uniformScaleFromPull(frame, handle, pull, fromCentre);
  // The axis that decides: whichever the handle reaches further along.
  const alongX = Math.abs(reach.x) >= Math.abs(reach.y);
  const reachOnAxis = alongX ? reach.x : reach.y;
  if (Math.abs(reachOnAxis) < 1e-6) return pull;
  const heldOnAxis = alongX ? held.x : held.y;
  const edge = heldOnAxis + reachOnAxis * scale;
  const snapped = snapToGrid(edge);
  const snappedScale = (snapped - heldOnAxis) / reachOnAxis;
  if (snappedScale <= 0) return pull;
  return { x: reach.x * (snappedScale - 1), y: reach.y * (snappedScale - 1) };
}
