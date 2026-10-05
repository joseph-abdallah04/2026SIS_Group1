import { Resvg } from '@resvg/resvg-js';
import {
  DRAWING_VIEWBOX_HEIGHT,
  DRAWING_VIEWBOX_WIDTH,
  diagramExtent,
  isEmptyStudioScene,
  isStorableImage,
  type BoardItem,
} from '@roundtable/shared';

import { studioSceneMarkup, xml } from './studioSceneSvg.js';

const CARD_W = 900;
const PAD = 28;
const FOOTER_H = 48;
const MIN_ART_H = 360;
/**
 * Ceiling on the art area, and so on the raster this produces.
 *
 * The art height is derived from stored geometry, which is member-authored
 * input: a drawing carries its own `viewBox` and a diagram node's `x`/`y` have
 * no bounds in `diagramNodeSchema`. Without a ceiling, one proposal with a
 * coordinate of 1e9 would ask resvg for a raster a billion pixels tall the
 * next time anyone downloads the recap. Clamping only letterboxes the art —
 * both inner `<svg>`s scale with `xMidYMid meet` — so a legitimate tall
 * drawing is shown smaller rather than cropped.
 */
const MAX_ART_H = 1600;

/** Art height for content of the given aspect, bounded at both ends. */
function artHeight(artW: number, contentW: number, contentH: number): number {
  const scaled = Math.round(artW * (contentH / contentW));
  if (!Number.isFinite(scaled)) return MIN_ART_H;
  return Math.min(MAX_ART_H, Math.max(MIN_ART_H, scaled));
}
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

/**
 * How a card is framed: the gold winner ring, the tie ring, or — for a
 * brainstorm question's ideas (F41), where nothing won — a plain card border.
 */
export type FeaturedKind = 'winner' | 'tied' | 'idea';

export interface ProposalPreviewPng {
  png: Buffer;
  width: number;
  height: number;
}

function ring(kind: FeaturedKind): string {
  if (kind === 'idea') return CARD_BORDER;
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
    .map((line, index) => `<tspan x="${PAD}" y="${textTop + index * lineH}">${xml(line)}</tspan>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${height}">
    ${cardShell(height, paper, kind)}
    <text font-family="Helvetica, Arial, sans-serif" font-size="28" font-weight="600" fill="${INK}">${tspans}</text>
    ${footer(item.authorName, height - 20)}
  </svg>`;
}

interface DrawingInner {
  markup: string;
  minX: number;
  minY: number;
  viewW: number;
  viewH: number;
}

/**
 * Pull the drawable body and the coordinate system out of a stored drawing.
 *
 * The stripping below is tidying, not sanitising — a regex cannot reliably
 * remove behaviour from markup. What makes embedding a member's SVG safe here
 * is the renderer: resvg is a static rasterizer with no script engine and no
 * HTTP client, and the result only ever leaves as a PNG inside a PDF, never
 * as SVG a browser would execute. Anything it cannot parse throws, and
 * `writeQuestion` falls back to a caption. Do not treat these `replace` calls
 * as a security boundary or extend them as if they were one.
 */
function drawingInner(svg: string): DrawingInner {
  const cleaned = svg
    .trim()
    .replace(/<\?xml[^>]*>/i, '')
    .replace(/<!DOCTYPE[^>]*>/i, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '');
  const view = /viewBox="([^"]+)"/i.exec(cleaned);
  let minX = 0;
  let minY = 0;
  let viewW = DRAWING_VIEWBOX_WIDTH;
  let viewH = DRAWING_VIEWBOX_HEIGHT;
  if (view?.[1]) {
    const parts = view[1]
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    // Only the extents have to be positive; an origin of 0 is the normal case,
    // which is why this checks what each number means rather than all four
    // being non-zero.
    if (
      parts.length === 4 &&
      parts.every((n) => Number.isFinite(n)) &&
      parts[2]! > 0 &&
      parts[3]! > 0
    ) {
      minX = parts[0]!;
      minY = parts[1]!;
      viewW = parts[2]!;
      viewH = parts[3]!;
    }
  }
  const inner = /<svg\b[^>]*>([\s\S]*)<\/svg>/i.exec(cleaned);
  return { markup: inner?.[1] ?? cleaned, minX, minY, viewW, viewH };
}

