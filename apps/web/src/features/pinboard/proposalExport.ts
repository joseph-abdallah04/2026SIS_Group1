// Taking a card's artwork off the board as a file.
//
// A studio canvas leaves as a PNG or as an SVG, an imported picture as exactly
// the file that was stored, and an old-style drawing as a PNG. A sticky has no
// artwork to export: Copy text already takes everything on it.
//
// What leaves is the artwork alone — no byline, no card — cropped to what is on
// the canvas with a margin, on white. That is what goes into a slide or a
// document, where the card's frame would only be in the way.

import { createElement, useCallback, useEffect, useRef } from 'react';
import { FileCode2, ImageDown } from 'lucide-react';
import {
  DRAWING_VIEWBOX_HEIGHT,
  DRAWING_VIEWBOX_WIDTH,
  studioSceneBounds,
  type BoardItem,
  type StudioScene,
} from '@roundtable/shared';
import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff2?url';
import inter500 from '@fontsource/inter/files/inter-latin-500-normal.woff2?url';
import inter600 from '@fontsource/inter/files/inter-latin-600-normal.woff2?url';
import inter700 from '@fontsource/inter/files/inter-latin-700-normal.woff2?url';

import { saveBlob } from '../../lib/saveBlob';
import { canShowImage } from '../tools/image/canShowImage';
import { StudioSceneContent } from '../tools/studio/StudioArtwork';
import { hasArtwork } from './hasArtwork';
import type { ProposalMenuItem } from './ProposalActionsMenu';

/** `original` is an imported picture's own file, in whatever format it was stored. */
export type ExportFormat = 'png' | 'svg' | 'original';

/** What a notice calls the thing exported. */
export const PROPOSAL_KIND_LABEL: Record<BoardItem['type'], string> = {
  sticky: 'sticky note',
  drawing: 'drawing',
  diagram: 'diagram',
  image: 'image',
};

/** The room left around a canvas's content, in canvas units. */
const MARGIN = 24;
/** How much finer than the canvas a PNG is drawn: sharp on a slide or a retina screen. */
const PNG_SCALE = 3;
/**
 * The longest edge a PNG may have. Large enough for a full-screen slide twice
 * over, and inside the canvas size every browser can allocate.
 */
const PNG_MAX_EDGE = 4096;
const BACKGROUND = '#FFFFFF';
const SVG_NS = 'http://www.w3.org/2000/svg';

/** The formats a card can be exported in, most useful first. Empty when it has none. */
export function exportFormats(item: BoardItem): ExportFormat[] {
  const artifact = item.artifactJson;
  if (!hasArtwork(item)) return [];
  if (artifact.type === 'diagram') return ['png', 'svg'];
  if (artifact.type === 'image') return ['original'];
  // A peer's own SVG is never handed out as a file: opened on its own, any
  // script it carries would run. Drawn to a PNG, it is only pixels.
  if (artifact.type === 'drawing') return ['png'];
  return [];
}

export function exportLabel(format: ExportFormat): string {
  if (format === 'png') return 'Export as PNG';
  if (format === 'svg') return 'Export as SVG';
  return 'Export image';
}

/** What a notice says once a card has been exported. */
export function exportedMessage(item: BoardItem, format: ExportFormat): string {
  if (format === 'original') return `Exported ${PROPOSAL_KIND_LABEL[item.type]}`;
  return `Exported ${PROPOSAL_KIND_LABEL[item.type]} as ${format.toUpperCase()}`;
}

export function exportFailedMessage(item: BoardItem): string {
  return `Could not export that ${PROPOSAL_KIND_LABEL[item.type]}`;
}

/**
 * A name a file can be saved under: `roundtable-diagram-ada-lovelace-14-32.png`.
 *
 * The author and the time it was proposed, which is how the board itself tells
 * two cards apart. Kept to plain ASCII so it survives every file system and
 * every mail client it is sent through.
 */
export function exportFileName(item: BoardItem, extension: string): string {
  const author =
    item.authorName
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/, '') || 'proposal';
  const at = new Date(item.createdAt);
  const time = Number.isNaN(at.getTime())
    ? ''
    : `-${String(at.getHours()).padStart(2, '0')}-${String(at.getMinutes()).padStart(2, '0')}`;
  return `roundtable-${item.type}-${author}${time}.${extension}`;
}

