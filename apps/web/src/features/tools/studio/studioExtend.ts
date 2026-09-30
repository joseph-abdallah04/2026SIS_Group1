// Growing a diagram from one shape: "add another one over there, joined to this".
//
// A selected shape offers a button beside each side. Picking a shape from it
// places that shape a short, consistent gap away on that side and joins the two
// with an arrow — the same arrow a connection between two existing shapes makes.
// The new shape starts as a sibling of its source: the same shape comes back the
// same size and the same colours, and a different one keeps the colours at least,
// so a flow built this way reads as one piece.
//
// Pure, so where the shape lands — near an edge, next to something already
// there, off a turned source — is testable without a canvas.

import {
  DIAGRAM_CANVAS_HEIGHT,
  DIAGRAM_CANVAS_WIDTH,
  effectiveDiagramNodeSize,
  rotatePoint,
  type ArrowElement,
  type DiagramNode,
  type DiagramNodeShape,
  type DiagramNodeSize,
} from '@roundtable/shared';

import {
  DIAGRAM_NEW_NODE_FONT_SIZE,
  DIAGRAM_NODE_SHAPES,
  newNodeSize,
  nodeBounds,
  placeNodePosition,
  type DiagramPoint,
  type DiagramRect,
} from '../diagram/diagramModel';

export type ExtendSide = 'n' | 'e' | 's' | 'w';

export const EXTEND_SIDES: readonly ExtendSide[] = ['n', 'e', 's', 'w'];

/**
 * The gap between the source and the new shape, edge to edge.
 *
 * Wide enough that the arrow between them is plainly an arrow, with its head
 * clear of both outlines, and narrow enough that the two still read as one step
 * in a flow rather than as two separate ideas.
 */
export const EXTEND_GAP = 64;

/**
 * The narrowest the gap gets when the sheet runs out before the full one fits.
 * Still room for a visible arrowhead; below this the arrow is just a stub.
 */
export const EXTEND_MIN_GAP = 24;

/** Each side's outward direction on an unturned shape, in degrees (y down). */
export const EXTEND_SIDE_ANGLE: Record<ExtendSide, number> = { e: 0, s: 90, w: 180, n: 270 };

export const EXTEND_SIDE_LABELS: Record<ExtendSide, string> = {
  n: 'above',
  e: 'to the right',
  s: 'below',
  w: 'to the left',
};

/** The unit vector pointing out of `side` of a shape turned by `rotation`. */
export function extendSideNormal(side: ExtendSide, rotation = 0): DiagramPoint {
  const radians = (EXTEND_SIDE_ANGLE[side] * Math.PI) / 180;
  // `+ 0` folds the -0 that rounding a tiny negative sine produces.
  const unturned = { x: Math.round(Math.cos(radians)) + 0, y: Math.round(Math.sin(radians)) + 0 };
  return rotation ? rotatePoint(unturned, { x: 0, y: 0 }, rotation) : unturned;
}

/**
 * The shapes the button offers, the source's own first — which is also the one
 * focused when the picker opens, so the commonest answer is one key away.
 *
 * A container is offered only to extend a container: it is a group, and a new
 * empty one beside an ordinary shape is almost never what was meant.
 */
export function extendShapeChoices(source: DiagramNodeShape): DiagramNodeShape[] {
  const others = DIAGRAM_NODE_SHAPES.filter((shape) => shape !== 'container' && shape !== source);
  return [source, ...others];
}

/** The style a new shape inherits from the one it grew out of. */
function inheritedStyle(source: DiagramNode, shape: DiagramNodeShape): Partial<DiagramNode> {
  const text = {
    fontSizePreset: source.fontSizePreset ?? DIAGRAM_NEW_NODE_FONT_SIZE,
    ...(source.labelColor ? { labelColor: source.labelColor } : {}),
    ...(source.labelBold ? { labelBold: source.labelBold } : {}),
  };
  // A text box has no outline or fill of its own to take: painting the
  // source's fill behind it would turn a label into a box.
  if (shape === 'text') return text;
  return {
    ...text,
    ...(source.fillColor ? { fillColor: source.fillColor } : {}),
    ...(source.strokeColor ? { strokeColor: source.strokeColor } : {}),
    ...(source.strokeWidthPreset ? { strokeWidthPreset: source.strokeWidthPreset } : {}),
    // The same shape comes back laid out the same way.
    ...(shape === source.shape && source.labelAlign ? { labelAlign: source.labelAlign } : {}),
  };
}

