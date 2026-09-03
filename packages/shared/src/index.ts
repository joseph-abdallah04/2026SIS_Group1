// Shared domain types — concrete, no `any`. See docs/02-architecture.md §3.
export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
}

export type SessionStatus = 'lobby' | 'active' | 'ended';

export interface Session {
  id: string;
  code: string;
  title: string;
  leaderId: string;
  status: SessionStatus;
  createdAt: Date;
  endedAt: Date | null;
}

// === auth module ===

// === sessions module ===

// Per-question progression through discussion → voting → answered, or skipped.
// This is the canonical name/value list (docs/06 Coordination Point 2) —
// import this rather than hand-typing the union; Prisma's QuestionStatus enum
// is kept in sync with it via a compile-time check in apps/server.
export type QuestionStatus = 'pending' | 'discussion' | 'voting' | 'answered' | 'skipped';

export interface Question {
  id: string;
  sessionId: string;
  text: string;
  position: number;
  status: QuestionStatus;
  createdAt: Date;
}

export interface SessionMember {
  sessionId: string;
  userId: string;
  joinedAt: Date;
}

// === pinboard module ===

export type ProposalType = 'sticky' | 'drawing' | 'diagram';

export type StickyColor = 'yellow' | 'pink' | 'blue' | 'green';

export interface StickyArtifact {
  type: 'sticky';
  text: string;
  color: StickyColor;
}

export interface DrawingArtifact {
  type: 'drawing';
  svg: string;
}

export type DiagramNodeShape = 'box' | 'container' | 'text';

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
    default:
      return { width: 72, height: 32 };
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
  const lines = wrapDiagramLabel(node.label, size.width, fontSize, maxLines);
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
  const scale =
    delta.x === 0 && delta.y === 0
      ? 0
      : 1 /
        Math.max(
          Math.abs(delta.x) / (fromSize.width / 2),
          Math.abs(delta.y) / (fromSize.height / 2),
        );
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

export function diagramEdgeGeometry(
  from: Pick<DiagramNode, 'x' | 'y' | 'shape' | 'width' | 'height'>,
  to: Pick<DiagramNode, 'x' | 'y' | 'shape' | 'width' | 'height'>,
): DiagramEdgeGeometry {
  const fromSize = effectiveDiagramNodeSize(from);
  const toSize = effectiveDiagramNodeSize(to);
  const fromCenter = { x: from.x + fromSize.width / 2, y: from.y + fromSize.height / 2 };
  const toCenter = { x: to.x + toSize.width / 2, y: to.y + toSize.height / 2 };
  const delta = { x: toCenter.x - fromCenter.x, y: toCenter.y - fromCenter.y };

  if (delta.x === 0 && delta.y === 0) {
    return {
      x1: from.x + fromSize.width,
      y1: fromCenter.y,
      x2: to.x,
      y2: toCenter.y,
      labelX: fromCenter.x,
      labelY: fromCenter.y - 8,
    };
  }

  const fromScale =
    1 /
    Math.max(Math.abs(delta.x) / (fromSize.width / 2), Math.abs(delta.y) / (fromSize.height / 2));
  const toScale =
    1 / Math.max(Math.abs(delta.x) / (toSize.width / 2), Math.abs(delta.y) / (toSize.height / 2));
  const x1 = fromCenter.x + delta.x * fromScale;
  const y1 = fromCenter.y + delta.y * fromScale;
  const x2 = toCenter.x - delta.x * toScale;
  const y2 = toCenter.y - delta.y * toScale;

  return {
    x1,
    y1,
    x2,
    y2,
    labelX: (x1 + x2) / 2,
    labelY: (y1 + y2) / 2 - 8,
  };
}

export interface DiagramNode {
  id: string;
  label: string;
  x: number;
  y: number;
  shape?: DiagramNodeShape;
  /** Bounded stored size. Present only as a pair; absent means the shape's fixed size. */
  width?: number;
  height?: number;
  fillColor?: DiagramFillKey;
  strokeColor?: DiagramStrokeKey;
  strokeWidthPreset?: DiagramStrokeWidthPreset;
  fontSizePreset?: DiagramFontSizePreset;
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

export type ArtifactJson = StickyArtifact | DrawingArtifact | DiagramArtifact;

/** API shape for a pinboard item returned by GET /api/sessions/:id/proposals */
export interface BoardItem {
  id: string;
  questionId: string;
  authorId: string;
  authorName: string;
  type: ProposalType;
  artifactJson: ArtifactJson;
  x: number;
  y: number;
  createdAt: string;
  extendsProposalId: string | null;
}

/**
 * The single order every participant's board uses (F14: "identical boards in
 * identical order") — creation time, then id to break same-millisecond ties.
 *
 * The server sorts with the equivalent Prisma `orderBy`; the client re-applies
 * it when a live event inserts an item into an already-loaded board, so both
 * paths cannot drift. `createdAt` is a fixed-width UTC ISO-8601 string, so
 * lexicographic comparison is chronological.
 */
export function compareBoardItems(a: BoardItem, b: BoardItem): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

export interface BoardResponse {
  sessionId: string;
  sessionTitle: string;
  questionId: string | null;
  questionText: string | null;
  questionPosition: number | null;
  questionStatus: QuestionStatus | null;
  items: BoardItem[];
}

// === voting module ===

// === summary module ===

// === voice module ===

// === assistant module ===
