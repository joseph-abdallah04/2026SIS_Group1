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

import { snapToGrid, type DiagramPoint, type DiagramRect } from '../diagram/diagramModel';

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
