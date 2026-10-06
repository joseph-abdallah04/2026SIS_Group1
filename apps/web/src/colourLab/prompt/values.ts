import { NAMED_COLOURS } from '../catalogue/scanSvg';
import { type Role } from '../catalogue/types';
import { type Rgb } from '../colour/convert';
import { formatCss, formatLike, parseColour } from '../colour/parse';
import { type RoleKey } from '../model/roles';
import { packRgb } from '../model/slots';
import { type TextEdit } from './apply/script';

/** The colour a piece of source text writes, as the scanners read it. `null` if it is not one. */
export function rgbOfRaw(raw: string): { rgb: Rgb; alpha: number } | null {
  const parsed = parseColour(raw);
  if (parsed) return { rgb: parsed.rgba, alpha: parsed.rgba.a };
  const named = NAMED_COLOURS[raw.trim().toLowerCase()];
  return named ? { rgb: named, alpha: 1 } : null;
}

export const sameRgb = (a: Rgb, b: Rgb): boolean => packRgb(a) === packRgb(b);

/** `#rrggbb` for a colour, ignoring alpha. */
export const hex6 = (rgb: Rgb): string => formatCss(rgb);

/**
 * The text to write in place of `raw` for a new colour: the same syntax, the same case and
 * the same spacing, so a changed line differs from the old one by its values and nothing else.
 *
 * The spacing matters. In a Tailwind class, `shadow-[0_6px_rgba(8,12,21,0.14)]` has no spaces
 * because a space would end the class; a new colour written with them would break it.
 */
export function textFor(rgb: Rgb, alpha: number, raw: string): string {
  const like = parseColour(raw);
  let text = like ? formatLike(rgb, alpha, like) : formatCss(rgb, alpha);
  if (/^[a-z]+\(/i.test(raw) && !/\s/.test(raw)) text = text.replace(/\s+/g, '');
  if (/^#/.test(raw) && raw === raw.toUpperCase() && /[A-F]/.test(raw)) text = text.toUpperCase();
  return keepNotation(raw, text);
}

/** The opacity of a colour written as a function, as the text says it: `0.30` in `rgba(1, 2, 3, 0.30)`. */
const TRAILING_ALPHA = /[,/]\s*([0-9]*\.?[0-9]+)\s*\)$/;

/**
 * Two details of how a colour was written that the formatter does not keep: an opacity such as
 * `0.30`, which it would write as `0.3`, and a lightness written as a percentage, as in
 * `oklch(57.7% …)`. They are put back, so the new text differs from the old by its colour alone.
 */
function keepNotation(raw: string, text: string): string {
  let out = text;
  const was = TRAILING_ALPHA.exec(raw)?.[1];
  const now = TRAILING_ALPHA.exec(out)?.[1];
  if (was !== undefined && now !== undefined && was !== now && Number(was) === Number(now)) {
    out = out.replace(TRAILING_ALPHA, (whole) => whole.replace(now, was));
  }
  if (/^oklch\(\s*[0-9.]+%/i.test(raw)) {
    out = out.replace(/^(oklch\(\s*)([0-9.]+)/i, (_, open: string, lightness: string) => {
      return `${open}${parseFloat((Number(lightness) * 100).toFixed(1))}%`;
    });
  }
  return out;
}

/**
 * Which of several identical pieces of text on a line this one is, counting from 0, so an
 * edit can find it again if the line has moved. `others` are what else is on the file's lines.
 */
export function nthOnLine<T extends { file: string; line: number; col: number; raw: string }>(
  item: T,
  others: readonly T[],
): number {
  return others.filter(
    (other) =>
      other.file === item.file &&
      other.line === item.line &&
      other.raw === item.raw &&
      other.col < item.col,
  ).length;
}

/** Utility prefixes, as a regular expression source, for each role, as the class scanner reads them. */
export const UTILITY_PREFIXES: Readonly<Record<RoleKey, string>> = {
  text: 'text|decoration|caret',
  fill: 'bg|from|via|to|fill|accent|placeholder',
  border: 'border(?:-[xytblrse])?|ring-offset|ring|outline|stroke|divide',
  shadow: 'shadow|inset-shadow|drop-shadow',
  image: '',
};

/** The role a source site has, as far as a class or a variable can be told apart by it. */
export const SITE_ROLES: readonly RoleKey[] = ['text', 'fill', 'border', 'shadow'];

export const isSiteRole = (role: Role): role is RoleKey =>
  (SITE_ROLES as readonly string[]).includes(role);

/** An edit to one place, in the form the apply script takes. */
export function editAt(
  site: { file: string; line: number; col: number; snippet: string; raw: string },
  olds: string[],
  next: string,
  nth: number,
): TextEdit {
  return {
    file: site.file,
    line: site.line,
    col: site.col,
    olds,
    new: next,
    nth,
    anchor: site.snippet,
  };
}
