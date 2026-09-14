// Standalone arrows — diagram artifact v4.2.
//
// An `edge` is a semantic connection: it joins two nodes, takes part in
// routing, auto-arrange and reciprocal bowing, and cannot exist without both
// its nodes. An arrow is a drawn object. It may end in empty space, it may
// point at ink or a table, it carries its own end caps, and auto-arrange never
// sees it. That is the same decoration-versus-structure line `paths` already
// sit on, and it is why arrows are their own collection rather than edges with
// looser endpoints.
//
// What an arrow does borrow from edges is the *binding*: an endpoint may name
// another element, and then the arrow re-routes whenever that element moves,
// resizes or changes shape. Only the binding is stored — the endpoint also
// keeps the last point it occupied, so deleting the element it pointed at
// leaves the arrow where it was drawn instead of collapsing it to the origin.
//
// Geometry lives here rather than in the editor because the board card renders
// arrows with no editor present, exactly as it does for nodes, ink and paths.

import {
  DIAGRAM_FONT_SIZES,
  DIAGRAM_LEGACY_FONT_SIZE,
  DIAGRAM_STROKE_COLORS,
  diagramBoundaryScale,
  type DiagramFontSizePreset,
  type DiagramNodeShape,
  type DiagramStrokeKey,
  type DiagramStrokeStyle,
  type DiagramStrokeWidthPreset,
} from './diagramContract.js';
import { DIAGRAM_PATH_STROKE_WIDTHS } from './studioElements.js';

/**
 * What an arrow ends in.
 *
 * `line` is the open V every diagram tool defaults to; `solid` is the filled
 * concave head an `edge` already draws. The hollow variants are not decoration:
 * hollow triangle, hollow diamond and solid diamond are UML inheritance,
 * aggregation and composition, and a reader who knows that notation reads the
 * wrong relationship off the filled one. `bar` is the plain terminator.
 */
export const ARROW_CAPS = [
  'none',
  'line',
  'solid',
  'triangle',
  'triangleHollow',
  'circle',
  'circleHollow',
  'diamond',
  'diamondHollow',
  'bar',
] as const;
export type ArrowCap = (typeof ARROW_CAPS)[number];

/** Straight, or right-angled legs with rounded corners. */
export const ARROW_ROUTES = ['straight', 'elbow'] as const;
export type ArrowRoute = (typeof ARROW_ROUTES)[number];

/**
 * Where a label sits relative to the line it belongs to.
 *
 * Three states rather than a free offset, because the palettes and presets in
 * this contract are all closed — and because a label already carries a halo in
 * the canvas colour, so sitting *on* the line is legible. Above and below are a
 * preference, not a fix for anything.
 *
 * On a leg that runs more vertically than horizontally, "above" means to the
 * left of it: the text stays horizontal either way, so the side has to be
 * described relative to the reader rather than to the line.
 */
export const ARROW_LABEL_SIDES = ['on', 'above', 'below'] as const;
export type ArrowLabelSide = (typeof ARROW_LABEL_SIDES)[number];

export interface ArrowPoint {
  x: number;
  y: number;
}

export interface ArrowBox extends ArrowPoint {
  width: number;
  height: number;
}

/**
 * One end of an arrow.
 *
 * `x`/`y` are always present. When `elementId` is set they are not where the
 * arrow is drawn — the bound element decides that — but where it goes back to
 * if that element is deleted, so an arrow never loses its position.
 */
/**
 * Where on a bound element the arrow attaches, as a fraction of that element's
 * box — `{u: 0, v: 0}` is its top-left, `{u: 1, v: 1}` its bottom-right.
 *
 * Stored as a fraction rather than a point so it survives the element changing
 * size: an arrow pinned to the middle of a table's left edge stays on the left
 * edge, halfway down, when a row is added.
 */
export interface ArrowAttach {
  u: number;
  v: number;
}

export interface ArrowEndpoint extends ArrowPoint {
  /** A live binding: the arrow re-routes when this element moves. */
  elementId?: string;
  /**
   * Where on that element to attach. Absent means aim at its centre, which is
   * what an `edge` does: the arrow meets whichever face the far end happens to
   * be on, and slides around as that end moves.
   */
  at?: ArrowAttach;
}

export interface ArrowElement {
  id: string;
  from: ArrowEndpoint;
  to: ArrowEndpoint;
  /** Absent means `straight`, so an arrow written before elbows still reads. */
  route?: ArrowRoute;
  /**
   * How far the elbow's middle leg is pushed off centre, in scene units.
   * Meaningless on a straight arrow, and rejected on one by the write path.
   */
  bend?: number;
  startCap?: ArrowCap;
  endCap?: ArrowCap;
  label?: string;
  /**
   * How far along the route the label sits, as a fraction of its length.
   *
   * A fraction rather than a point, so it holds its place when the arrow is
   * re-routed — and because the midpoint of an elbow often lands exactly on a
   * corner, which is the main reason this is adjustable at all.
   */
  labelT?: number;
  labelSide?: ArrowLabelSide;
  labelBold?: boolean;
  labelColor?: DiagramStrokeKey;
  fontSizePreset?: DiagramFontSizePreset;
  strokeColor?: DiagramStrokeKey;
  strokeWidthPreset?: DiagramStrokeWidthPreset;
  strokeStyle?: DiagramStrokeStyle;
}

// A plain line pointing somewhere: nothing at the tail, an open head at the
// tip. Anything more decorated is a choice the user makes, not a default.
export const ARROW_DEFAULT_START_CAP: ArrowCap = 'none';
export const ARROW_DEFAULT_END_CAP: ArrowCap = 'line';
export const ARROW_DEFAULT_STROKE_COLOR: DiagramStrokeKey = 'ink';
export const ARROW_DEFAULT_STROKE_WIDTH: DiagramStrokeWidthPreset = 'regular';
export const ARROW_DEFAULT_ROUTE: ArrowRoute = 'straight';

