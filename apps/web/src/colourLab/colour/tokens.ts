import { type ParsedColour, parseColour } from './parse';

export interface ColourToken {
  start: number;
  end: number;
  /** The colour exactly as written. */
  text: string;
  colour: ParsedColour;
}

/** Colour functions this tool can read and write. */
const EDITABLE_FNS = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'oklch', 'oklab']);

/** Colour functions it recognises only so it can step over them. */
const OTHER_COLOUR_FNS = new Set(['lab', 'lch', 'hwb', 'color']);

const HEX_AT = /^#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})(?![0-9a-z_-])/i;
const IDENT_CHAR = /[A-Za-z0-9_-]/;

/** Index just past the paren that closes the one at `open`, stepping over strings. */
function closingParen(value: string, open: number): number {
  let depth = 0;
  for (let i = open; i < value.length; i++) {
    const ch = value.charAt(i);
    if (ch === '"' || ch === "'") {
      i = endOfString(value, i);
      continue;
    }
    if (ch === '(') depth++;
    if (ch === ')' && --depth === 0) return i + 1;
  }
  return value.length;
}

function endOfString(value: string, start: number): number {
  const quote = value.charAt(start);
  for (let i = start + 1; i < value.length; i++) {
    if (value.charAt(i) === '\\') i++;
    else if (value.charAt(i) === quote) return i;
  }
  return value.length;
}

/**
 * Every colour this tool can edit inside one CSS value, in order.
 *
 * Gradients, shadow lists, `var()` fallbacks and `color-mix()` are searched
 * through, since the colours that matter sit inside them. `url()` and quoted
 * strings are not: a fragment id or an embedded data URI is not a colour.
 */
export function findColourTokens(value: string): ColourToken[] {
  const tokens: ColourToken[] = [];
  const push = (start: number, end: number): void => {
    const text = value.slice(start, end);
    const colour = parseColour(text);
    if (colour) tokens.push({ start, end, text, colour });
  };

  let i = 0;
  while (i < value.length) {
    const ch = value.charAt(i);
    if (ch === '"' || ch === "'") {
      i = endOfString(value, i) + 1;
    } else if (ch === '#') {
      const hex = HEX_AT.exec(value.slice(i, i + 10));
      if (hex) {
        push(i, i + hex[0].length);
        i += hex[0].length;
      } else i++;
    } else if (/[A-Za-z]/.test(ch) && !IDENT_CHAR.test(value.charAt(i - 1))) {
      let end = i;
      while (end < value.length && /[A-Za-z0-9-]/.test(value.charAt(end))) end++;
      const name = value.slice(i, end).toLowerCase();
      if (value.charAt(end) !== '(') {
        i = end;
      } else if (EDITABLE_FNS.has(name)) {
        const close = closingParen(value, end);
        push(i, close);
        i = close;
      } else if (name === 'url' || OTHER_COLOUR_FNS.has(name)) {
        i = closingParen(value, end);
      } else {
        i = end + 1;
      }
    } else i++;
  }
  return tokens;
}

/** `value` with each editable colour replaced by `fn(token)`. Return `null` to leave one alone. */
export function replaceColourTokens(
  value: string,
  fn: (token: ColourToken) => string | null,
): string {
  let out = '';
  let last = 0;
  for (const token of findColourTokens(value)) {
    const next = fn(token);
    if (next === null) continue;
    out += value.slice(last, token.start) + next;
    last = token.end;
  }
  return out + value.slice(last);
}

export interface VarRef {
  /** Custom property name with its dashes, e.g. --color-rt-ink. */
  name: string;
  start: number;
}

/** Every `var(--name ...)` in a value. */
export function findVarRefs(value: string): VarRef[] {
  const refs: VarRef[] = [];
  const pattern = /var\(\s*(--[A-Za-z0-9_-]+)/g;
  for (let match = pattern.exec(value); match; match = pattern.exec(value)) {
    refs.push({ name: match[1] ?? '', start: match.index });
  }
  return refs;
}

export interface ColourVarSpan {
  start: number;
  end: number;
  /** The whole expression as written, fallback included. */
  text: string;
  /** Custom property name with its dashes, e.g. --color-rt-ink. */
  name: string;
  /** The opacity Tailwind gives it with color-mix, or 1 when it is used as it is. */
  alpha: number;
}

const MIX_BEFORE = /color-mix\(\s*in\s+[a-z0-9 -]+,\s*$/i;
const MIX_AFTER = /^\s*(\d+(?:\.\d+)?)%\s*,\s*transparent\s*\)/i;

/**
 * The `var(--color-*)` expressions in a value: where a brand token or a Tailwind
 * palette colour is read. A colour inside one's fallback belongs to it and is
 * not found separately. Tailwind writes an opacity as
 * `color-mix(in oklab, var(--color-x) 40%, transparent)`, and that 40% comes
 * back as the alpha, since a colour can want a different value at 10% than at 90%.
 */
export function findColourVars(value: string): ColourVarSpan[] {
  const spans: ColourVarSpan[] = [];
  let reachedEnd = 0;
  for (const match of value.matchAll(/var\(\s*(--color-[A-Za-z0-9_-]+)/g)) {
    if (match.index < reachedEnd) continue;
    const end = closingParen(value, match.index + 3);
    reachedEnd = end;
    const mixed = MIX_BEFORE.test(value.slice(0, match.index))
      ? MIX_AFTER.exec(value.slice(end))
      : null;
    spans.push({
      start: match.index,
      end,
      text: value.slice(match.index, end),
      name: match[1] ?? '',
      alpha: mixed ? Math.min(1, parseFloat(mixed[1] ?? '100') / 100) : 1,
    });
  }
  return spans;
}

export interface Declaration {
  name: string;
  value: string;
  important: boolean;
}

/**
 * The declarations in a rule's `cssText`. Split at top-level semicolons only,
 * since a data URI or a function argument can hold one. Reading a rule from its
 * serialised text rather than property by property is what keeps a shorthand
 * that contains `var()` in one piece: its longhands come back empty.
 */
export function splitDeclarations(cssText: string): Declaration[] {
  const out: Declaration[] = [];
  let depth = 0;
  let start = 0;
  const take = (end: number): void => {
    const chunk = cssText.slice(start, end).trim();
    start = end + 1;
    const colon = chunk.indexOf(':');
    if (colon <= 0) return;
    let value = chunk.slice(colon + 1).trim();
    const important = /\s*!\s*important$/i.test(value);
    if (important) value = value.replace(/\s*!\s*important$/i, '');
    out.push({ name: chunk.slice(0, colon).trim(), value, important });
  };
  for (let i = 0; i < cssText.length; i++) {
    const ch = cssText.charAt(i);
    if (ch === '"' || ch === "'") i = endOfString(cssText, i);
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ';' && depth === 0) take(i);
  }
  if (start < cssText.length) take(cssText.length);
  return out;
}