const INTER_FILES: Record<number, string> = {
  400: inter400,
  500: inter500,
  600: inter600,
  700: inter700,
};

function blobBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the font'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Inter, carried inside the file, in the weights the canvas uses.
 *
 * An SVG on its own — saved, or drawn into a PNG — cannot see the page's fonts,
 * so without this its labels fall back to whatever face the machine has and
 * no longer fit the boxes they were laid out for. The page already loaded
 * these files, so they come from its cache. A weight that cannot be fetched is
 * left out rather than failing the export: the labels still read, in a
 * fallback face.
 */
async function interFontFaces(markup: string): Promise<string> {
  if (!markup.includes('<text')) return '';
  const weights = new Set<number>([400]);
  for (const match of markup.matchAll(/font-weight:\s*(\d{3})/g)) weights.add(Number(match[1]));
  const faces = await Promise.all(
    [...weights]
      .sort((a, b) => a - b)
      .map(async (weight) => {
        const file = INTER_FILES[weight];
        if (!file) return '';
        try {
          const response = await fetch(file);
          if (!response.ok) return '';
          const data = await blobBase64(await response.blob());
          return `@font-face{font-family:'Inter';font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${data}) format('woff2');}`;
        } catch {
          return '';
        }
      }),
  );
  return faces.join('');
}

export interface ExportedSvg {
  svg: string;
  /** The SVG's own size in pixels: its content, plus the margin. */
  width: number;
  height: number;
}

/**
 * A studio canvas as a standalone SVG file.
 *
 * Drawn by the same component as the card, so the file matches what everyone
 * saw on the board. Framed to what is on the canvas, not to the whole sheet: a
 * sketch in one corner of a large sheet should not leave as mostly white.
 */
export async function studioExportSvg(scene: StudioScene): Promise<ExportedSvg> {
  // Only fetched once somebody exports: nothing else on the page needs it.
  const { renderToStaticMarkup } = await import('react-dom/server');
  const bounds = studioSceneBounds(scene);
  const x = Math.floor(bounds.x - MARGIN);
  const y = Math.floor(bounds.y - MARGIN);
  const width = Math.ceil(bounds.x + bounds.width + MARGIN) - x;
  const height = Math.ceil(bounds.y + bounds.height + MARGIN) - y;
  const inner = renderToStaticMarkup(createElement(StudioSceneContent, { scene }));
  const fonts = await interFontFaces(inner);
  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="${SVG_NS}" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}">` +
    (fonts ? `<style>${fonts}</style>` : '') +
    // White rather than see-through: hollow arrowheads and the halos behind
    // labels are painted in the canvas's white, and would show as white
    // blotches on any other background.
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${BACKGROUND}"/>` +
    inner +
    `</svg>`;
  return { svg, width, height };
}

/**
 * A drawing's stored SVG, given the size it needs to be drawn into a canvas.
 *
 * Parsed rather than edited as text, and never put into the page: it is a
 * peer's markup, and only ever reaches an `<img>`, which runs no script.
 */
function sizedDrawingSvg(source: string): ExportedSvg | null {
  const parsed = new DOMParser().parseFromString(source.trim(), 'image/svg+xml');
  const root = parsed.documentElement;
  if (root.nodeName.toLowerCase() !== 'svg' || parsed.getElementsByTagName('parsererror').length) {
    return null;
  }
  const view = (root.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const [width, height] =
    view.length === 4 && view.every(Number.isFinite) && view[2]! > 0 && view[3]! > 0
      ? [view[2]!, view[3]!]
      : [DRAWING_VIEWBOX_WIDTH, DRAWING_VIEWBOX_HEIGHT];
  if (!root.hasAttribute('viewBox')) root.setAttribute('viewBox', `0 0 ${width} ${height}`);
  // An SVG with no size of its own cannot be drawn into a canvas in Firefox.
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  if (!root.getAttribute('xmlns')) root.setAttribute('xmlns', SVG_NS);
  return { svg: new XMLSerializer().serializeToString(parsed), width, height };
}

/** How much finer than its own size an SVG is drawn into a PNG. */
export function pngScale(width: number, height: number): number {
  return Math.min(PNG_SCALE, PNG_MAX_EDGE / Math.max(width, height, 1));
}

/** An SVG drawn into a PNG, on white, finer than its own size. */
async function rasterizeSvg({ svg, width, height }: ExportedSvg): Promise<Blob> {
  const scale = pngScale(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No canvas to draw on');

  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    context.fillStyle = BACKGROUND;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
  }
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!png) throw new Error('Could not draw that picture');
  return png;
}