export const DIAGRAM_ARROW_LIMIT = 100;
export const ARROW_LABEL_LIMIT = 200;

/**
 * Bound because `bend` is a raw scene offset rather than a fraction: a crafted
 * payload could otherwise put the middle leg a mile off the sheet, where the
 * arrow is unselectable and the diagram's bounds are nonsense.
 */
export const ARROW_MAX_BEND = 2000;

/**
 * How far a label steps off the line, for a given text size.
 *
 * It has to grow with the text: a fixed gap that clears a 12px label leaves a
 * 30px one sitting on the line it was meant to step off. Half the text plus a
 * little keeps the same visual gap under the letters at every size.
 */
export function arrowLabelOffset(fontSize: number): number {
  return Math.round(fontSize * 0.6 + 5);
}

/** How much of a leg a rounded elbow corner may eat. */
export const ARROW_CORNER_RADIUS = 10;

/** How far out from an element a self-loop bulges, in scene units. */
export const ARROW_LOOP_EXTENT = 44;

/**
 * How far an elbow leaves an element before it is allowed to turn.
 *
 * Without a stub the first leg can run along the face it just left, so the
 * arrow appears to graze the element rather than to leave it. Everything
 * reads as "points at" only if it arrives square to the edge.
 */
export const ARROW_ELBOW_STUB = 22;

/**
 * An arrow uses the drawn-line widths rather than the edge ones.
 *
 * An edge is connective tissue and its three presets sit close together so a
 * heavy one does not shout. A standalone arrow is artwork the user placed on
 * purpose, and its weights have to be told apart at a glance — the same
 * argument that gave paths their own table.
 */
export const DIAGRAM_ARROW_STROKE_WIDTHS = DIAGRAM_PATH_STROKE_WIDTHS;

export type ArrowStyled = Pick<
  ArrowElement,
  'strokeColor' | 'strokeWidthPreset' | 'strokeStyle' | 'startCap' | 'endCap'
>;

export function arrowStrokeColor(arrow: Pick<ArrowElement, 'strokeColor'>): string {
  return DIAGRAM_STROKE_COLORS[arrow.strokeColor ?? ARROW_DEFAULT_STROKE_COLOR];
}

export function arrowStrokeWidth(arrow: Pick<ArrowElement, 'strokeWidthPreset'>): number {
  return DIAGRAM_ARROW_STROKE_WIDTHS[arrow.strokeWidthPreset ?? ARROW_DEFAULT_STROKE_WIDTH];
}

export function arrowStartCap(arrow: Pick<ArrowElement, 'startCap'>): ArrowCap {
  return arrow.startCap ?? ARROW_DEFAULT_START_CAP;
}

export function arrowEndCap(arrow: Pick<ArrowElement, 'endCap'>): ArrowCap {
  return arrow.endCap ?? ARROW_DEFAULT_END_CAP;
}

export function arrowRoute(arrow: Pick<ArrowElement, 'route'>): ArrowRoute {
  return arrow.route ?? ARROW_DEFAULT_ROUTE;
}

export function arrowFontSize(arrow: Pick<ArrowElement, 'fontSizePreset'>): number {
  return arrow.fontSizePreset ? DIAGRAM_FONT_SIZES[arrow.fontSizePreset] : DIAGRAM_LEGACY_FONT_SIZE;
}

export function arrowLabelSide(arrow: Pick<ArrowElement, 'labelSide'>): ArrowLabelSide {
  return arrow.labelSide ?? 'on';
}

/** Halfway unless the arrow says otherwise, and never off the end. */
export function arrowLabelT(arrow: Pick<ArrowElement, 'labelT'>): number {
  const t = arrow.labelT ?? 0.5;
  return Math.min(1, Math.max(0, t));
}

/**
 * An element an arrow can bind to.
 *
 * `shape` is a node's outline, so an arrow lands on an ellipse's curve rather
 * than its bounding box. Everything else — a table, a stroke of ink, a path —
 * has no outline to speak of and clips to its box, which is what
 * `diagramBoundaryScale` already does when no shape is given.
 */
export interface ArrowTarget {
  id: string;
  box: ArrowBox;
  shape?: DiagramNodeShape;
  /**
   * Whether the element is a solid object with an outline to stop at.
   *
   * A shape or a table is: an arrow meets its edge. Freehand ink and a pen path
   * are not — the box around a stroke is mostly empty, and an arrow that stopped
   * at that box would point at nothing. A freeform target is landed *on*
   * instead, wherever the arrow was aimed.
   */
  freeform?: boolean;
}

export type ArrowTargetLookup = (elementId: string) => ArrowTarget | undefined;

export interface ArrowCapGeometry {
  cap: ArrowCap;
  /** Path data, already rotated and positioned. Empty for `none`. */
  d: string;
  /** Filled caps take the stroke colour; hollow ones take the canvas surface. */
  filled: boolean;
  /**
   * Whether the path encloses an area. An open cap — the V, the bar — is only
   * ever stroked; a closed one is filled, with the canvas colour when hollow so
   * the line behind it cannot show through.
   */
  closed: boolean;
  /** Where the line must stop so it cannot show through a hollow cap. */
  inset: number;
  point: ArrowPoint;
  /** Direction of travel at this end, in radians. */
  angle: number;
}

export interface ArrowGeometry {
  /** The route's corners, after clipping to any bound elements. */
  points: ArrowPoint[];
  /** Path data for the line, trimmed for the caps and with rounded corners. */
  d: string;
  start: ArrowCapGeometry;
  end: ArrowCapGeometry;
  /** Where the label sits: along the route, and off to whichever side it asked for. */
  label: ArrowPoint;
}

