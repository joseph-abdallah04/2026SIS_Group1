import {
  type Rgb,
  hslToRgb,
  oklabToRgb,
  oklchToRgb,
  rgbToHsl,
  rgbToOklab,
  rgbToOklch,
  round8,
} from './convert';

export interface Rgba extends Rgb {
  a: number;
}

export type ColourSyntax = 'hex' | 'rgb' | 'hsl' | 'oklch' | 'oklab';

export interface ParsedColour {
  /** Channels rounded to 8 bits, alpha 0-1. */
  rgba: Rgba;
  syntax: ColourSyntax;
  /** Digits written after the hash, for hex. */
  hexDigits?: 3 | 4 | 6 | 8;
  /** Function name as written, lower case: rgb, rgba, hsl, hsla, oklch, oklab. */
  fn?: string;
  /** Space-separated syntax, like rgb(0 0 0 / 0.1), rather than commas. */
  modern?: boolean;
  /** An alpha was written, even a full one. */
  explicitAlpha: boolean;
}

const HEX = /^#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})$/i;

/** Lower-case hex of the rgb. The alpha pair is appended only when below 1. */
export function toHex(rgb: Rgb, alpha = 1): string {
  const part = (n: number): string => round8(n).toString(16).padStart(2, '0');
  const base = `#${part(rgb.r)}${part(rgb.g)}${part(rgb.b)}`;
  return alpha < 1 ? `${base}${part(alpha * 255)}` : base;
}

/** Parses the 3, 4, 6 and 8 digit hex forms. `null` if it is not a hex colour. */
export function parseHex(text: string): ParsedColour | null {
  const match = HEX.exec(text.trim());
  const digits = match?.[1];
  if (!digits) return null;
  const short = digits.length <= 4;
  const pair = (i: number): number =>
    parseInt(short ? digits.charAt(i) + digits.charAt(i) : digits.slice(i * 2, i * 2 + 2), 16);
  const hasAlpha = digits.length === 4 || digits.length === 8;
  return {
    rgba: { r: pair(0), g: pair(1), b: pair(2), a: hasAlpha ? pair(3) / 255 : 1 },
    syntax: 'hex',
    hexDigits: digits.length as 3 | 4 | 6 | 8,
    explicitAlpha: hasAlpha,
  };
}

/** Arguments of a colour function, split on commas, slashes and spaces. */
function splitArgs(inner: string): { args: string[]; modern: boolean; hasSlash: boolean } {
  const args: string[] = [];
  let current = '';
  let sawComma = false;
  let hasSlash = false;
  const flush = (): void => {
    if (current !== '') args.push(current);
    current = '';
  };
  for (const ch of inner) {
    if (ch === ',' || ch === '/' || /\s/.test(ch)) {
      if (ch === ',') sawComma = true;
      if (ch === '/') hasSlash = true;
      flush();
    } else current += ch;
  }
  flush();
  return { args, modern: !sawComma, hasSlash };
}

/** A number, or a percentage taken as a fraction of `scale`. */
function num(arg: string | undefined, scale: number): number | null {
  if (arg === undefined) return null;
  if (arg === 'none') return 0;
  const percent = arg.endsWith('%');
  const value = parseFloat(percent ? arg.slice(0, -1) : arg);
  if (Number.isNaN(value)) return null;
  return percent ? (value / 100) * scale : value;
}

function hue(arg: string | undefined): number | null {
  if (arg === undefined) return null;
  if (arg === 'none') return 0;
  const value = parseFloat(arg);
  if (Number.isNaN(value)) return null;
  if (arg.endsWith('turn')) return value * 360;
  if (arg.endsWith('grad')) return value * 0.9;
  if (arg.endsWith('rad')) return (value * 180) / Math.PI;
  return value;
}

function alphaOf(arg: string | undefined): number {
  const value = num(arg, 1);
  return value === null ? 1 : Math.min(1, Math.max(0, value));
}

const FN = /^([a-z]+)\(([\s\S]*)\)$/i;