/**
 * An imported picture's own file, byte for byte: re-encoding a photo would only
 * make it larger or worse. Null for anything the board would not draw.
 */
export function imageFile(src: string): { blob: Blob; extension: 'png' | 'jpg' } | null {
  if (!canShowImage(src)) return null;
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(src);
  if (!match) return null;
  const binary = atob(match[2]!);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return {
    blob: new Blob([bytes], { type: `image/${match[1]}` }),
    extension: match[1] === 'jpeg' ? 'jpg' : 'png',
  };
}

/** Build the file a card exports as, in the given format. */
export async function exportFile(
  item: BoardItem,
  format: ExportFormat,
): Promise<{ blob: Blob; filename: string }> {
  if (!exportFormats(item).includes(format)) throw new Error('Nothing to export');
  const artifact = item.artifactJson;

  if (artifact.type === 'image') {
    const file = imageFile(artifact.src);
    if (!file) throw new Error('Nothing to export');
    return { blob: file.blob, filename: exportFileName(item, file.extension) };
  }
  if (artifact.type === 'diagram') {
    const exported = await studioExportSvg(artifact);
    if (format === 'svg') {
      return {
        blob: new Blob([exported.svg], { type: 'image/svg+xml' }),
        filename: exportFileName(item, 'svg'),
      };
    }
    return { blob: await rasterizeSvg(exported), filename: exportFileName(item, 'png') };
  }
  if (artifact.type === 'drawing') {
    const sized = sizedDrawingSvg(artifact.svg);
    if (!sized) throw new Error('Nothing to export');
    return { blob: await rasterizeSvg(sized), filename: exportFileName(item, 'png') };
  }
  throw new Error('Nothing to export');
}

/** Export a card and hand the file to the browser. Resolves to the file's name. */
export async function exportProposal(item: BoardItem, format: ExportFormat): Promise<string> {
  const { blob, filename } = await exportFile(item, format);
  saveBlob(blob, filename);
  return filename;
}

/**
 * The export rows for a card's actions menu: the same rows on the board and on
 * the meeting summary, so the two can never offer different things.
 */
export function exportMenuItems(
  item: BoardItem,
  onExport: (item: BoardItem, format: ExportFormat) => void,
): ProposalMenuItem[] {
  return exportFormats(item).map((format) => ({
    id: `export-${format}`,
    label: exportLabel(format),
    icon: format === 'svg' ? FileCode2 : ImageDown,
    onSelect: () => onExport(item, format),
  }));
}

/**
 * Export, with somewhere to say how it went.
 *
 * A download has no visible result inside the page, so success is said as
 * well as failure. A second press while the first is still drawing does
 * nothing, rather than saving the same file twice.
 */
export function useProposalExport(
  report: (result: { ok: boolean; text: string }) => void,
): (item: BoardItem, format: ExportFormat) => void {
  const pending = useRef(new Set<string>());
  const reportRef = useRef(report);
  useEffect(() => {
    reportRef.current = report;
  });

  return useCallback((item: BoardItem, format: ExportFormat) => {
    const key = `${item.id}:${format}`;
    if (pending.current.has(key)) return;
    pending.current.add(key);
    void exportProposal(item, format)
      .then(() => reportRef.current({ ok: true, text: exportedMessage(item, format) }))
      .catch(() => reportRef.current({ ok: false, text: exportFailedMessage(item) }))
      .finally(() => pending.current.delete(key));
  }, []);
}