function centreOf(box: ArrowBox): ArrowPoint {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function distance(a: ArrowPoint, b: ArrowPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Drops points that repeat, which a clip against a box can easily produce. */
function dedupe(points: readonly ArrowPoint[]): ArrowPoint[] {
  const kept: ArrowPoint[] = [];
  for (const point of points) {
    const last = kept[kept.length - 1];
    if (last && distance(last, point) < 0.5) continue;
    kept.push(point);
  }
  return kept.length > 0 ? kept : [...points.slice(0, 1)];
}

/**
 * Push an endpoint out to the outline of the element it is bound to.
 *
 * `towards` is the direction the first leg leaves in, which for an elbow is
 * axis-aligned — so the arrow leaves through the face it is actually heading
 * for rather than through whichever face happens to face the far end.
 */
function clipToTarget(
  target: ArrowTarget | undefined,
  towards: ArrowPoint,
  fallback: ArrowPoint,
): ArrowPoint {
  if (!target) return fallback;
  const centre = centreOf(target.box);
  const delta = { x: towards.x - centre.x, y: towards.y - centre.y };
  if (delta.x === 0 && delta.y === 0) return fallback;
  const size = { width: target.box.width, height: target.box.height };
  const scale = diagramBoundaryScale(target.shape, size, delta);
  return { x: centre.x + delta.x * scale, y: centre.y + delta.y * scale };
}

/**
 * The point an attachment names, and which way is out of the element there.
 *
 * On a solid element the point is pushed onto the outline, so a fraction that
 * names the middle of the left edge lands on the edge whatever shape the
 * element is — an ellipse's curve, a diamond's slope. A freeform one is used
 * as it is: the arrow lands on the drawing rather than on the box around it.
 */
export function attachPointOn(
  target: ArrowTarget,
  at: ArrowAttach,
): { point: ArrowPoint; outward: ArrowPoint } {
  const raw = {
    x: target.box.x + at.u * target.box.width,
    y: target.box.y + at.v * target.box.height,
  };
  const centre = centreOf(target.box);
  const delta = { x: raw.x - centre.x, y: raw.y - centre.y };
  const length = Math.hypot(delta.x, delta.y);
  // Dead centre has no "out"; up is as good an answer as any and never happens
  // for an edge attachment, which is what this is for.
  const outward = length === 0 ? { x: 0, y: -1 } : { x: delta.x / length, y: delta.y / length };
  if (target.freeform) return { point: raw, outward };

  const size = { width: target.box.width, height: target.box.height };
  const scale = diagramBoundaryScale(target.shape, size, delta);
  return { point: { x: centre.x + delta.x * scale, y: centre.y + delta.y * scale }, outward };
}

interface ResolvedEnd {
  /** Where the route starts from before any clipping. */
  anchor: ArrowPoint;
  target: ArrowTarget | undefined;
  /** True when the anchor is already the final point and must not be clipped. */
  pinned: boolean;
  outward: ArrowPoint | null;
}

function resolveEnd(endpoint: ArrowEndpoint, lookup: ArrowTargetLookup | undefined): ResolvedEnd {
  const target = endpoint.elementId && lookup ? lookup(endpoint.elementId) : undefined;
  // A binding whose element has gone falls back to the stored point, which is
  // why that point is kept: the arrow stays where it was rather than jumping.
  // Copied rather than passed through, so the binding cannot leak into the
  // route's points and from there into a caller's bounds or hit test.
  if (!target) {
    return {
      anchor: { x: endpoint.x, y: endpoint.y },
      target: undefined,
      pinned: true,
      outward: null,
    };
  }
  if (endpoint.at) {
    const attached = attachPointOn(target, endpoint.at);
    return { anchor: attached.point, target, pinned: true, outward: attached.outward };
  }
  // No attachment named: aim at the centre and let the clip decide the face,
  // which is how an edge behaves and what a drop into the middle of a shape
  // should keep doing.
  return { anchor: centreOf(target.box), target, pinned: false, outward: null };
}

/**
 * Where a self-loop leaves and re-enters when neither end says.
 *
 * The top edge and the right edge, so the default loop turns a corner and is
 * visibly a loop. Two points on one face would give a route doubling back on
 * itself, which reads as a mistake.
 */
function defaultLoopAttachments(): [ArrowAttach, ArrowAttach] {
  return [
    { u: 0.75, v: 0 },
    { u: 1, v: 0.75 },
  ];
}

/**
 * Which face of an element a point sits on, as an outward axis-aligned normal.
 *
 * Elbow routing is square, so it needs a face rather than a direction: an
 * attachment a third of the way down the left edge has to be left of the
 * element, not up-and-left of its centre.
 */
function faceNormal(box: ArrowBox, point: ArrowPoint): ArrowPoint {
  const gaps = [
    { n: { x: -1, y: 0 }, gap: Math.abs(point.x - box.x) },
    { n: { x: 1, y: 0 }, gap: Math.abs(point.x - (box.x + box.width)) },
    { n: { x: 0, y: -1 }, gap: Math.abs(point.y - box.y) },
    { n: { x: 0, y: 1 }, gap: Math.abs(point.y - (box.y + box.height)) },
  ];
  return gaps.reduce((best, current) => (current.gap < best.gap ? current : best)).n;
}

/**
 * The face an elbow should leave through, from the direction of travel.
 *
 * The dominant axis, not the ray out of the centre: a wide, short element with
 * its partner down and to the right is left through the right-hand face,
 * because that is the way the route is going. Clipping the ray instead would
 * drop it out of the bottom, which is geometrically true and reads as wrong.
 */
function faceTowards(delta: ArrowPoint): ArrowAttach {
  if (Math.abs(delta.x) >= Math.abs(delta.y)) {
    return delta.x >= 0 ? { u: 1, v: 0.5 } : { u: 0, v: 0.5 };
  }
  return delta.y >= 0 ? { u: 0.5, v: 1 } : { u: 0.5, v: 0 };
}

function inflate(box: ArrowBox, by: number): ArrowBox {
  return { x: box.x - by, y: box.y - by, width: box.width + by * 2, height: box.height + by * 2 };
}

/** The four corners of a box, clockwise from the top-left. */
function cornersOf(box: ArrowBox): ArrowPoint[] {
  return [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ];
}

/**
 * How far clockwise around a box's perimeter a point on it sits, from the
 * top-left corner. Used to walk the ring between two points.
 */
function perimeterPosition(box: ArrowBox, point: ArrowPoint): number {
  const { width: w, height: h } = box;
  const right = box.x + w;
  const bottom = box.y + h;
  // Nearest edge first, so a point a hair off the ring still places sensibly.
  const normal = faceNormal(box, point);
  if (normal.y < 0) return point.x - box.x;
  if (normal.x > 0) return w + (point.y - box.y);
  if (normal.y > 0) return w + h + (right - point.x);
  return w + h + w + (bottom - point.y);
}

/**
 * An arrow whose ends are on the same element, routed around it.
 *
 * A line between two points on one outline cuts through the thing it is
 * describing, so the route steps out to a ring around the element and travels
 * along that ring. Walking the ring — rather than joining the two stepped-out
 * points directly — is what keeps it outside at every position: two
 * attachments on opposite faces would otherwise be joined straight back across
 * the middle.
 *
 * Only elbows loop. A straight self-arrow is left as the straight line it says
 * it is, between the two points it attaches to.
 */
function selfLoopPoints(target: ArrowTarget, from: ArrowEndpoint, to: ArrowEndpoint): ArrowPoint[] {
  const [defaultFrom, defaultTo] = defaultLoopAttachments();
  const start = attachPointOn(target, from.at ?? defaultFrom);
  const end = attachPointOn(target, to.at ?? defaultTo);

  const ring = inflate(target.box, ARROW_LOOP_EXTENT);
  const startNormal = faceNormal(target.box, start.point);
  const endNormal = faceNormal(target.box, end.point);
  // Step straight out from each face, so both ends meet the element square on.
  const outFrom = pushToRing(ring, start.point, startNormal);
  const outTo = pushToRing(ring, end.point, endNormal);

  return [start.point, outFrom, ...ringWalk(ring, outFrom, outTo), outTo, end.point];
}

/** Move a point out to the ring along one axis, leaving the other alone. */
function pushToRing(ring: ArrowBox, point: ArrowPoint, normal: ArrowPoint): ArrowPoint {
  if (normal.x < 0) return { x: ring.x, y: point.y };
  if (normal.x > 0) return { x: ring.x + ring.width, y: point.y };
  if (normal.y < 0) return { x: point.x, y: ring.y };
  return { x: point.x, y: ring.y + ring.height };
}

/**
 * The ring corners between two points on it, going the short way round.
 *
 * Every segment of the walk runs along a side of the ring, so the loop is
 * square — which is what an elbowed arrow is for — and never crosses the
 * element the ring surrounds.
 */
function ringWalk(ring: ArrowBox, from: ArrowPoint, to: ArrowPoint): ArrowPoint[] {
  const perimeter = (ring.width + ring.height) * 2;
  if (perimeter <= 0) return [];
  const start = perimeterPosition(ring, from);
  const end = perimeterPosition(ring, to);
  const corners = cornersOf(ring);
  const cornerAt = [0, ring.width, ring.width + ring.height, ring.width * 2 + ring.height];

  const forward = (end - start + perimeter) % perimeter;
  const clockwise = forward <= perimeter - forward;

  const between: ArrowPoint[] = [];
  for (let step = 0; step < 4; step += 1) {
    // Walk the corners in order from the start, taking those the arc passes.
    const index = clockwise ? step : 3 - step;
    const position = cornerAt[index]!;
    const travelled = clockwise
      ? (position - start + perimeter) % perimeter
      : (start - position + perimeter) % perimeter;
    const span = clockwise ? forward : perimeter - forward;
    if (travelled > 0 && travelled < span) between.push({ ...corners[index]! });
  }
  // Corners come out in `cornerAt` order, not in the order the walk meets them.
  between.sort((a, b) => {
    const pa = perimeterPosition(ring, a);
    const pb = perimeterPosition(ring, b);
    const da = clockwise
      ? (pa - start + perimeter) % perimeter
      : (start - pa + perimeter) % perimeter;
    const db = clockwise
      ? (pb - start + perimeter) % perimeter
      : (start - pb + perimeter) % perimeter;
    return da - db;
  });
  return between;
}

/**
 * The right-angled route between two free anchors.
 *
 * The longer axis goes first, which is what keeps a mostly-horizontal arrow
 * from starting with a vertical stub. `bend` slides the middle leg along the
 * other axis, and is the whole of what dragging that leg stores.
 */
function elbowCorners(from: ArrowPoint, to: ArrowPoint, bend: number): ArrowPoint[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const midX = (from.x + to.x) / 2 + bend;
    return [
      { x: midX, y: from.y },
      { x: midX, y: to.y },
    ];
  }
  const midY = (from.y + to.y) / 2 + bend;
  return [
    { x: from.x, y: midY },
    { x: to.x, y: midY },
  ];
}

/**
 * Cost of a corner, in scene units of travel.
 *
 * A route is chosen by distance plus this per bend, so a slightly longer path
 * with fewer turns wins — which is what reads as deliberate rather than as the
 * connector picking its way around.
 */
const ARROW_BEND_COST = 70;

const EPS = 0.01;

/** Does an axis-aligned segment pass through the inside of this box? */
function segmentCrossesBox(a: ArrowPoint, b: ArrowPoint, box: ArrowBox): boolean {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return (
    maxX > box.x + EPS &&
    minX < box.x + box.width - EPS &&
    maxY > box.y + EPS &&
    minY < box.y + box.height - EPS
  );
}

function pointInsideBox(point: ArrowPoint, box: ArrowBox): boolean {
  return (
    point.x > box.x + EPS &&
    point.x < box.x + box.width - EPS &&
    point.y > box.y + EPS &&
    point.y < box.y + box.height - EPS
  );
}

type RouteAxis = 'h' | 'v';

/**
 * A square route between two escape points that goes around the elements
 * rather than through them.
 *
 * The corners worth turning on are the two escape points and the ring around
 * each element — every line a sensible orthogonal route would ever use. Those
 * lines make a small grid, and the route is the cheapest walk across it that
 * never crosses an element, counting a bend as `ARROW_BEND_COST` of travel.
 *
 * This replaces joining the two escape points with a plain L or Z. That was
 * right whenever both ends happened to face their destination and wrong the
 * moment one did not: an arrow pinned to the left edge of an element whose
 * partner is to the right would set off leftwards, turn, and come straight back
 * through the element it had just left.
 */
function routeBetweenEscapes(
  escapeFrom: ArrowPoint,
  escapeTo: ArrowPoint,
  firstAxis: RouteAxis,
  obstacles: readonly ArrowBox[],
): ArrowPoint[] | null {
  const rings = obstacles.map((box) => inflate(box, ARROW_ELBOW_STUB));
  const lines = (pick: (ring: ArrowBox) => number[], ends: [number, number]) => {
    const values = [...ends, (ends[0] + ends[1]) / 2, ...rings.flatMap(pick)];
    return [...new Set(values.map(round))].sort((a, b) => a - b);
  };
  const xs = lines((ring) => [ring.x, ring.x + ring.width], [escapeFrom.x, escapeTo.x]);
  const ys = lines((ring) => [ring.y, ring.y + ring.height], [escapeFrom.y, escapeTo.y]);

  const nodes: ArrowPoint[] = [];
  const indexOf = new Map<string, number>();
  const key = (x: number, y: number) => `${x}:${y}`;
  for (const x of xs) {
    for (const y of ys) {
      const point = { x, y };
      if (obstacles.some((box) => pointInsideBox(point, box))) continue;
      indexOf.set(key(x, y), nodes.length);
      nodes.push(point);
    }
  }

  const from = indexOf.get(key(round(escapeFrom.x), round(escapeFrom.y)));
  const to = indexOf.get(key(round(escapeTo.x), round(escapeTo.y)));
  if (from === undefined || to === undefined) return null;

  // Neighbours: the next line along in each direction, when the step is clear.
  const neighbours = nodes.map(() => [] as { node: number; axis: RouteAxis; cost: number }[]);
  for (let index = 0; index < nodes.length; index += 1) {
    const point = nodes[index]!;
    const axes: [RouteAxis, number[]][] = [
      ['h', xs],
      ['v', ys],
    ];
    for (const [axis, values] of axes) {
      const at = values.indexOf(axis === 'h' ? point.x : point.y);
      for (const step of [-1, 1]) {
        const value = values[at + step];
        if (value === undefined) continue;
        const next = axis === 'h' ? { x: value, y: point.y } : { x: point.x, y: value };
        const target = indexOf.get(key(next.x, next.y));
        if (target === undefined) continue;
        if (obstacles.some((box) => segmentCrossesBox(point, next, box))) continue;
        neighbours[index]!.push({ node: target, axis, cost: distance(point, next) });
      }
    }
  }

  // Dijkstra over (node, the axis it was reached along), so a turn can be paid
  // for. Tiny by construction: at most seven lines each way.
  type State = { node: number; axis: RouteAxis };
  const stateKey = (state: State) => `${state.node}:${state.axis}`;
  const best = new Map<string, number>();
  const cameFrom = new Map<string, State | null>();
  const first: State = { node: from, axis: firstAxis };
  best.set(stateKey(first), 0);
  cameFrom.set(stateKey(first), null);
  const queue: (State & { cost: number })[] = [{ ...first, cost: 0 }];

  let goal: State | null = null;
  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift()!;
    if (current.cost > (best.get(stateKey(current)) ?? Number.POSITIVE_INFINITY)) continue;
    if (current.node === to) {
      goal = { node: current.node, axis: current.axis };
      break;
    }
    for (const edge of neighbours[current.node]!) {
      const cost = current.cost + edge.cost + (edge.axis === current.axis ? 0 : ARROW_BEND_COST);
      const next: State = { node: edge.node, axis: edge.axis };
      if (cost < (best.get(stateKey(next)) ?? Number.POSITIVE_INFINITY)) {
        best.set(stateKey(next), cost);
        cameFrom.set(stateKey(next), current);
        queue.push({ ...next, cost });
      }
    }
  }
  if (!goal) return null;

  const path: ArrowPoint[] = [];
  let cursor: State | null = goal;
  while (cursor) {
    path.unshift(nodes[cursor.node]!);
    cursor = cameFrom.get(stateKey(cursor)) ?? null;
  }
  // Only the turns are geometry; a point mid-leg is noise.
  return path.filter((point, index) => {
    if (index === 0 || index === path.length - 1) return true;
    const before = path[index - 1]!;
    const after = path[index + 1]!;
    const straight =
      (Math.abs(before.x - point.x) < EPS && Math.abs(after.x - point.x) < EPS) ||
      (Math.abs(before.y - point.y) < EPS && Math.abs(after.y - point.y) < EPS);
    return !straight;
  });
}

