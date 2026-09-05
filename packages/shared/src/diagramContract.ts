// Diagram artifact contract.
//
// Everything the diagram tool persists or derives lives here rather than in the
// domain-types barrel: geometry, the closed shape registry, the style palettes,
// container semantics and arrow routing. `schemas.ts` imports this module
// directly so validating a payload does not pull in the whole barrel.
//
// Re-exported from `index.ts`, so every existing `@roundtable/shared` import
// keeps working unchanged.

export type DiagramNodeShape =
  'box' | 'container' | 'text' | 'rectangle' | 'ellipse' | 'triangle' | 'diamond' | 'cylinder';

// A closed registry. New primitives are added here with a default size, an
// outline and a boundary rule; arbitrary SVG or icon names are never accepted.
export const DIAGRAM_NODE_SHAPE_KEYS = [
  'box',
  'rectangle',
  'ellipse',
  'diamond',
  'triangle',
  'cylinder',
  'container',
  'text',
] as const satisfies readonly DiagramNodeShape[];

export interface DiagramNodeSize {
  width: number;
  height: number;
}

// Fixed shape geometry keeps editor, edge anchors, and board previews interoperable without stored sizes.
export function diagramNodeSize(shape?: DiagramNodeShape): DiagramNodeSize {
  switch (shape) {
    case 'box':
      return { width: 120, height: 56 };
    case 'container':
      return { width: 184, height: 112 };
    case 'text':
      return { width: 144, height: 40 };
    case 'rectangle':
      return { width: 120, height: 56 };
    case 'ellipse':
      return { width: 120, height: 72 };
    case 'triangle':
      return { width: 104, height: 88 };
    case 'diamond':
      return { width: 128, height: 88 };
    case 'cylinder':
      return { width: 112, height: 88 };
    default:
      return { width: 72, height: 32 };
  }
}

/** Only containers may hold children. Every other shape is a leaf. */
export function diagramCanParent(shape?: DiagramNodeShape): boolean {
  return shape === 'container';
}

/** The elliptical cap depth used by the cylinder outline, in node units. */
export function diagramCylinderCapHeight(height: number): number {
  return Math.max(4, Math.min(height / 4, 14));
}

interface DiagramVector {
  x: number;
  y: number;
}

// Outlines in node-local coordinates around the centre, with half-extents a, b.
const DIAGRAM_SHAPE_POLYGONS: Partial<
  Record<DiagramNodeShape, (a: number, b: number) => DiagramVector[]>
> = {
  triangle: (a, b) => [
    { x: 0, y: -b },
    { x: a, y: b },
    { x: -a, y: b },
  ],
  diamond: (a, b) => [
    { x: 0, y: -b },
    { x: a, y: 0 },
    { x: 0, y: b },
    { x: -a, y: 0 },
  ],
};

// Smallest positive ray parameter where the ray leaves a convex outline. The
// outline always contains the centre, so exactly one edge qualifies.
function polygonBoundaryScale(points: readonly DiagramVector[], delta: DiagramVector): number {
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    const from = points[index]!;
    const to = points[(index + 1) % points.length]!;
    const edge = { x: to.x - from.x, y: to.y - from.y };
    const determinant = edge.x * delta.y - edge.y * delta.x;
    if (determinant === 0) continue;
    const t = (edge.x * from.y - edge.y * from.x) / determinant;
    const s = (delta.x * from.y - delta.y * from.x) / determinant;
    if (t > 0 && s >= 0 && s <= 1 && t < best) best = t;
  }
  return Number.isFinite(best) ? best : 0;
}

/**
 * How far along `delta` the shape's outline sits, as a multiple of `delta`.
 * `1` means the boundary is exactly at the far point; the rectangle branch is
 * the original formula, so box, container and text anchors are unchanged.
 */
export function diagramBoundaryScale(
  shape: DiagramNodeShape | undefined,
  size: DiagramNodeSize,
  delta: DiagramVector,
): number {
  if (delta.x === 0 && delta.y === 0) return 0;
  const a = size.width / 2;
  const b = size.height / 2;
  if (a <= 0 || b <= 0) return 0;

  const polygon = shape ? DIAGRAM_SHAPE_POLYGONS[shape] : undefined;
  if (polygon) return polygonBoundaryScale(polygon(a, b), delta);

  if (shape === 'ellipse') {
    return 1 / Math.sqrt((delta.x / a) ** 2 + (delta.y / b) ** 2);
  }

  // Rectangular envelope. The cylinder uses it too: its curved caps sit within
  // a few units of the bounding box, and a flat anchor keeps arrows stable.
  return 1 / Math.max(Math.abs(delta.x) / a, Math.abs(delta.y) / b);
}

