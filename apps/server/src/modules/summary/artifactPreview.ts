import { Resvg } from '@resvg/resvg-js';
import {
  DIAGRAM_LABEL_INK,
  DRAWING_VIEWBOX_HEIGHT,
  DRAWING_VIEWBOX_WIDTH,
  diagramCylinderCapHeight,
  diagramEdgeDash,
  diagramEdgeRoutes,
  diagramEdgeStroke,
  diagramEdgeStrokeWidth,
  diagramNodeFill,
  diagramNodeLabelLayout,
  diagramNodeStroke,
  diagramNodeStrokeWidth,
  diagramNodesInDrawOrder,
  effectiveDiagramNodeSize,
  type BoardItem,
  type DiagramNodeShape,
  type DiagramNodeSize,
} from '@roundtable/shared';

const CARD_W = 900;
const PAD = 28;
const FOOTER_H = 48;
const ART_BG = '#F7F7F8';
const INK = '#080C15';
const MUTED = '#5A5F68';
const WHITE = '#FFFFFF';
const WINNER_RING = '#E0A33C';
const TIED_RING = '#8CA4AC';
const CARD_BORDER = '#CFCFCF';

const STICKY_PAPER: Record<string, string> = {
  yellow: '#FDF4E5',
  pink: '#F9EEF2',
  blue: '#EEF2F4',
  green: '#EEF4F0',
};

export type FeaturedKind = 'winner' | 'tied';

export interface ProposalPreviewPng {
  png: Buffer;
  width: number;
  height: number;
}

function xml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function ring(kind: FeaturedKind): string {
  return kind === 'winner' ? WINNER_RING : TIED_RING;
}

function wrapLines(text: string, charsPerLine: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['Empty sticky'];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current.length === 0 ? word : `${current} ${word}`;
    if (next.length <= charsPerLine) {
      current = next;
      continue;
    }
    if (current.length > 0) lines.push(current);
    current = word;
    if (lines.length === maxLines - 1) break;
  }
  if (current.length > 0 && lines.length < maxLines) lines.push(current);
  if (words.join(' ').length > lines.join(' ').length) {
    const last = lines[lines.length - 1] ?? '';
    lines[lines.length - 1] = `${last.slice(0, Math.max(0, charsPerLine - 1)).trimEnd()}…`;
  }
  return lines;
}

function footer(authorName: string, y: number): string {
  return `<text x="${PAD}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="${MUTED}">${xml(authorName)}</text>`;
}

function cardShell(height: number, fill: string, kind: FeaturedKind): string {
  return `<rect width="${CARD_W}" height="${height}" rx="18" fill="${fill}" stroke="${ring(kind)}" stroke-width="6"/>`;
}

function stickySvg(item: BoardItem, kind: FeaturedKind): string {
  if (item.artifactJson.type !== 'sticky') return '';
  const paper = STICKY_PAPER[item.artifactJson.color] ?? STICKY_PAPER.yellow!;
  const lines = wrapLines(item.artifactJson.text, 42, 16);
  const lineH = 36;
  const textTop = 72;
  const height = Math.max(420, textTop + lines.length * lineH + FOOTER_H + 16);
  const tspans = lines
    .map(
      (line, index) =>
        `<tspan x="${PAD}" y="${textTop + index * lineH}">${xml(line)}</tspan>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${height}">
    ${cardShell(height, paper, kind)}
    <text font-family="Helvetica, Arial, sans-serif" font-size="28" font-weight="600" fill="${INK}">${tspans}</text>
    ${footer(item.authorName, height - 20)}
  </svg>`;
}

function drawingInner(svg: string): { markup: string; viewW: number; viewH: number } {
  const cleaned = svg
    .trim()
    .replace(/<\?xml[^>]*>/i, '')
    .replace(/<!DOCTYPE[^>]*>/i, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '');
  const view = /viewBox="([^"]+)"/i.exec(cleaned);
  let viewW = DRAWING_VIEWBOX_WIDTH;
  let viewH = DRAWING_VIEWBOX_HEIGHT;
  if (view?.[1]) {
    const parts = view[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n) && n !== 0)) {
      viewW = parts[2]!;
      viewH = parts[3]!;
    }
  }
  const inner = /<svg\b[^>]*>([\s\S]*)<\/svg>/i.exec(cleaned);
  return { markup: inner?.[1] ?? cleaned, viewW, viewH };
}