/** The plain connector, for when the search has nothing to go around. */
function simpleConnector(
  stubFrom: ArrowPoint,
  stubTo: ArrowPoint,
  firstAxis: RouteAxis,
  toNormal: ArrowPoint | null,
  bend: number,
): ArrowPoint[] {
  const toHorizontal = toNormal ? toNormal.x !== 0 : firstAxis !== 'h';
  if (firstAxis === 'h' && toHorizontal) {
    const midX = (stubFrom.x + stubTo.x) / 2 + bend;
    return [
      { x: midX, y: stubFrom.y },
      { x: midX, y: stubTo.y },
    ];
  }
  if (firstAxis === 'v' && !toHorizontal) {
    const midY = (stubFrom.y + stubTo.y) / 2 + bend;
    return [
      { x: stubFrom.x, y: midY },
      { x: stubTo.x, y: midY },
    ];
  }
  return firstAxis === 'h' ? [{ x: stubTo.x, y: stubFrom.y }] : [{ x: stubFrom.x, y: stubTo.y }];
}

/**
 * An elbow route that leaves and arrives square to whatever it is attached to.
 *
 * Each bound end gets a stub along its face's normal before the route is
 * allowed to turn; without that, a route whose overall run is sideways would
 * set off along the very edge it just left, which reads as grazing the element
 * rather than pointing at it. From those two stubs the route is searched around
 * whatever the arrow is attached to.
 */
