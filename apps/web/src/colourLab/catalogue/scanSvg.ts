import { type Rgb } from '../colour/convert';
import { type ParsedColour } from '../colour/parse';
import { findColourTokens } from '../colour/tokens';
import { hexSlotKey } from '../model/slots';
import { lineStartsOf, positionOf, snippetAt } from './source';
import { type FileScan } from './types';

/** The colour attributes an SVG can carry. */
export const SVG_COLOUR_ATTRIBUTES = [
  'fill',
  'stroke',
  'stop-color',
  'flood-color',
  'lighting-color',
  'color',
] as const;

/**
 * The two named colours a logo is likely to use. Others are left alone: a name
 * like "red" is rare in a drawing tool, and each one added is a place for a
 * wrong guess about what the author meant.
 */
export const NAMED_COLOURS: Readonly<Record<string, Rgb>> = {
  black: { r: 0, g: 0, b: 0 },
  white: { r: 255, g: 255, b: 255 },
};

export interface SvgColourSpan {
  /** Offsets of the colour within the SVG text. */
  start: number;
  end: number;
  text: string;
  rgb: Rgb;
  alpha: number;
  /** `null` for a colour written as a name. */
  like: ParsedColour | null;
  /** The attribute it was found in. */
  attribute: string;
}

const ATTRIBUTE = new RegExp(
  '(?<![\\w-])(' +
    [...SVG_COLOUR_ATTRIBUTES, 'style'].join('|') +
    ')\\s*=\\s*("([^"]*)"|\'([^\']*)\')',
  'g',
);

/** Every colour an SVG's own attributes set, in document order. */
export function findSvgColours(svg: string): SvgColourSpan[] {
  const spans: SvgColourSpan[] = [];
  for (const match of svg.matchAll(ATTRIBUTE)) {
    const attribute = match[1] ?? '';
    const value = match[3] ?? match[4] ?? '';
    const valueStart = match.index + match[0].indexOf(value, attribute.length);
    for (const token of findColourTokens(value)) {
      spans.push({
        start: valueStart + token.start,
        end: valueStart + token.end,
        text: token.text,
        rgb: token.colour.rgba,
        alpha: token.colour.rgba.a,
        like: token.colour,
        attribute,
      });
    }
    const name = value.trim().toLowerCase();
    const named = attribute === 'style' ? undefined : NAMED_COLOURS[name];
    if (named) {
      const start = valueStart + value.indexOf(value.trim());
      spans.push({
        start,
        end: start + name.length,
        text: value.trim(),
        rgb: named,
        alpha: 1,
        like: null,
        attribute,
      });
    }
  }
  return spans;
}

/** The colours drawn in an SVG file. */
export function scanSvgSource(file: string, text: string, exportOnly = false): FileScan {
  const starts = lineStartsOf(text);
  const scan: FileScan = { literals: [], classes: [], refs: [], tokens: [] };
  for (const span of findSvgColours(text)) {
    if (span.alpha === 0) continue;
    const { line, col } = positionOf(starts, span.start);
    scan.literals.push({
      slot: hexSlotKey(span.rgb),
      file,
      line,
      col,
      raw: span.text,
      alpha: span.alpha,
      role: 'image',
      context: span.attribute,
      snippet: snippetAt(text, starts, line),
      exportOnly,
    });
  }
  return scan;
}