/**
 * Fraction of the node's width a label may occupy. Shapes that taper towards
 * the middle would otherwise let text spill outside the outline.
 */
export function diagramLabelWidthRatio(shape?: DiagramNodeShape): number {
  switch (shape) {
    case 'triangle':
      return 0.5;
    case 'diamond':
      return 0.6;
    case 'ellipse':
      return 0.78;
    case 'cylinder':
      return 0.86;
    default:
      return 1;
  }
}

// --- Diagram style contract v2 -------------------------------------------
//
// Every styling field is optional and drawn from a closed set. Diagrams authored
// before v2 carry none of them and must keep rendering exactly as they did, so
// each resolver below falls back to the surface's original hard-coded value.
// Raw CSS colours, arbitrary sizes and style objects are deliberately not
// representable: the artifact is shared, persisted, and re-rendered by other
// people's clients.

export type DiagramFillKey = 'neutral' | 'surface' | 'blue' | 'green' | 'amber' | 'rose' | 'violet';
export type DiagramStrokeKey = 'slate' | 'grey' | 'blue' | 'green' | 'amber' | 'rose' | 'violet';
export type DiagramStrokeWidthPreset = 'thin' | 'regular' | 'thick';
export type DiagramFontSizePreset = 'small' | 'medium' | 'large';
export type DiagramStrokeStyle = 'solid' | 'dashed' | 'dotted';

export const DIAGRAM_FILL_KEYS = [
  'neutral',
  'surface',
  'blue',
  'green',
  'amber',
  'rose',
  'violet',
] as const satisfies readonly DiagramFillKey[];

export const DIAGRAM_STROKE_KEYS = [
  'slate',
  'grey',
  'blue',
  'green',
  'amber',
  'rose',
  'violet',
] as const satisfies readonly DiagramStrokeKey[];

export const DIAGRAM_STROKE_WIDTH_PRESETS = [
  'thin',
  'regular',
  'thick',
] as const satisfies readonly DiagramStrokeWidthPreset[];

export const DIAGRAM_FONT_SIZE_PRESETS = [
  'small',
  'medium',
  'large',
] as const satisfies readonly DiagramFontSizePreset[];

export const DIAGRAM_STROKE_STYLES = [
  'solid',
  'dashed',
  'dotted',
] as const satisfies readonly DiagramStrokeStyle[];

/** Ink used for every node label, on every fill. */
export const DIAGRAM_LABEL_INK = '#080C15';

// Fills are light tints: each clears 15:1 against DIAGRAM_LABEL_INK, far above
// the 4.5:1 WCAG text minimum. Asserted in diagramStyle.test.ts.
export const DIAGRAM_FILL_COLORS: Record<DiagramFillKey, string> = {
  neutral: '#EEF2F4',
  surface: '#FFFFFF',
  blue: '#DCE9F7',
  green: '#DFEFE2',
  amber: '#F8ECD4',
  rose: '#FAE0E0',
  violet: '#E8E1F5',
};

// Borders and arrows are graphical objects, so they clear the 3:1 WCAG 1.4.11
// minimum against white and against every fill above. Asserted in the same test.
export const DIAGRAM_STROKE_COLORS: Record<DiagramStrokeKey, string> = {
  slate: '#4D6A74',
  grey: '#64777F',
  blue: '#2C5F8A',
  green: '#2F6B3D',
  amber: '#8A5B14',
  rose: '#A03040',
  violet: '#5B4494',
};

// `regular` reproduces the editor's original widths, so choosing it explicitly
// changes nothing visible.
export const DIAGRAM_NODE_STROKE_WIDTHS: Record<DiagramStrokeWidthPreset, number> = {
  thin: 1,
  regular: 1.5,
  thick: 3,
};

export const DIAGRAM_EDGE_STROKE_WIDTHS: Record<DiagramStrokeWidthPreset, number> = {
  thin: 1,
  regular: 2,
  thick: 3.5,
};