function elbowRoute(
  from: { point: ArrowPoint; normal: ArrowPoint | null },
  to: { point: ArrowPoint; normal: ArrowPoint | null },
  bend: number,
  obstacles: readonly ArrowBox[],
): ArrowPoint[] {
  if (!from.normal && !to.normal) {
    // Neither end is attached, so there is nothing to go around: the plain
    // rule, leading with the longer axis.
    return elbowCorners(from.point, to.point, bend);
  }

  const stubFrom = from.normal
    ? {
        x: from.point.x + from.normal.x * ARROW_ELBOW_STUB,
        y: from.point.y + from.normal.y * ARROW_ELBOW_STUB,
      }
    : from.point;
  const stubTo = to.normal
    ? {
        x: to.point.x + to.normal.x * ARROW_ELBOW_STUB,
        y: to.point.y + to.normal.y * ARROW_ELBOW_STUB,
      }
    : to.point;

  const firstAxis: RouteAxis = from.normal
    ? from.normal.x !== 0
      ? 'h'
      : 'v'
    : Math.abs(stubTo.x - stubFrom.x) >= Math.abs(stubTo.y - stubFrom.y)
      ? 'h'
      : 'v';

  const found = routeBetweenEscapes(stubFrom, stubTo, firstAxis, obstacles);
  const middle = found
    ? found.slice(1, -1)
    : simpleConnector(stubFrom, stubTo, firstAxis, to.normal, bend);
  const route = [stubFrom, ...middle, stubTo];

  // `bend` slides the middle leg, but only where there is exactly one to slide.
  // A route that had to go around has no single middle, and moving one of its
  // legs would push it back through whatever it went around.
  if (bend !== 0 && route.length === 4) {
    const a = route[1]!;
    const b = route[2]!;
    const vertical = Math.abs(a.x - route[0]!.x) > Math.abs(a.y - route[0]!.y);
    const shifted = vertical
      ? [
          { ...a, x: a.x + bend },
          { ...b, x: b.x + bend },
        ]
      : [
          { ...a, y: a.y + bend },
          { ...b, y: b.y + bend },
        ];
    const bent = [route[0]!, ...shifted, route[3]!];
    const clear = obstacles.every((box) =>
      bent.every(
        (_, index) => index === 0 || !segmentCrossesBox(bent[index - 1]!, bent[index]!, box),
      ),
    );
    if (clear) return bent;
  }
  return route;
}

