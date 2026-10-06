/** Helpers shared by the source scanners. */

export interface Position {
  line: number;
  col: number;
}

/** Offsets at which each line begins. */
export function lineStartsOf(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charAt(i) === '\n') starts.push(i + 1);
  }
  return starts;
}

/** 1-based line and column of an offset. */
export function positionOf(starts: readonly number[], offset: number): Position {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if ((starts[mid] ?? 0) <= offset) low = mid;
    else high = mid - 1;
  }
  return { line: low + 1, col: offset - (starts[low] ?? 0) + 1 };
}

/** The text of one line, trimmed and capped. */
export function snippetAt(text: string, starts: readonly number[], line: number): string {
  const from = starts[line - 1] ?? 0;
  const to = starts[line] ?? text.length;
  return text.slice(from, to).trim().slice(0, 160);
}

/** Replaces every character of a span with a space, keeping newlines, so offsets stay put. */
const blank = (span: string): string => span.replace(/[^\n]/g, ' ');

/** CSS with its comments blanked out. */
export function blankCssComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, blank);
}

/**
 * TypeScript or TSX with its comments blanked out and everything else left
 * alone, strings and template literals included, since that is where the
 * colours are. Not a parser: a regular expression literal that contains a
 * slash or a quote can fool it, and it costs a line at worst.
 */
export function blankTsComments(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text.charAt(i);
    const next = text.charAt(i + 1);
    if (ch === '/' && next === '/') {
      const end = text.indexOf('\n', i);
      const stop = end === -1 ? text.length : end;
      out += blank(text.slice(i, stop));
      i = stop;
    } else if (ch === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      out += blank(text.slice(i, stop));
      i = stop;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < text.length && text.charAt(j) !== ch) {
        if (text.charAt(j) === '\\') j++;
        // A quote that never closes on its line is an apostrophe in JSX text.
        if (ch !== '`' && text.charAt(j) === '\n') break;
        j++;
      }
      out += text.slice(i, j + 1);
      i = j + 1;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}
