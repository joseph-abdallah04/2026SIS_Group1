// Scaling everything that is selected at once, from one frame around all of it.
//
// A group is scaled the way a single element is — pull a corner or an edge of
// its frame — but it holds every kind at once, and each kind has its own rule
// for what "bigger" means: a shape stores a size, a text box only a width, a
// table a set of tracks, a drawing nothing but points. So the group decides
// where everything goes (each element's centre moves away from the held point
// by the scale), and each element decides how it grows about its own centre.
//
// Fonts and stroke weights never scale. They are presets, not lengths, and a
// group made bigger should hold the same writing in more room, not shout.
//
// Pure, so every combination is testable without a canvas.

import {
  arrowGeometry,
  DIAGRAM_CANVAS_HEIGHT,
  DIAGRAM_CANVAS_WIDTH,
  DIAGRAM_MAX_NODE_HEIGHT,
  DIAGRAM_MAX_NODE_WIDTH,
  DIAGRAM_MIN_NODE_HEIGHT,
  DIAGRAM_MIN_NODE_WIDTH,
  diagramCanParent,
  diagramDescendantIds,
  diagramTextBoxHeight,
  effectiveDiagramNodeSize,
  pathLocalBounds,
  pointsBounds,
  tableSize,
  type ArrowElement,
  type ArrowEndpoint,
  type DiagramEdge,
  type DiagramNode,
  type PathElement,
  type TableElement,
} from '@roundtable/shared';

import {
  clampNodesInsideContainer,
  nodeBounds,
  type DiagramPoint,
  type DiagramRect,
} from '../diagram/diagramModel';
import { arrowTargetLookup } from './studioArrowTargets';
import type { StudioInkStroke } from './studioInk';
import {
  MIN_SCALED_EXTENT,
  handleAxes,
  heldPoint,
  uniformScaleFromPull,
  type ResizeHandle,
} from './studioScale';
import {
  arrowBoundsIn,
  inkBounds,
  pathBounds,
  tableBounds,
  type StudioSelection,
} from './studioSelection';
import { scaleTable, tableScaleLimits } from './studioTables';

export interface GroupScene {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  ink?: StudioInkStroke[];
  paths?: PathElement[];
  tables?: TableElement[];
  arrows?: ArrowElement[];
}

export interface GroupScaleOptions {
  /** Shift: the same scale on both axes. */
  lockAspect?: boolean;
  /** Alt: the frame's centre stays put rather than the opposite side. */
  fromCentre?: boolean;
}

/**
 * The box around everything selected, as it is drawn: turned elements by the
 * corners they show, curves by their bulges, arrows by their routes.
 */
