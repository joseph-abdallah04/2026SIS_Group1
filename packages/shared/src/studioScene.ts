// A studio canvas as a whole: what its arrows may bind to, how its tables rule
// their grids, and the box everything on it occupies.
//
// Pure geometry, shared by every surface that draws a canvas — the editor, the
// board card, a card's export and the recap PDF — so an arrow lands on the
// same point and a canvas is framed the same way wherever it is drawn.

import {
  effectiveDiagramNodeSize,
  type DiagramArtifact,
  type DiagramNode,
} from './diagramContract.js';
import type { StrokePoint } from './drawingContract.js';
import { arrowGeometry, type ArrowTarget, type ArrowTargetLookup } from './studioArrows.js';
import {
  inkPoints,
  pathPaintedBounds,
  tableColumnOffsets,
  tableRowOffsets,
  tableSize,
  type PathElement,
  type TableElement,
  type TableMerge,
} from './studioElements.js';

/** What a canvas holds, whatever carries it: a proposal's artifact or a template. */
export type StudioScene = Omit<DiagramArtifact, 'type'>;

/**
 * Everything on a canvas an arrow may point at.
 *
 * Ink arrives unpacked, because that is the form the editor works in; the board
 * card unpacks its stored strokes on the way in. Arrows are deliberately absent:
 * binding one arrow to another would make each one's route depend on the other's.
 */
export interface ArrowTargetScene {
  nodes?: readonly DiagramNode[];
  ink?: readonly { id: string; points: readonly StrokePoint[]; rotation?: number }[];
  paths?: readonly PathElement[];
  tables?: readonly TableElement[];
}

/**
 * A stroke drawn as a dot, or a perfectly straight line, has no extent on one
 * axis — and a box with a zero half-extent has no boundary to land on, so the
 * arrow would collapse to its centre. Two units is enough to give it one.
 */
const MIN_TARGET_EXTENT = 2;