function sizeFor(source: DiagramNode, shape: DiagramNodeShape): DiagramNodeSize {
  return shape === source.shape ? effectiveDiagramNodeSize(source) : newNodeSize(shape);
}

function onSheet(box: DiagramRect): boolean {
  return (
    box.x >= 0 &&
    box.y >= 0 &&
    box.x + box.width <= DIAGRAM_CANVAS_WIDTH &&
    box.y + box.height <= DIAGRAM_CANVAS_HEIGHT
  );
}

function overlaps(a: DiagramRect, b: DiagramRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Where the new shape goes: its top-left corner.
 *
 * Straight out from the middle of the chosen side, `EXTEND_GAP` clear of the
 * source — measured along the side's own direction, so a turned source grows
 * the way it is pointing. Something already there pushes it one step further,
 * so building a chain never stacks a shape on top of the last one. Near the
 * sheet's edge the gap first shrinks to `EXTEND_MIN_GAP`, and if there is still
 * no room the shape slides along the edge until it fits: the side always
 * works, and the arrow simply angles to reach it.
 */
export function extendPosition(
  source: DiagramNode,
  side: ExtendSide,
  size: DiagramNodeSize,
  obstacles: readonly DiagramRect[] = [],
): DiagramPoint {
  const own = effectiveDiagramNodeSize(source);
  const rotation = source.rotation ?? 0;
  const normal = extendSideNormal(side, rotation);
  const centre = { x: source.x + own.width / 2, y: source.y + own.height / 2 };
  // How far the source reaches along its own side's direction, and how far the
  // new, unturned shape reaches back along it.
  const sourceReach = side === 'e' || side === 'w' ? own.width / 2 : own.height / 2;
  const newReach = (Math.abs(normal.x) * size.width + Math.abs(normal.y) * size.height) / 2;

  const boxAt = (gap: number): DiagramRect => {
    const distance = sourceReach + gap + newReach;
    return {
      x: Math.round(centre.x + normal.x * distance - size.width / 2),
      y: Math.round(centre.y + normal.y * distance - size.height / 2),
      width: size.width,
      height: size.height,
    };
  };

  const step = newReach * 2 + EXTEND_GAP;
  const candidates = [0, 1, 2].map((index) => boxAt(EXTEND_GAP + index * step));
  const clear = candidates.find(
    (box) => onSheet(box) && !obstacles.some((obstacle) => overlaps(box, obstacle)),
  );
  if (clear) return { x: clear.x, y: clear.y };
  if (onSheet(candidates[0]!)) return { x: candidates[0]!.x, y: candidates[0]!.y };

  const near = boxAt(EXTEND_MIN_GAP);
  if (onSheet(near)) return { x: near.x, y: near.y };
  return placeNodePosition({ x: near.x, y: near.y }, size, false);
}

/**
 * The shape and the arrow that grow `source` out from `side`.
 *
 * The arrow names no attachment point on either end, so it aims at each centre
 * and meets whichever face it approaches, sliding round as either is moved
 * afterwards. It is elbowed, as every arrow drawn out of a shape is.
 */
export function planExtension(
  nodes: readonly DiagramNode[],
  source: DiagramNode,
  side: ExtendSide,
  shape: DiagramNodeShape,
  ids: { nodeId: string; arrowId: string },
): { node: DiagramNode; arrow: ArrowElement } {
  const size = sizeFor(source, shape);
  const obstacles = nodes.filter((node) => node.id !== source.id).map(nodeBounds);
  const at = extendPosition(source, side, size, obstacles);
  // Written down only when it differs from the shape's own default, as every
  // other placement does — except a text box, which always carries its size.
  const defaultSize = newNodeSize(shape);
  const storeSize =
    shape === 'text' || size.width !== defaultSize.width || size.height !== defaultSize.height;
  const node: DiagramNode = {
    id: ids.nodeId,
    label: '',
    x: at.x,
    y: at.y,
    shape,
    ...inheritedStyle(source, shape),
    // Not given its source's container: it usually lands outside that border,
    // and a child outside its container is not something the canvas can hold.
    ...(storeSize ? { width: size.width, height: size.height } : {}),
  };

  const own = effectiveDiagramNodeSize(source);
  const arrow: ArrowElement = {
    id: ids.arrowId,
    from: { x: source.x + own.width / 2, y: source.y + own.height / 2, elementId: source.id },
    to: { x: at.x + size.width / 2, y: at.y + size.height / 2, elementId: node.id },
    // Square, the way a flow is drawn: it leaves and arrives straight on to a
    // face, and its middle leg can be slid to tidy a crowded diagram.
    route: 'elbow',
  };
  return { node, arrow };
}