/** `medium` is the 11px both surfaces already used for node labels. */
export const DIAGRAM_FONT_SIZES: Record<DiagramFontSizePreset, number> = {
  small: 9,
  medium: 11,
  large: 14,
};

export const DIAGRAM_LEGACY_FONT_SIZE = DIAGRAM_FONT_SIZES.medium;

// Shape-derived fills predate v2 and are identical in the editor and the board
// card, so the fallback lives here rather than in either surface.
export const DIAGRAM_LEGACY_NODE_FILLS: Record<DiagramNodeShape, string> = {
  box: '#EEF2F4',
  container: '#FAFAFA',
  text: 'transparent',
  // Shapes introduced with the expanded palette default to the box appearance.
  rectangle: '#EEF2F4',
  ellipse: '#EEF2F4',
  triangle: '#EEF2F4',
  diamond: '#EEF2F4',
  cylinder: '#EEF2F4',
};

export const DIAGRAM_LEGACY_EDGE_STROKE = '#8CA4AC';

// A stored size is a bounded width/height pair. Both or neither: a lone
// dimension has no meaning and is rejected at the write boundary.
export const DIAGRAM_MIN_NODE_WIDTH = 56;
export const DIAGRAM_MIN_NODE_HEIGHT = 32;
export const DIAGRAM_MAX_NODE_WIDTH = 480;
export const DIAGRAM_MAX_NODE_HEIGHT = 320;

export type DiagramStyledNode = Pick<DiagramNode, 'shape' | 'width' | 'height'> &
  Partial<Pick<DiagramNode, 'fillColor' | 'strokeColor' | 'strokeWidthPreset' | 'fontSizePreset'>>;

export type DiagramStyledEdge = Partial<
  Pick<DiagramEdge, 'strokeColor' | 'strokeWidthPreset' | 'strokeStyle'>
>;

/** The node's stored size when it has one, otherwise its fixed shape size. */
export function effectiveDiagramNodeSize(
  node: Pick<DiagramNode, 'shape' | 'width' | 'height'>,
): DiagramNodeSize {
  if (typeof node.width === 'number' && typeof node.height === 'number') {
    return { width: node.width, height: node.height };
  }
  return diagramNodeSize(node.shape);
}

export function diagramNodeFill(node: DiagramStyledNode): string {
  if (node.fillColor) return DIAGRAM_FILL_COLORS[node.fillColor];
  return DIAGRAM_LEGACY_NODE_FILLS[node.shape ?? 'box'];
}

/**
 * `legacyStroke` is the caller's own pre-v2 border colour. The editor and the
 * board card drew unstyled nodes differently, so an unstyled node keeps whichever
 * one it always had rather than silently repainting old diagrams.
 */
export function diagramNodeStroke(node: DiagramStyledNode, legacyStroke: string): string {
  return node.strokeColor ? DIAGRAM_STROKE_COLORS[node.strokeColor] : legacyStroke;
}

export function diagramEdgeStroke(
  edge: DiagramStyledEdge,
  legacyStroke: string = DIAGRAM_LEGACY_EDGE_STROKE,
): string {
  return edge.strokeColor ? DIAGRAM_STROKE_COLORS[edge.strokeColor] : legacyStroke;
}

/** `legacyWidth` is the caller's own pre-v2 width, kept for unstyled nodes. */
export function diagramNodeStrokeWidth(node: DiagramStyledNode, legacyWidth: number): number {
  return node.strokeWidthPreset ? DIAGRAM_NODE_STROKE_WIDTHS[node.strokeWidthPreset] : legacyWidth;
}

export function diagramEdgeStrokeWidth(edge: DiagramStyledEdge, legacyWidth: number): number {
  return edge.strokeWidthPreset ? DIAGRAM_EDGE_STROKE_WIDTHS[edge.strokeWidthPreset] : legacyWidth;
}

export function diagramNodeFontSize(node: DiagramStyledNode): number {
  return node.fontSizePreset ? DIAGRAM_FONT_SIZES[node.fontSizePreset] : DIAGRAM_LEGACY_FONT_SIZE;
}

export interface DiagramEdgeDash {
  strokeDasharray?: string;
  strokeLinecap?: 'round';
}