function boundsOf(points: readonly { x: number; y: number }[]): ArrowTarget['box'] | null {
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
  return pad({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
}

function pad(box: ArrowTarget['box']): ArrowTarget['box'] {
  const width = Math.max(box.width, MIN_TARGET_EXTENT);
  const height = Math.max(box.height, MIN_TARGET_EXTENT);
  return {
    x: box.x - (width - box.width) / 2,
    y: box.y - (height - box.height) / 2,
    width,
    height,
  };
}

/** Every bindable element on the canvas, by id. */
export function arrowTargets(scene: ArrowTargetScene): Map<string, ArrowTarget> {
  const targets = new Map<string, ArrowTarget>();

  for (const node of scene.nodes ?? []) {
    const size = effectiveDiagramNodeSize(node);
    // A node carries its shape through, so an arrow meets an ellipse on its
    // curve and a diamond on its slope rather than on the box around it.
    targets.set(node.id, {
      id: node.id,
      box: pad({ x: node.x, y: node.y, width: size.width, height: size.height }),
      shape: node.shape,
      ...(node.rotation ? { rotation: node.rotation } : {}),
    });
  }
  for (const table of scene.tables ?? []) {
    const size = tableSize(table);
    targets.set(table.id, {
      id: table.id,
      box: pad({ x: table.x, y: table.y, width: size.width, height: size.height }),
    });
  }
  // Ink and paths are freeform: the box around a stroke is mostly empty, so an
  // arrow lands where it was aimed rather than at that box's edge. Pointing at
  // a drawing should touch the drawing.
  for (const stroke of scene.ink ?? []) {
    const box = boundsOf(stroke.points);
    if (box) {
      targets.set(stroke.id, {
        id: stroke.id,
        box,
        freeform: true,
        ...(stroke.rotation ? { rotation: stroke.rotation } : {}),
      });
    }
  }
  for (const path of scene.paths ?? []) {
    // The anchors, not the curve: a bezier can bow a little outside the box its
    // anchors describe, and the same approximation is what a marquee sweep uses.
    const box = boundsOf(path.anchors);
    if (box) {
      targets.set(path.id, {
        id: path.id,
        box,
        freeform: true,
        ...(path.rotation ? { rotation: path.rotation } : {}),
      });
    }
  }

  return targets;
}

export function arrowTargetLookup(scene: ArrowTargetScene): ArrowTargetLookup {
  const targets = arrowTargets(scene);
  return (elementId) => targets.get(elementId);
}

function mergeSpan(merge: TableMerge, axis: 'row' | 'col'): { start: number; end: number } {
  return axis === 'row'
    ? { start: merge.row, end: merge.row + merge.rowSpan - 1 }
    : { start: merge.col, end: merge.col + merge.colSpan - 1 };
}

/**
 * The inside lines of the grid as one path, in the table's own units.
 *
 * Drawn once rather than as a border round every cell: two cells stroking the
 * edge they share drew it twice, which read heavier than the outline and put a
 * darker dot on every corner where four cells met.
 */
export function tableGridPath(
  table: Pick<TableElement, 'colWidths' | 'rowHeights' | 'merges'>,
): string {
  const colOffsets = tableColumnOffsets(table);
  const rowOffsets = tableRowOffsets(table);
  const merges = table.merges ?? [];
  const parts: string[] = [];
  // Each inside line is drawn in the runs between the merged cells it would
  // otherwise cut through; with nothing merged, each is one run end to end.
  const across = (at: number, along: number, axis: 'row' | 'col') =>
    merges.some((merge) => {
      const line = mergeSpan(merge, axis === 'col' ? 'col' : 'row');
      const other = mergeSpan(merge, axis === 'col' ? 'row' : 'col');
      return line.start < at && at <= line.end && along >= other.start && along <= other.end;
    });
  const runs = (count: number, hidden: (index: number) => boolean) => {
    const found: [number, number][] = [];
    let from: number | null = null;
    for (let index = 0; index <= count; index += 1) {
      if (index < count && !hidden(index)) from ??= index;
      else if (from !== null) {
        found.push([from, index]);
        from = null;
      }
    }
    return found;
  };
  colOffsets.slice(1, -1).forEach((x, index) => {
    for (const [from, to] of runs(rowOffsets.length - 1, (row) => across(index + 1, row, 'col'))) {
      parts.push(`M${x} ${rowOffsets[from]}V${rowOffsets[to]}`);
    }
  });
  rowOffsets.slice(1, -1).forEach((y, index) => {
    for (const [from, to] of runs(colOffsets.length - 1, (col) => across(index + 1, col, 'row'))) {
      parts.push(`M${colOffsets[from]} ${y}H${colOffsets[to]}`);
    }
  });
  return parts.join('');
}

/**
 * Whether a canvas holds nothing at all. A sketch, a line, a table or an arrow
 * is as much a diagram as a shape is.
 */
export function isEmptyStudioScene(scene: StudioScene): boolean {
  return (
    scene.nodes.length === 0 &&
    (scene.ink?.length ?? 0) === 0 &&
    (scene.paths?.length ?? 0) === 0 &&
    (scene.tables?.length ?? 0) === 0 &&
    (scene.arrows?.length ?? 0) === 0
  );
}

/**
 * The box everything on a canvas occupies: the edges of every shape, sketch,
 * path and table, and every arrow's whole route, which can reach past what it
 * points at.
 */
export function studioSceneBounds(scene: StudioScene): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const { nodes } = scene;
  const paths = scene.paths ?? [];
  const tables = scene.tables ?? [];
  const arrows = scene.arrows ?? [];
  const points = (scene.ink ?? []).flatMap((stroke) => inkPoints(stroke));
  // What each path paints, not where its anchors sit: a curve can bulge past
  // its last anchor, and the card used to crop that bulge off.
  const boxes = [
    ...nodes.map((node) => ({ x: node.x, y: node.y, ...effectiveDiagramNodeSize(node) })),
    ...points.map((point) => ({ ...point, width: 0, height: 0 })),
    ...paths
      .map((path) => pathPaintedBounds(path))
      .filter((box): box is NonNullable<typeof box> => box !== null),
    ...tables.map((table) => ({ x: table.x, y: table.y, ...tableSize(table) })),
  ];
  const targets = arrowTargetLookup({
    nodes,
    ink: (scene.ink ?? []).map((stroke) => ({ ...stroke, points: inkPoints(stroke) })),
    paths,
    tables,
  });
  for (const arrow of arrows) {
    for (const point of arrowGeometry(arrow, targets).points) {
      boxes.push({ ...point, width: 0, height: 0 });
    }
  }
  if (boxes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * How much room a studio canvas takes on a card: the far edge of everything on
 * it, plus the margin the card leaves around it. Measured from the sheet's
 * corner, so a canvas keeps where on the sheet its content sat.
 */
export function diagramExtent(scene: StudioScene): { width: number; height: number } {
  const bounds = studioSceneBounds(scene);
  return {
    width: Math.max(bounds.x + bounds.width, 72) + 28,
    height: Math.max(bounds.y + bounds.height, 32) + 24,
  };
}