function drawingSvg(item: BoardItem, kind: FeaturedKind): string {
  if (item.artifactJson.type !== 'drawing') return '';
  const artW = CARD_W - PAD * 2;
  const { markup, viewW, viewH } = drawingInner(item.artifactJson.svg);
  const artH = Math.max(360, Math.round(artW * (viewH / viewW)));
  const height = PAD + artH + FOOTER_H + 12;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${height}">
    ${cardShell(height, WHITE, kind)}
    <rect x="${PAD}" y="${PAD}" width="${artW}" height="${artH}" rx="12" fill="${ART_BG}"/>
    <svg x="${PAD}" y="${PAD}" width="${artW}" height="${artH}" viewBox="0 0 ${viewW} ${viewH}" preserveAspectRatio="xMidYMid meet" fill="none">${markup}</svg>
    ${footer(item.authorName, height - 18)}
  </svg>`;
}

function shapeMarkup(
  shape: DiagramNodeShape,
  size: DiagramNodeSize,
  fill: string,
  stroke: string,
  strokeWidth: number,
): string {
  const { width, height } = size;
  const common = `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"`;
  switch (shape) {
    case 'ellipse':
      return `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}" ${common}/>`;
    case 'diamond':
      return `<path d="M${width / 2},0 L${width},${height / 2} L${width / 2},${height} L0,${height / 2} Z" ${common}/>`;
    case 'triangle':
      return `<path d="M${width / 2},0 L${width},${height} L0,${height} Z" ${common}/>`;
    case 'cylinder': {
      const cap = diagramCylinderCapHeight(height);
      return `<path d="M0,${cap} A${width / 2},${cap} 0 0 1 ${width},${cap} L${width},${height - cap} A${width / 2},${cap} 0 0 1 0,${height - cap} Z" ${common}/><path d="M0,${cap} A${width / 2},${cap} 0 0 0 ${width},${cap}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
    }
    case 'rectangle':
      return `<rect width="${width}" height="${height}" ${common}/>`;
    case 'container':
      return `<rect width="${width}" height="${height}" rx="3" ${common} stroke-dasharray="4 3"/>`;
    case 'text':
      return `<rect width="${width}" height="${height}" fill="${fill}"/>`;
    default:
      return `<rect width="${width}" height="${height}" rx="8" ${common}/>`;
  }
}

function diagramSvg(item: BoardItem, kind: FeaturedKind): string {
  if (item.artifactJson.type !== 'diagram') return '';
  const { nodes, edges } = item.artifactJson;
  const artW = CARD_W - PAD * 2;
  if (nodes.length === 0) {
    const height = PAD + 280 + FOOTER_H;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${height}">
      ${cardShell(height, WHITE, kind)}
      <rect x="${PAD}" y="${PAD}" width="${artW}" height="280" rx="12" fill="${ART_BG}" stroke="${CARD_BORDER}" stroke-dasharray="6 4"/>
      ${footer(item.authorName, height - 18)}
    </svg>`;
  }

  const svgWidth =
    Math.max(...nodes.map((node) => node.x + effectiveDiagramNodeSize(node).width), 72) + 28;
  const svgHeight =
    Math.max(...nodes.map((node) => node.y + effectiveDiagramNodeSize(node).height), 32) + 24;
  const artH = Math.max(360, Math.round(artW * (svgHeight / svgWidth)));
  const height = PAD + artH + FOOTER_H + 12;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edgeRoutes = diagramEdgeRoutes(nodes, edges);
  const arrowId = (color: string) => `rt-pdf-arrow-${item.id}-${color.replace('#', '')}`;
  const arrowColors = [...new Set(edges.map((edge) => diagramEdgeStroke(edge)))];
  const markers = arrowColors
    .map(
      (color) =>
        `<marker id="${arrowId(color)}" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L6,3 L0,6 Z" fill="${color}"/></marker>`,
    )
    .join('');

  const edgeMarkup = edges
    .map((edge, index) => {
      const from = nodeById.get(edge.from);
      const to = nodeById.get(edge.to);
      const route = edgeRoutes[index];
      if (!from || !to || !route) return '';
      const stroke = diagramEdgeStroke(edge);
      const strokeWidth = diagramEdgeStrokeWidth(edge, 1.5);
      const dash = diagramEdgeDash(edge, strokeWidth);
      const dashAttr = dash.strokeDasharray ? ` stroke-dasharray="${dash.strokeDasharray}"` : '';
      const capAttr = dash.strokeLinecap ? ` stroke-linecap="${dash.strokeLinecap}"` : '';
      const label = edge.label
        ? `<text x="${route.labelX}" y="${route.labelY}" text-anchor="middle" fill="#5A5F68" stroke="#F7F7F8" stroke-width="3" paint-order="stroke" font-size="9" font-family="Helvetica, Arial, sans-serif">${xml(edge.label)}</text>`
        : '';
      return `<path d="${xml(route.path)}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" marker-end="url(#${arrowId(stroke)})"${dashAttr}${capAttr}/>${label}`;
    })
    .join('');

  const nodeMarkup = diagramNodesInDrawOrder(nodes)
    .map((node) => {
      const shape = node.shape ?? 'box';
      const size = effectiveDiagramNodeSize(node);
      const label = diagramNodeLabelLayout(node);
      const fill = shape === 'text' && !node.fillColor ? 'transparent' : diagramNodeFill(node);
      const tspans = label.lines
        .map(
          (line, lineIndex) =>
            `<tspan x="${size.width / 2}" y="${label.firstBaselineY + lineIndex * label.lineHeight}">${xml(line)}</tspan>`,
        )
        .join('');
      return `<g transform="translate(${node.x}, ${node.y})">${shapeMarkup(shape, size, fill, diagramNodeStroke(node, '#8CA4AC'), diagramNodeStrokeWidth(node, 1))}<text text-anchor="middle" fill="${DIAGRAM_LABEL_INK}" font-size="${label.fontSize}" font-family="Helvetica, Arial, sans-serif" font-weight="${shape === 'text' ? 600 : 400}">${tspans}</text></g>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${height}">
    ${cardShell(height, WHITE, kind)}
    <rect x="${PAD}" y="${PAD}" width="${artW}" height="${artH}" rx="12" fill="${ART_BG}"/>
    <svg x="${PAD}" y="${PAD}" width="${artW}" height="${artH}" viewBox="0 0 ${svgWidth} ${svgHeight}">
      <defs>${markers}</defs>
      ${edgeMarkup}
      ${nodeMarkup}
    </svg>
    ${footer(item.authorName, height - 18)}
  </svg>`;
}

function proposalCardSvg(item: BoardItem, kind: FeaturedKind): string {
  switch (item.artifactJson.type) {
    case 'sticky':
      return stickySvg(item, kind);
    case 'drawing':
      return drawingSvg(item, kind);
    case 'diagram':
      return diagramSvg(item, kind);
  }
}

/** Paint a board card to PNG so the recap PDF can show the proposal, not a caption. */
export function rasterizeProposalPreview(
  item: BoardItem,
  kind: FeaturedKind,
): ProposalPreviewPng {
  const svg = proposalCardSvg(item, kind);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1400 },
    font: { loadSystemFonts: true },
  });
  const rendered = resvg.render();
  return {
    png: Buffer.from(rendered.asPng()),
    width: rendered.width,
    height: rendered.height,
  };
}