/** Dash geometry scales with the stroke so a thick dotted arrow still reads as dots. */
export function diagramEdgeDash(edge: DiagramStyledEdge, strokeWidth: number): DiagramEdgeDash {
  switch (edge.strokeStyle) {
    case 'dashed':
      return { strokeDasharray: `${strokeWidth * 3} ${strokeWidth * 2}` };
    case 'dotted':
      return { strokeDasharray: `0.01 ${strokeWidth * 2.5}`, strokeLinecap: 'round' };
    default:
      return {};
  }
}

// Labels are laid out from a fixed glyph-advance ratio rather than measured:
// the board card renders inside a scaled viewBox and the editor inside another,
// and both must agree on the wrap without a DOM text-measuring pass.
const DIAGRAM_GLYPH_ADVANCE_RATIO = 0.55;
const DIAGRAM_LABEL_PADDING = 12;
export const DIAGRAM_LABEL_MAX_LINES = 3;

export function wrapDiagramLabel(
  label: string,
  width: number,
  fontSize: number,
  maxLines: number = DIAGRAM_LABEL_MAX_LINES,
): string[] {
  const usable = Math.max(1, width - DIAGRAM_LABEL_PADDING);
  const perLine = Math.max(1, Math.floor(usable / (fontSize * DIAGRAM_GLYPH_ADVANCE_RATIO)));
  const words = label.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= perLine) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    // A single word longer than the line is hard-broken rather than overflowing.
    let rest = word;
    while (rest.length > perLine) {
      lines.push(rest.slice(0, perLine));
      rest = rest.slice(perLine);
    }
    current = rest;
  }
  if (current) lines.push(current);

  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1]!;
  kept[maxLines - 1] = `${last.slice(0, Math.max(0, perLine - 1)).trimEnd()}\u2026`;
  return kept;
}

export interface DiagramLabelLayout {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  /** Baseline of the first line, in node-local coordinates. */
  firstBaselineY: number;
}

/**
 * One line lands on exactly the baseline pre-v2 diagrams used
 * (`height / 2 + 4` at 11px); extra lines are centred around it.
 */
export function diagramNodeLabelLayout(
  node: Pick<DiagramNode, 'label' | 'shape' | 'width' | 'height' | 'fontSizePreset'>,
): DiagramLabelLayout {
  const size = effectiveDiagramNodeSize(node);
  const fontSize = diagramNodeFontSize(node);
  const lineHeight = fontSize * 1.25;
  const maxLines = Math.max(
    1,
    Math.min(DIAGRAM_LABEL_MAX_LINES, Math.floor(size.height / lineHeight)),
  );
  // Tapered shapes are narrower than their box where the label sits.
  const usableWidth = size.width * diagramLabelWidthRatio(node.shape);
  const lines = wrapDiagramLabel(node.label, usableWidth, fontSize, maxLines);
  const centre = size.height / 2 + fontSize * (4 / DIAGRAM_LEGACY_FONT_SIZE);

  return {
    lines,
    fontSize,
    lineHeight,
    firstBaselineY: centre - ((lines.length - 1) * lineHeight) / 2,
  };
}

export interface DiagramEdgeGeometry {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  labelX: number;
  labelY: number;
}

export function diagramEdgeToPointGeometry(
  from: Pick<DiagramNode, 'x' | 'y' | 'shape' | 'width' | 'height'>,
  target: { x: number; y: number },
): DiagramEdgeGeometry {
  const fromSize = effectiveDiagramNodeSize(from);
  const fromCenter = { x: from.x + fromSize.width / 2, y: from.y + fromSize.height / 2 };
  const delta = { x: target.x - fromCenter.x, y: target.y - fromCenter.y };
  const scale = diagramBoundaryScale(from.shape, fromSize, delta);
  const x1 = fromCenter.x + delta.x * scale;
  const y1 = fromCenter.y + delta.y * scale;

  return {
    x1,
    y1,
    x2: target.x,
    y2: target.y,
    labelX: (x1 + target.x) / 2,
    labelY: (y1 + target.y) / 2 - 8,
  };
}

export interface DiagramEdgeRoute extends DiagramEdgeGeometry {
  /** Path data for the arrow: a line when straight, a quadratic when bent. */
  path: string;
  /** Signed sideways offset of the control point; 0 when the arrow is straight. */
  bend: number;
}

