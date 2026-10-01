// What a marquee catches, across every kind of element on the canvas.
//
// The diagram only ever had nodes to select, so `nodeIdsInRect` was enough.
// A studio canvas also holds ink, paths and tables, and a user sweeping a
// selection expects to catch all of them — so each kind needs a bounding box
// and the sweep needs to ask about all four.

import {
  arrowBounds,
  arrowGeometry,
  pathCurveLocalBounds,
  pathPaintedBounds,
  rotatedBounds,
  tableSize,
  type ArrowElement,
  type PathElement,
  type TableElement,
} from '@roundtable/shared';

import { nodeIdsInRect, type DiagramRect } from '../diagram/diagramModel';
import { arrowTargetLookup } from './studioArrowTargets';
import type { StudioInkStroke } from './studioInk';
import type { DiagramNode } from '@roundtable/shared';

/** Every element kind that can be swept up, moved and deleted as a group. */
export interface StudioSelection {
  nodeIds: string[];
  inkIds: string[];
  pathIds: string[];
  tableIds: string[];
  arrowIds: string[];
}

export const EMPTY_STUDIO_SELECTION: StudioSelection = {
  nodeIds: [],
  inkIds: [],
  pathIds: [],
  tableIds: [],
  arrowIds: [],
};

export function isSelectionEmpty(selection: StudioSelection): boolean {
  return (
    selection.nodeIds.length === 0 &&
    selection.inkIds.length === 0 &&
    selection.pathIds.length === 0 &&
    selection.tableIds.length === 0 &&
    selection.arrowIds.length === 0
  );
}

export function selectionSize(selection: StudioSelection): number {
  return (
    selection.nodeIds.length +
    selection.inkIds.length +
    selection.pathIds.length +
    selection.tableIds.length +
    selection.arrowIds.length
  );
}

function boundsOfPoints(points: readonly { x: number; y: number }[]): DiagramRect | null {
  const first = points[0];
  if (!first) return null;
  let minX = first.x;
  let minY = first.y;
  let maxX = first.x;
  let maxY = first.y;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * The area a path paints on the canvas, bulges included, once it is turned.
 *
 * A curve can swing well outside its anchors, and a box around the anchors
 * alone left the frame cutting through it, let the bulge be dragged off the
 * sheet, and meant sweeping across the part you could see caught nothing. The
 * turn is still about the anchors' centre — that is where the path pivots — so
 * the curve's box is turned about that point rather than its own middle.
 */
export function pathBounds(
  path: Pick<PathElement, 'anchors' | 'closed' | 'rotation'>,
): DiagramRect | null {
  return pathPaintedBounds(path);
}

export function inkBounds(
  stroke: Pick<StudioInkStroke, 'points' | 'rotation'>,
): DiagramRect | null {
  const local = boundsOfPoints(stroke.points);
  return local && rotatedBounds(local, stroke.rotation);
}

/**
 * The same extents before rotation is applied.
 *
 * Drawing a turned stroke needs the centre it turns about, and that centre is
 * defined by the box the points actually describe — not by the larger box they
 * sweep out once turned. Taking the centre of the rotated bounds instead would
 * make each further turn pivot somewhere slightly different.
 */
export function pathLocalBounds(path: Pick<PathElement, 'anchors'>): DiagramRect | null {
  return boundsOfPoints(path.anchors);
}

/**
 * What a path paints, before rotation — the box its selection frame is drawn
 * around. Not the pivot: that stays `pathLocalBounds`, for the reason above.
 */
export function pathFrameBounds(path: Pick<PathElement, 'anchors' | 'closed'>): DiagramRect | null {
  return pathCurveLocalBounds(path);
}

export function inkLocalBounds(stroke: Pick<StudioInkStroke, 'points'>): DiagramRect | null {
  return boundsOfPoints(stroke.points);
}

export function tableBounds(table: TableElement): DiagramRect {
  const size = tableSize(table);
  return { x: table.x, y: table.y, width: size.width, height: size.height };
}

/** Touching counts, matching how the diagram's marquee already treats nodes. */
export function rectsIntersect(a: DiagramRect, b: DiagramRect): boolean {
  return (
    a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height
  );
}

interface SelectableScene {
  nodes: readonly DiagramNode[];
  ink?: readonly StudioInkStroke[];
  paths?: readonly PathElement[];
  tables?: readonly TableElement[];
  arrows?: readonly ArrowElement[];
}

/**
 * An arrow's extent is its drawn route, not its stored endpoints: a bound end
 * is wherever the element it names happens to be, so the box has to be measured
 * after the bindings are resolved or a sweep would miss the arrow it can see.
 */
export function arrowBoundsIn(scene: SelectableScene): (arrow: ArrowElement) => DiagramRect | null {
  const lookup = arrowTargetLookup({
    nodes: scene.nodes,
    ink: scene.ink,
    paths: scene.paths,
    tables: scene.tables,
  });
  return (arrow) => arrowBounds(arrowGeometry(arrow, lookup).points);
}

export function studioElementsInRect(scene: SelectableScene, rect: DiagramRect): StudioSelection {
  return {
    nodeIds: nodeIdsInRect(scene.nodes, rect),
    inkIds: (scene.ink ?? [])
      .filter((stroke) => {
        const bounds = inkBounds(stroke);
        return bounds !== null && rectsIntersect(bounds, rect);
      })
      .map((stroke) => stroke.id),
    pathIds: (scene.paths ?? [])
      .filter((path) => {
        const bounds = pathBounds(path);
        return bounds !== null && rectsIntersect(bounds, rect);
      })
      .map((path) => path.id),
    tableIds: (scene.tables ?? [])
      .filter((table) => rectsIntersect(tableBounds(table), rect))
      .map((table) => table.id),
    arrowIds: (() => {
      const boundsOf = arrowBoundsIn(scene);
      return (scene.arrows ?? [])
        .filter((arrow) => {
          const bounds = boundsOf(arrow);
          return bounds !== null && rectsIntersect(bounds, rect);
        })
        .map((arrow) => arrow.id);
    })(),
  };
}

/** Union of two selections, for shift-sweeping onto an existing one. */
export function mergeSelections(a: StudioSelection, b: StudioSelection): StudioSelection {
  const union = (left: string[], right: string[]) => [...new Set([...left, ...right])];
  return {
    nodeIds: union(a.nodeIds, b.nodeIds),
    inkIds: union(a.inkIds, b.inkIds),
    pathIds: union(a.pathIds, b.pathIds),
    tableIds: union(a.tableIds, b.tableIds),
    arrowIds: union(a.arrowIds, b.arrowIds),
  };
}