/** One CSS colour, in any syntax this tool can edit. `null` for anything else. */
export function parseColour(text: string): ParsedColour | null {
  const source = text.trim();
  if (source.startsWith('#')) return parseHex(source);
  const match = FN.exec(source);
  const fn = match?.[1]?.toLowerCase();
  const inner = match?.[2];
  if (!fn || inner === undefined) return null;
  const { args, modern, hasSlash } = splitArgs(inner);
  // color(srgb r g b / a) carries its space first, so its alpha is one place later.
  const space = fn === 'color';
  const explicitAlpha = args.length === (space ? 5 : 4);
  const alpha = alphaOf(args[space ? 4 : 3]);
  const make = (rgb: Rgb, syntax: ColourSyntax): ParsedColour => ({
    rgba: { r: round8(rgb.r), g: round8(rgb.g), b: round8(rgb.b), a: alpha },
    syntax,
    fn,
    modern: modern || hasSlash,
    explicitAlpha,
  });

  // What a browser reports for a computed colour it mixed, as color(srgb 0.1 0.2 0.3 / 0.5).
  if (fn === 'color') {
    if (args[0] !== 'srgb') return null;
    const [r, g, b] = [num(args[1], 1), num(args[2], 1), num(args[3], 1)];
    if (r === null || g === null || b === null) return null;
    return make({ r: r * 255, g: g * 255, b: b * 255 }, 'rgb');
  }

  if (fn === 'rgb' || fn === 'rgba') {
    const r = num(args[0], 255);
    const g = num(args[1], 255);
    const b = num(args[2], 255);
    if (r === null || g === null || b === null) return null;
    return make({ r, g, b }, 'rgb');
  }
  if (fn === 'hsl' || fn === 'hsla') {
    const h = hue(args[0]);
    const s = num(args[1], 1);
    const l = num(args[2], 1);
    if (h === null || s === null || l === null) return null;
    return make(hslToRgb(h, s > 1 ? s / 100 : s, l > 1 ? l / 100 : l), 'hsl');
  }
  if (fn === 'oklch') {
    const L = num(args[0], 1);
    const C = num(args[1], 0.4);
    const h = hue(args[2]);
    if (L === null || C === null || h === null) return null;
    return make(oklchToRgb({ L, C, h }), 'oklch');
  }
  if (fn === 'oklab') {
    const L = num(args[0], 1);
    const a = num(args[1], 0.4);
    const b = num(args[2], 0.4);
    if (L === null || a === null || b === null) return null;
    return make(oklabToRgb({ L, a, b }), 'oklab');
  }
  return null;
}

/** Up to three decimals, no trailing zeros. */
const trim = (value: number, places = 3): string => String(parseFloat(value.toFixed(places)));

/** Legacy comma syntax, rgba only when something is see-through. */
export function formatRgb(rgb: Rgb, alpha = 1): string {
  const [r, g, b] = [round8(rgb.r), round8(rgb.g), round8(rgb.b)];
  return alpha < 1 ? `rgba(${r}, ${g}, ${b}, ${trim(alpha)})` : `rgb(${r}, ${g}, ${b})`;
}

/**
 * A colour to write into CSS where no syntax is to be kept: hex when solid, and rgba() when
 * see-through, since hex alpha has only 256 steps and would nudge 0.12 to 0.1216.
 */
export function formatCss(rgb: Rgb, alpha = 1): string {
  return alpha < 1 ? formatRgb(rgb, alpha) : toHex(rgb);
}

/**
 * The new colour in the syntax the old one was written in, so a rewritten
 * source line differs from the original by its values and nothing else.
 */
export function formatLike(rgb: Rgb, alpha: number, like: ParsedColour): string {
  const [r, g, b] = [round8(rgb.r), round8(rgb.g), round8(rgb.b)];
  const withAlpha = alpha < 1 || like.explicitAlpha;
  const slash = withAlpha ? ` / ${trim(alpha)}` : '';
  switch (like.syntax) {
    case 'hex':
      return toHex(rgb, like.hexDigits === 4 || like.hexDigits === 8 ? alpha : 1);
    case 'rgb': {
      if (like.modern) return `${like.fn ?? 'rgb'}(${r} ${g} ${b}${slash})`;
      return withAlpha
        ? `${like.fn === 'rgb' ? 'rgb' : 'rgba'}(${r}, ${g}, ${b}, ${trim(alpha)})`
        : `${like.fn ?? 'rgb'}(${r}, ${g}, ${b})`;
    }
    case 'hsl': {
      const { h, s, l } = rgbToHsl({ r, g, b });
      const [hh, ss, ll] = [trim(h, 1), trim(s * 100, 1), trim(l * 100, 1)];
      if (like.modern) return `hsl(${hh} ${ss}% ${ll}%${slash})`;
      return withAlpha
        ? `hsla(${hh}, ${ss}%, ${ll}%, ${trim(alpha)})`
        : `hsl(${hh}, ${ss}%, ${ll}%)`;
    }
    case 'oklch': {
      const { L, C, h } = rgbToOklch({ r, g, b });
      return `oklch(${trim(L)} ${trim(C)} ${trim(h)}${slash})`;
    }
    case 'oklab': {
      const { L, a, b: bb } = rgbToOklab({ r, g, b });
      return `oklab(${trim(L)} ${trim(a)} ${trim(bb)}${slash})`;
    }
  }
}