function drawingSvg(item: BoardItem, kind: FeaturedKind): string {
  if (item.artifactJson.type !== 'drawing') return '';
  const artW = CARD_W - PAD * 2;
  const { markup, minX, minY, viewW, viewH } = drawingInner(item.artifactJson.svg);
  const artH = artHeight(artW, viewW, viewH);
  const height = PAD + artH + FOOTER_H + 12;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${height}">
    ${cardShell(height, WHITE, kind)}
    <rect x="${PAD}" y="${PAD}" width="${artW}" height="${artH}" rx="12" fill="${ART_BG}"/>
    <svg x="${PAD}" y="${PAD}" width="${artW}" height="${artH}" viewBox="${minX} ${minY} ${viewW} ${viewH}" preserveAspectRatio="xMidYMid meet" fill="none">${markup}</svg>
    ${footer(item.authorName, height - 18)}
  </svg>`;
}

/**
 * An imported picture, painted into the card above the byline — the same shape
 * as a drawing's card, since that is all a picture proposal is.
 *
 * The picture goes in as it is stored, a data URL: resvg decodes it the same way
 * a browser would. It is only embedded once it has passed the same check the
 * board makes before drawing it, so a row that somehow holds anything else
 * gives an empty plate rather than handing resvg a reference to follow.
 * Escaped all the same, although the check admits only the base64 alphabet:
 * the attribute stays closed even if that check is ever widened.
 */
function imageSvg(item: BoardItem, kind: FeaturedKind): string {
  if (item.artifactJson.type !== 'image') return '';
  const { src, width, height: imageH } = item.artifactJson;
  const artW = CARD_W - PAD * 2;
  const artH = artHeight(artW, Math.max(1, width), Math.max(1, imageH));
  const height = PAD + artH + FOOTER_H + 12;
  const picture = isStorableImage(src)
    ? `<image x="${PAD}" y="${PAD}" width="${artW}" height="${artH}" href="${xml(src)}" preserveAspectRatio="xMidYMid meet"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${height}">
    ${cardShell(height, WHITE, kind)}
    <rect x="${PAD}" y="${PAD}" width="${artW}" height="${artH}" rx="12" fill="${ART_BG}"/>
    ${picture}
    ${footer(item.authorName, height - 18)}
  </svg>`;
}

/**
 * A studio canvas on its card. The canvas is drawn by `studioSceneMarkup`, in
 * the same frame the board card gives it (`diagramExtent`), so a winner in the
 * recap looks like the card everyone voted on — sketches, tables and arrows
 * included.
 */
function diagramSvg(item: BoardItem, kind: FeaturedKind): string {
  if (item.artifactJson.type !== 'diagram') return '';
  const scene = item.artifactJson;
  const artW = CARD_W - PAD * 2;
  if (isEmptyStudioScene(scene)) {
    const height = PAD + 280 + FOOTER_H;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${height}">
      ${cardShell(height, WHITE, kind)}
      <rect x="${PAD}" y="${PAD}" width="${artW}" height="280" rx="12" fill="${ART_BG}" stroke="${CARD_BORDER}" stroke-dasharray="6 4"/>
      ${footer(item.authorName, height - 18)}
    </svg>`;
  }

  const extent = diagramExtent(scene);
  const artH = artHeight(artW, extent.width, extent.height);
  const height = PAD + artH + FOOTER_H + 12;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${height}">
    ${cardShell(height, WHITE, kind)}
    <rect x="${PAD}" y="${PAD}" width="${artW}" height="${artH}" rx="12" fill="${ART_BG}"/>
    <svg x="${PAD}" y="${PAD}" width="${artW}" height="${artH}" viewBox="${extent.x} ${extent.y} ${extent.width} ${extent.height}" preserveAspectRatio="xMidYMid meet">
      ${studioSceneMarkup(scene, item.id)}
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
    case 'image':
      return imageSvg(item, kind);
  }
}

/** Paint a board card to PNG so the recap PDF can show the proposal, not a caption. */
export function rasterizeProposalPreview(item: BoardItem, kind: FeaturedKind): ProposalPreviewPng {
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