function angleBetween(from: ArrowPoint, to: ArrowPoint): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function polylineLength(points: readonly ArrowPoint[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distance(points[index - 1]!, points[index]!);
  }
  return total;
}

/** The point a given distance along a polyline; used for the label. */
function pointAlong(points: readonly ArrowPoint[], travel: number): ArrowPoint {
  let remaining = travel;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]!;
    const b = points[index]!;
    const length = distance(a, b);
    if (length === 0) continue;
    if (remaining <= length) {
      const ratio = remaining / length;
      return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
    }
    remaining -= length;
  }
  return points[points.length - 1] ?? { x: 0, y: 0 };
}

/** Pull both ends of a polyline back, so a cap has room to sit. */
function trimPolyline(
  points: readonly ArrowPoint[],
  startInset: number,
  endInset: number,
): ArrowPoint[] {
  const total = polylineLength(points);
  // Two caps on a very short arrow would meet in the middle and invert it.
  const room = Math.max(0, total - 1);
  const start = Math.min(startInset, room);
  const end = Math.min(endInset, Math.max(0, room - start));
  if (start === 0 && end === 0) return [...points];

  const kept: ArrowPoint[] = [pointAlong(points, start)];
  let travelled = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    travelled += distance(points[index - 1]!, points[index]!);
    if (travelled > start && travelled < total - end) kept.push(points[index]!);
  }
  kept.push(pointAlong(points, total - end));
  return dedupe(kept);
}

/**
 * Path data with rounded corners.
 *
 * The radius shrinks to fit the shorter of the two legs it joins, so a tight
 * elbow rounds less rather than overshooting into the next leg.
 */
function roundedPath(points: readonly ArrowPoint[], radius: number): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  if (rest.length === 0) return `M ${round(first!.x)} ${round(first!.y)}`;

  let data = `M ${round(first!.x)} ${round(first!.y)}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]!;
    const corner = points[index]!;
    const next = points[index + 1]!;
    const into = distance(previous, corner);
    const outOf = distance(corner, next);
    const r = Math.min(radius, into / 2, outOf / 2);
    if (r <= 0.5) {
      data += ` L ${round(corner.x)} ${round(corner.y)}`;
      continue;
    }
    const entry = {
      x: corner.x + ((previous.x - corner.x) / into) * r,
      y: corner.y + ((previous.y - corner.y) / into) * r,
    };
    const exit = {
      x: corner.x + ((next.x - corner.x) / outOf) * r,
      y: corner.y + ((next.y - corner.y) / outOf) * r,
    };
    data += ` L ${round(entry.x)} ${round(entry.y)}`;
    data += ` Q ${round(corner.x)} ${round(corner.y)} ${round(exit.x)} ${round(exit.y)}`;
  }
  const last = points[points.length - 1]!;
  return `${data} L ${round(last.x)} ${round(last.y)}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * One cap, as a path already rotated into place.
 *
 * Caps are drawn as paths rather than as SVG markers on purpose. A marker is
 * identified by url, so ten cap shapes across eight stroke colours and two ends
 * would be eighty definitions to mint, name and garbage-collect per surface —
 * and a hollow marker still could not take the canvas colour behind it.
 */