// A bent arrow bows out by this fraction of the centre-to-centre distance,
// capped so a long reciprocal pair does not swing across the sheet.
export const DIAGRAM_RECIPROCAL_BEND_RATIO = 0.16;
export const DIAGRAM_MAX_BEND = 44;

type DiagramNodeGeometry = Pick<DiagramNode, 'x' | 'y' | 'shape' | 'width' | 'height'>;

function nodeCentre(node: DiagramNodeGeometry, size: DiagramNodeSize) {
  return { x: node.x + size.width / 2, y: node.y + size.height / 2 };
}

/**
 * One arrow's geometry. `bend` of 0 gives the straight route the diagram has
 * always drawn; a non-zero bend bows the arrow to one side so a reciprocal pair
 * stays two readable paths instead of one line drawn over itself.
 *
 * Both endpoints are anchored towards the control point, so a bent arrow still
 * leaves and arrives perpendicular to the outline it touches.
 */
export function diagramEdgeRoute(
  from: DiagramNodeGeometry,
  to: DiagramNodeGeometry,
  bend = 0,
): DiagramEdgeRoute {
  const fromSize = effectiveDiagramNodeSize(from);
  const toSize = effectiveDiagramNodeSize(to);
  const fromCentre = nodeCentre(from, fromSize);
  const toCentre = nodeCentre(to, toSize);
  const delta = { x: toCentre.x - fromCentre.x, y: toCentre.y - fromCentre.y };

  if (delta.x === 0 && delta.y === 0) {
    const x1 = from.x + fromSize.width;
    const y1 = fromCentre.y;
    return {
      x1,
      y1,
      x2: to.x,
      y2: toCentre.y,
      labelX: fromCentre.x,
      labelY: fromCentre.y - 8,
      path: `M${x1},${y1} L${to.x},${toCentre.y}`,
      bend: 0,
    };
  }

  const distance = Math.hypot(delta.x, delta.y);
  const offset = bend * Math.min(DIAGRAM_MAX_BEND, distance * DIAGRAM_RECIPROCAL_BEND_RATIO);
  const control = {
    x: (fromCentre.x + toCentre.x) / 2 - (delta.y / distance) * offset,
    y: (fromCentre.y + toCentre.y) / 2 + (delta.x / distance) * offset,
  };

  // Each anchor is found along the direction that endpoint actually leaves in.
  // Taking the destination's boundary along `+delta` would be wrong for any
  // shape that is not centrally symmetric, such as the triangle.
  const fromDirection = { x: control.x - fromCentre.x, y: control.y - fromCentre.y };
  const toDirection = { x: control.x - toCentre.x, y: control.y - toCentre.y };
  const fromScale = diagramBoundaryScale(from.shape, fromSize, fromDirection);
  const toScale = diagramBoundaryScale(to.shape, toSize, toDirection);

  const x1 = fromCentre.x + fromDirection.x * fromScale;
  const y1 = fromCentre.y + fromDirection.y * fromScale;
  const x2 = toCentre.x + toDirection.x * toScale;
  const y2 = toCentre.y + toDirection.y * toScale;

  if (offset === 0) {
    return {
      x1,
      y1,
      x2,
      y2,
      labelX: (x1 + x2) / 2,
      labelY: (y1 + y2) / 2 - 8,
      path: `M${x1},${y1} L${x2},${y2}`,
      bend: 0,
    };
  }

  return {
    x1,
    y1,
    x2,
    y2,
    // Midpoint of the quadratic, so the label rides the curve it belongs to.
    labelX: 0.25 * x1 + 0.5 * control.x + 0.25 * x2,
    labelY: 0.25 * y1 + 0.5 * control.y + 0.25 * y2 - 8,
    path: `M${x1},${y1} Q${control.x},${control.y} ${x2},${y2}`,
    bend: offset,
  };
}

export function diagramEdgeGeometry(
  from: DiagramNodeGeometry,
  to: DiagramNodeGeometry,
): DiagramEdgeGeometry {
  return diagramEdgeRoute(from, to, 0);
}

/**
 * Routes for a whole diagram, index-aligned with `edges`. An entry is null when
 * an endpoint is missing, which legacy artifacts are allowed to contain.
 *
 * A pair of arrows that point at each other is bowed apart in opposite
 * directions; which way each one goes is decided by endpoint id, so the result
 * does not depend on the order the edges happen to sit in the array.
 */