export function groupFrame(scene: GroupScene, selection: StudioSelection): DiagramRect | null {
  const boxes: DiagramRect[] = [];
  for (const node of scene.nodes) {
    if (selection.nodeIds.includes(node.id)) boxes.push(nodeBounds(node));
  }
  for (const stroke of scene.ink ?? []) {
    if (!selection.inkIds.includes(stroke.id)) continue;
    const box = inkBounds(stroke);
    if (box) boxes.push(box);
  }
  for (const path of scene.paths ?? []) {
    if (!selection.pathIds.includes(path.id)) continue;
    const box = pathBounds(path);
    if (box) boxes.push(box);
  }
  for (const table of scene.tables ?? []) {
    if (selection.tableIds.includes(table.id)) boxes.push(tableBounds(table));
  }
  if (selection.arrowIds.length > 0) {
    const boundsOf = arrowBoundsIn(scene);
    for (const arrow of scene.arrows ?? []) {
      if (!selection.arrowIds.includes(arrow.id)) continue;
      const box = boundsOf(arrow);
      if (box) boxes.push(box);
    }
  }
  if (boxes.length === 0) return null;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Whether the group can only be scaled the same on both axes.
 *
 * A drawing stretched along one axis is no longer the drawing that was made,
 * and a turned element stretched along the *group's* axes would have to skew —
 * which no element here can store. Either one in the group makes the whole
 * group scale uniformly, the way a single drawing always does.
 */
export function groupMustScaleUniformly(scene: GroupScene, selection: StudioSelection): boolean {
  if (selection.inkIds.length > 0 || selection.pathIds.length > 0) return true;
  return scene.nodes.some((node) => selection.nodeIds.includes(node.id) && Boolean(node.rotation));
}

/** The nodes that move: the selected ones, and everything inside a selected container. */
function scaledNodeIds(nodes: readonly DiagramNode[], selection: StudioSelection): Set<string> {
  const ids = new Set(selection.nodeIds);
  for (const id of selection.nodeIds) {
    const node = nodes.find((candidate) => candidate.id === id);
    if (node && diagramCanParent(node.shape)) {
      for (const child of diagramDescendantIds(nodes, id)) ids.add(child);
    }
  }
  return ids;
}

interface Limits {
  lowX: number;
  highX: number;
  lowY: number;
  highY: number;
}

/**
 * How far the group can shrink before its smallest member hits its minimum,
 * and how far it can grow before its largest hits a maximum or the frame
 * reaches the edge of the sheet.
 */
function scaleLimits(
  scene: GroupScene,
  selection: StudioSelection,
  nodeIds: ReadonlySet<string>,
  frame: DiagramRect,
  held: DiagramPoint,
): Limits {
  const limits: Limits = { lowX: 0, highX: Infinity, lowY: 0, highY: Infinity };
  const floorX = (value: number) => (limits.lowX = Math.max(limits.lowX, value));
  const floorY = (value: number) => (limits.lowY = Math.max(limits.lowY, value));
  const capX = (value: number) => (limits.highX = Math.min(limits.highX, value));
  const capY = (value: number) => (limits.highY = Math.min(limits.highY, value));

  for (const node of scene.nodes) {
    if (!nodeIds.has(node.id)) continue;
    const size = effectiveDiagramNodeSize(node);
    floorX(DIAGRAM_MIN_NODE_WIDTH / size.width);
    capX(DIAGRAM_MAX_NODE_WIDTH / size.width);
    // A text box's height follows its text, so only its width is limited.
    if (node.shape !== 'text') {
      floorY(DIAGRAM_MIN_NODE_HEIGHT / size.height);
      capY(DIAGRAM_MAX_NODE_HEIGHT / size.height);
    }
  }
  for (const table of scene.tables ?? []) {
    if (!selection.tableIds.includes(table.id)) continue;
    const tracks = tableScaleLimits(table);
    floorX(tracks.minX);
    capX(tracks.maxX);
    floorY(tracks.minY);
    capY(tracks.maxY);
  }
  const drawingFloor = (box: DiagramRect | null) => {
    const longest = box ? Math.max(box.width, box.height) : 0;
    if (longest <= 0) return;
    const floor = Math.min(1, MIN_SCALED_EXTENT / longest);
    floorX(floor);
    floorY(floor);
  };
  for (const stroke of scene.ink ?? []) {
    if (selection.inkIds.includes(stroke.id)) drawingFloor(pointsBounds(stroke.points));
  }
  for (const path of scene.paths ?? []) {
    if (selection.pathIds.includes(path.id)) drawingFloor(pathLocalBounds(path));
  }

  // The sheet: each side of the frame moves away from the held point by the
  // scale, and stops at the edge. A frame already hanging off the sheet can
  // always shrink; it just cannot grow further out.
  const sheet = (lo: number, extent: number, fixed: number, limit: number) => {
    let high = Infinity;
    if (lo < fixed - 1e-6) high = Math.min(high, fixed / (fixed - lo));
    if (lo + extent > fixed + 1e-6) high = Math.min(high, (limit - fixed) / (lo + extent - fixed));
    return Math.max(1, high);
  };
  capX(sheet(frame.x, frame.width, held.x, DIAGRAM_CANVAS_WIDTH));
  capY(sheet(frame.y, frame.height, held.y, DIAGRAM_CANVAS_HEIGHT));
  return limits;
}

function clampScale(value: number, low: number, high: number): number {
  // Where a member's minimum and the sheet disagree, the sheet wins: an element
  // squeezed to its own minimum still fits, one pushed off the sheet does not.
  return Math.min(high, Math.max(low, value));
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * The scale a pull on `handle` asks the group for, before and after limits.
 * Exported so the editor can show the frame the group is being scaled to.
 */
export function groupScaleFactors(
  scene: GroupScene,
  selection: StudioSelection,
  handle: ResizeHandle,
  frame: DiagramRect,
  delta: DiagramPoint,
  { lockAspect = false, fromCentre = false }: GroupScaleOptions = {},
): { scaleX: number; scaleY: number; held: DiagramPoint } {
  const { hx, hy } = handleAxes(handle);
  const held = heldPoint(frame, handle, fromCentre);
  const nodeIds = scaledNodeIds(scene.nodes, selection);
  const limits = scaleLimits(scene, selection, nodeIds, frame, held);
  const uniform = lockAspect || groupMustScaleUniformly(scene, selection);

  if (uniform) {
    const scale = clampScale(
      uniformScaleFromPull(frame, handle, delta, fromCentre),
      Math.max(limits.lowX, limits.lowY),
      Math.min(limits.highX, limits.highY),
    );
    return { scaleX: scale, scaleY: scale, held };
  }

  const reach = fromCentre ? 2 : 1;
  const along = (h: number, extent: number, pull: number) =>
    h === 0 || extent < 1 ? 1 : (extent + h * pull * reach) / extent;
  return {
    scaleX: hx === 0 ? 1 : clampScale(along(hx, frame.width, delta.x), limits.lowX, limits.highX),
    scaleY: hy === 0 ? 1 : clampScale(along(hy, frame.height, delta.y), limits.lowY, limits.highY),
    held,
  };
}

/**
 * Everything selected, scaled from `handle` of the group's frame.
 *
 * `scene` is the scene as it was at the press and `delta` how far the pointer
 * has travelled since, so a whole gesture is one scale from one start.
 */
export function scaleGroup(
  scene: GroupScene,
  selection: StudioSelection,
  handle: ResizeHandle,
  frame: DiagramRect,
  delta: DiagramPoint,
  options: GroupScaleOptions = {},
): GroupScene {
  const {
    scaleX: sx,
    scaleY: sy,
    held,
  } = groupScaleFactors(scene, selection, handle, frame, delta, options);
  const map = (point: DiagramPoint): DiagramPoint => ({
    x: held.x + (point.x - held.x) * sx,
    y: held.y + (point.y - held.y) * sy,
  });
  const nodeIds = scaledNodeIds(scene.nodes, selection);

  // Each element grows about its own centre, and that centre is what the group
  // scale moves — so a turned element keeps its turn, and a text box keeps
  // its text the size it was.
  let nodes = scene.nodes.map((node) => {
    if (!nodeIds.has(node.id)) return node;
    const size = effectiveDiagramNodeSize(node);
    const centre = map({ x: node.x + size.width / 2, y: node.y + size.height / 2 });
    const width = Math.round(
      Math.min(DIAGRAM_MAX_NODE_WIDTH, Math.max(DIAGRAM_MIN_NODE_WIDTH, size.width * sx)),
    );
    const height =
      node.shape === 'text'
        ? diagramTextBoxHeight({ ...node, width })
        : Math.round(
            Math.min(DIAGRAM_MAX_NODE_HEIGHT, Math.max(DIAGRAM_MIN_NODE_HEIGHT, size.height * sy)),
          );
    return {
      ...node,
      x: Math.round(centre.x - width / 2),
      y: Math.round(centre.y - height / 2),
      width,
      height,
    };
  });
  // Rounding can nudge a child a unit past its container's border.
  for (const id of nodeIds) {
    const node = nodes.find((candidate) => candidate.id === id);
    if (node && diagramCanParent(node.shape)) nodes = clampNodesInsideContainer(nodes, id);
  }

  const tables = scene.tables?.map((table) => {
    if (!selection.tableIds.includes(table.id)) return table;
    const before = tableSize(table);
    const scaled = scaleTable(table, sx, sy);
    const after = tableSize(scaled);
    const centre = map({ x: table.x + before.width / 2, y: table.y + before.height / 2 });
    return {
      ...scaled,
      x: Math.round(centre.x - after.width / 2),
      y: Math.round(centre.y - after.height / 2),
    };
  });

  // Drawings only ever reach here with sx === sy (see groupMustScaleUniformly).
  // Each is scaled about the point it turns on, which then moves with the group;
  // scaling about any other point would move its pivot and swing a turned one.
  const ink = scene.ink?.map((stroke) => {
    if (!selection.inkIds.includes(stroke.id)) return stroke;
    const box = pointsBounds(stroke.points);
    if (!box) return stroke;
    const pivot = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const moved = map(pivot);
    return {
      ...stroke,
      points: stroke.points.map((point) => ({
        x: roundTenth(moved.x + (point.x - pivot.x) * sx),
        y: roundTenth(moved.y + (point.y - pivot.y) * sy),
      })),
    };
  });

  const paths = scene.paths?.map((path) => {
    if (!selection.pathIds.includes(path.id)) return path;
    const box = pathLocalBounds(path);
    if (!box) return path;
    const pivot = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const moved = map(pivot);
    const offset = (handleOffset: { x: number; y: number } | undefined) =>
      handleOffset && { x: roundTenth(handleOffset.x * sx), y: roundTenth(handleOffset.y * sy) };
    return {
      ...path,
      anchors: path.anchors.map((anchor) => {
        const next = {
          ...anchor,
          x: roundTenth(moved.x + (anchor.x - pivot.x) * sx),
          y: roundTenth(moved.y + (anchor.y - pivot.y) * sy),
        };
        if (anchor.in) next.in = offset(anchor.in);
        if (anchor.out) next.out = offset(anchor.out);
        return next;
      }),
    };
  });

  // A bound end follows its element wherever the element went. A free end of a
  // selected arrow is a point in the group, so it moves with the group. The
  // stored point of a bound end is only a fallback, and is carried along too so
  // it stays near the element it names.
  const lookup = arrowTargetLookup(scene);
  const arrows = scene.arrows?.map((arrow) => {
    if (!selection.arrowIds.includes(arrow.id)) return arrow;
    const end = (point: ArrowEndpoint): ArrowEndpoint => {
      const moved = map(point);
      return { ...point, x: roundTenth(moved.x), y: roundTenth(moved.y) };
    };
    const next: ArrowElement = { ...arrow, from: end(arrow.from), to: end(arrow.to) };
    if (arrow.bend) {
      // `bend` slides the elbow's middle leg along one axis, so it scales with
      // that axis. The route says which; the stored ends of a bound arrow are
      // only fallbacks, and guessing from them picked the wrong one.
      const axis = arrowGeometry(arrow, lookup).elbow?.axis;
      const alongX = axis
        ? axis === 'x'
        : Math.abs(arrow.to.x - arrow.from.x) >= Math.abs(arrow.to.y - arrow.from.y);
      next.bend = Math.round(arrow.bend * (alongX ? sx : sy));
    }
    return next;
  });

  return {
    ...scene,
    nodes,
    ...(tables ? { tables } : {}),
    ...(ink ? { ink } : {}),
    ...(paths ? { paths } : {}),
    ...(arrows ? { arrows } : {}),
  };
}