export function arrowCapGeometry(
  cap: ArrowCap,
  point: ArrowPoint,
  angle: number,
  strokeWidth: number,
): ArrowCapGeometry {
  const base: Omit<ArrowCapGeometry, 'd' | 'filled' | 'closed' | 'inset'> = { cap, point, angle };
  // Caps grow with the line but not in step with it: a 6px line with a cap six
  // times the size of a 1px line's would be all head and no arrow.
  const size = 5 + strokeWidth * 1.6;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // Local space points along +x in the direction of travel, with the tip at the
  // endpoint, so every shape below is written as if the arrow ran left to right.
  const place = (x: number, y: number): ArrowPoint => ({
    x: point.x + x * cos - y * sin,
    y: point.y + x * sin + y * cos,
  });
  const polygon = (...local: [number, number][]) =>
    `${local
      .map(([x, y], index) => {
        const placed = place(x, y);
        return `${index === 0 ? 'M' : 'L'} ${round(placed.x)} ${round(placed.y)}`;
      })
      .join(' ')} Z`;

  switch (cap) {
    case 'none':
      return { ...base, d: '', filled: false, closed: false, inset: 0 };
    case 'line': {
      // An open V, stroked rather than filled, so it reads as two pen strokes.
      // Spread wider than the filled heads: at a heavy stroke weight a narrow V
      // closes up under its own line joins and becomes a solid triangle.
      const back = place(-size * 1.1, -size * 0.9);
      const tip = place(0, 0);
      const forward = place(-size * 1.1, size * 0.9);
      return {
        ...base,
        d: `M ${round(back.x)} ${round(back.y)} L ${round(tip.x)} ${round(tip.y)} L ${round(forward.x)} ${round(forward.y)}`,
        filled: false,
        closed: false,
        inset: 0,
      };
    }
    case 'solid':
      return {
        ...base,
        d: polygon([0, 0], [-size, -size * 0.55], [-size * 0.7, 0], [-size, size * 0.55]),
        filled: true,
        closed: true,
        inset: size * 0.7,
      };
    case 'triangle':
    case 'triangleHollow':
      return {
        ...base,
        d: polygon([0, 0], [-size, -size * 0.6], [-size, size * 0.6]),
        filled: cap === 'triangle',
        closed: true,
        inset: size,
      };
    case 'circle':
    case 'circleHollow': {
      const radius = size * 0.45;
      const centre = place(-radius, 0);
      // Two half-arcs, because SVG has no circle command inside path data.
      const left = { x: centre.x - radius * cos, y: centre.y - radius * sin };
      const right = { x: centre.x + radius * cos, y: centre.y + radius * sin };
      return {
        ...base,
        d:
          `M ${round(left.x)} ${round(left.y)} ` +
          `A ${round(radius)} ${round(radius)} 0 1 1 ${round(right.x)} ${round(right.y)} ` +
          `A ${round(radius)} ${round(radius)} 0 1 1 ${round(left.x)} ${round(left.y)} Z`,
        filled: cap === 'circle',
        closed: true,
        inset: radius * 2,
      };
    }
    case 'diamond':
    case 'diamondHollow':
      return {
        ...base,
        d: polygon(
          [0, 0],
          [-size * 0.6, -size * 0.45],
          [-size * 1.2, 0],
          [-size * 0.6, size * 0.45],
        ),
        filled: cap === 'diamond',
        closed: true,
        inset: size * 1.2,
      };
    case 'bar': {
      const top = place(0, -size * 0.7);
      const bottom = place(0, size * 0.7);
      return {
        ...base,
        d: `M ${round(top.x)} ${round(top.y)} L ${round(bottom.x)} ${round(bottom.y)}`,
        filled: false,
        closed: false,
        inset: 0,
      };
    }
  }
}

/**
 * Everything needed to draw one arrow.
 *
 * `lookup` resolves a bound endpoint to the element it points at. Pass nothing
 * and every endpoint falls back to its stored point, which is what a renderer
 * with no scene to hand — a thumbnail, a test — should see.
 */