export function diagramEdgeRoutes(
  nodes: readonly DiagramNode[],
  edges: readonly DiagramEdge[],
): (DiagramEdgeRoute | null)[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const directed = new Set(edges.map((edge) => `${edge.from}\u0000${edge.to}`));

  return edges.map((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) return null;

    const reciprocal = directed.has(`${edge.to}\u0000${edge.from}`);
    // Both halves of a pair bend by the same amount: the control point is offset
    // perpendicular to each arrow's own direction, and those directions are
    // opposite, so the two curves separate on their own. Choosing a sign per
    // endpoint here would cancel that out and stack them on the same side.
    return diagramEdgeRoute(from, to, reciprocal ? 1 : 0);
  });
}

export interface DiagramNode {
  id: string;
  label: string;
  x: number;
  y: number;
  shape?: DiagramNodeShape;
  /**
   * Semantic grouping: the container this node belongs to. Only container-shaped
   * nodes may parent, and the graph of parents must stay acyclic — both are
   * enforced at the write boundary, not just in the editor.
   */
  parentId?: string;
  /** Bounded stored size. Present only as a pair; absent means the shape's fixed size. */
  width?: number;
  height?: number;
  fillColor?: DiagramFillKey;
  strokeColor?: DiagramStrokeKey;
  strokeWidthPreset?: DiagramStrokeWidthPreset;
  fontSizePreset?: DiagramFontSizePreset;
}

export type DiagramParentedNode = Pick<DiagramNode, 'id' | 'parentId'>;

/** Every node transitively parented by `id`, nearest first. */
export function diagramDescendantIds(nodes: readonly DiagramParentedNode[], id: string): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const siblings = childrenByParent.get(node.parentId);
    if (siblings) siblings.push(node.id);
    else childrenByParent.set(node.parentId, [node.id]);
  }

  const found: string[] = [];
  const seen = new Set<string>([id]);
  const queue = [id];
  while (queue.length > 0) {
    for (const child of childrenByParent.get(queue.shift()!) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      found.push(child);
      queue.push(child);
    }
  }
  return found;
}

/** How deeply nested a node is; 0 for a top-level node. Cycles report 0. */
export function diagramNodeDepth(nodes: readonly DiagramParentedNode[], id: string): number {
  const parents = new Map(nodes.map((node) => [node.id, node.parentId]));
  const seen = new Set<string>();
  let depth = 0;
  let current = parents.get(id);
  while (current && !seen.has(current)) {
    seen.add(current);
    depth += 1;
    current = parents.get(current);
  }
  return depth;
}

/**
 * Painter's order: shallower nodes first, so a container is always drawn behind
 * everything it holds. Ties keep their authored order.
 */
export function diagramNodesInDrawOrder<T extends DiagramParentedNode>(nodes: readonly T[]): T[] {
  // The parent lookup is built once: this runs on every render of both the
  // editor canvas and the board card.
  const parents = new Map(nodes.map((node) => [node.id, node.parentId]));
  const depthOf = (id: string): number => {
    const seen = new Set<string>();
    let depth = 0;
    let current = parents.get(id);
    while (current && !seen.has(current)) {
      seen.add(current);
      depth += 1;
      current = parents.get(current);
    }
    return depth;
  };

  return nodes
    .map((node, index) => ({ node, index, depth: depthOf(node.id) }))
    .sort((a, b) => a.depth - b.depth || a.index - b.index)
    .map((entry) => entry.node);
}

/** True when `ancestorId` is `id` itself or sits above it in the parent chain. */
export function diagramIsAncestor(
  nodes: readonly DiagramParentedNode[],
  ancestorId: string,
  id: string,
): boolean {
  if (ancestorId === id) return true;
  const parents = new Map(nodes.map((node) => [node.id, node.parentId]));
  const seen = new Set<string>();
  let current = parents.get(id);
  while (current && !seen.has(current)) {
    if (current === ancestorId) return true;
    seen.add(current);
    current = parents.get(current);
  }
  return false;
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
  strokeColor?: DiagramStrokeKey;
  strokeWidthPreset?: DiagramStrokeWidthPreset;
  strokeStyle?: DiagramStrokeStyle;
}

export interface DiagramArtifact {
  type: 'diagram';
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}