export function arrowGeometry(arrow: ArrowElement, lookup?: ArrowTargetLookup): ArrowGeometry {
  const from = resolveEnd(arrow.from, lookup);
  const to = resolveEnd(arrow.to, lookup);
  const route = arrowRoute(arrow);

  // Both ends on one element. Only an elbow loops around it: a straight arrow
  // was asked to be straight, so it stays the line between its two ends.
  const onItself = Boolean(from.target && to.target && from.target.id === to.target.id);
  const loop =
    onItself && route === 'elbow' ? selfLoopPoints(from.target!, arrow.from, arrow.to) : null;

  let points: ArrowPoint[];
  if (loop) {
    points = dedupe(loop);
  } else if (onItself) {
    // A straight self-arrow, drawn between the two places it attaches — with
    // defaults when it named none, or it would have no length at all.
    const [defaultFrom, defaultTo] = defaultLoopAttachments();
    const target = from.target!;
    points = dedupe([
      attachPointOn(target, arrow.from.at ?? defaultFrom).point,
      attachPointOn(target, arrow.to.at ?? defaultTo).point,
    ]);
  } else if (route === 'elbow') {
    // Square routing needs a face to leave through. An end that only aims at a
    // centre takes the middle of the face it is travelling towards, which is
    // both predictable and already square to the element.
    const startClip =
      from.pinned || !from.target
        ? from.anchor
        : attachPointOn(
            from.target,
            faceTowards({ x: to.anchor.x - from.anchor.x, y: to.anchor.y - from.anchor.y }),
          ).point;
    const endClip =
      to.pinned || !to.target
        ? to.anchor
        : attachPointOn(
            to.target,
            faceTowards({ x: from.anchor.x - to.anchor.x, y: from.anchor.y - to.anchor.y }),
          ).point;
    const startNormal = from.target ? faceNormal(from.target.box, startClip) : null;
    const endNormal = to.target ? faceNormal(to.target.box, endClip) : null;
    points = dedupe([
      startClip,
      ...elbowRoute(
        { point: startClip, normal: startNormal },
        { point: endClip, normal: endNormal },
        arrow.bend ?? 0,
        // What the route must not cut through: the elements it joins.
        [from.target?.box, to.target?.box].filter((box): box is ArrowBox => box !== undefined),
      ),
      endClip,
    ]);
  } else {
    // Straight: each end is clipped towards the other, exactly as an edge is.
    const startPoint = from.pinned
      ? from.anchor
      : clipToTarget(from.target, to.anchor, from.anchor);
    const endPoint = to.pinned ? to.anchor : clipToTarget(to.target, from.anchor, to.anchor);
    points = dedupe([startPoint, endPoint]);
  }

  const strokeWidth = arrowStrokeWidth(arrow);

  // Every route above ends in `dedupe`, which never returns nothing — but this
  // runs on stored data as well as on the editor's own, and a geometry helper
  // that can throw takes the whole board down with it rather than losing one
  // arrow. A degenerate arrow draws as a dot instead.
  if (points.length === 0) points = [{ x: arrow.from.x, y: arrow.from.y }];

  // A cap points back down the leg it sits on, so a one-point route (two
  // elements on top of each other) falls back to something drawable.
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const second = points[1] ?? first;
  const penultimate = points[points.length - 2] ?? last;
  const startAngle = angleBetween(second, first);
  const endAngle = angleBetween(penultimate, last);

  const start = arrowCapGeometry(arrowStartCap(arrow), first, startAngle, strokeWidth);
  const end = arrowCapGeometry(arrowEndCap(arrow), last, endAngle, strokeWidth);

  const line = trimPolyline(points, start.inset, end.inset);
  // A loop rounds hard enough to read as a curve rather than as a detour with
  // square corners; an elbowed one keeps the right angles it asked for.
  const radius = loop && route !== 'elbow' ? ARROW_LOOP_EXTENT / 2 : ARROW_CORNER_RADIUS;
  return {
    points,
    d: roundedPath(line, radius),
    start,
    end,
    label: arrowLabelPoint(points, arrowLabelT(arrow), arrowLabelSide(arrow), arrowFontSize(arrow)),
  };
}

/**
 * Where the label goes: `t` of the way along the route, stepped off the leg it
 * lands on when it asked for a side.
 *
 * The step is perpendicular to that leg, so a label on a vertical leg moves
 * sideways rather than up — "above" is the reader's above, since the text does
 * not rotate with the line.
 */
export function arrowLabelPoint(
  points: readonly ArrowPoint[],
  t: number,
  side: ArrowLabelSide,
  fontSize: number = DIAGRAM_LEGACY_FONT_SIZE,
): ArrowPoint {
  const total = polylineLength(points);
  const along = pointAlong(points, total * t);
  if (side === 'on' || points.length < 2) return along;

  // Which leg the label landed on decides which way "off the line" is.
  let travelled = 0;
  let leg: [ArrowPoint, ArrowPoint] = [points[0]!, points[1]!];
  const target = total * t;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]!;
    const b = points[index]!;
    const length = distance(a, b);
    if (target <= travelled + length || index === points.length - 1) {
      leg = [a, b];
      break;
    }
    travelled += length;
  }

  const horizontal = Math.abs(leg[1].x - leg[0].x) >= Math.abs(leg[1].y - leg[0].y);
  const offset = arrowLabelOffset(fontSize);
  const step = side === 'above' ? -offset : offset;
  return horizontal ? { x: along.x, y: along.y + step } : { x: along.x + step, y: along.y };
}

/**
 * How far along a route a point is, as the fraction a label stores.
 *
 * The nearest place on the line to the pointer, so dragging a label tracks the
 * line rather than the pointer's distance from its start — on an elbow those
 * are quite different things.
 */
export function nearestTOnRoute(points: readonly ArrowPoint[], point: ArrowPoint): number {
  const total = polylineLength(points);
  if (total === 0) return 0.5;

  let travelled = 0;
  let bestT = 0.5;
  let bestGap = Number.POSITIVE_INFINITY;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]!;
    const b = points[index]!;
    const length = distance(a, b);
    if (length > 0) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const along = Math.max(
        0,
        Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (length * length)),
      );
      const on = { x: a.x + dx * along, y: a.y + dy * along };
      const gap = distance(point, on);
      if (gap < bestGap) {
        bestGap = gap;
        bestT = (travelled + length * along) / total;
      }
    }
    travelled += length;
  }
  return Math.min(1, Math.max(0, bestT));
}

/** The box around an arrow, for a marquee sweep and for align/distribute. */
export function arrowBounds(points: readonly ArrowPoint[]): ArrowBox | null {
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

/** Shortest distance from a point to a line segment. */
function distanceToSegment(point: ArrowPoint, a: ArrowPoint, b: ArrowPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, a);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return distance(point, { x: a.x + dx * t, y: a.y + dy * t });
}

/**
 * Is the point close enough to the arrow to have meant it?
 *
 * Measured against the route's straight legs, not the rounded corner curves: a
 * corner rounds by at most a few units, which is inside the tolerance a
 * pointer needs anyway.
 */
export function arrowHitTest(
  point: ArrowPoint,
  points: readonly ArrowPoint[],
  tolerance: number,
): boolean {
  if (points.length === 1) return distance(point, points[0]!) <= tolerance;
  for (let index = 1; index < points.length; index += 1) {
    if (distanceToSegment(point, points[index - 1]!, points[index]!) <= tolerance) return true;
  }
  return false;
}

/** Move a whole arrow, carrying its stored fallback points with it. */
export function offsetArrow(arrow: ArrowElement, dx: number, dy: number): ArrowElement {
  return {
    ...arrow,
    from: { ...arrow.from, x: arrow.from.x + dx, y: arrow.from.y + dy },
    to: { ...arrow.to, x: arrow.to.x + dx, y: arrow.to.y + dy },
  };
}
