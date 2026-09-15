import {
  STICKY_LINE_STYLES,
  STICKY_LINK_LIMIT,
  STICKY_LIST_MAX_LEVEL,
  STICKY_MARK_STYLES,
  stickyLinkHref,
  type StickyLineStyle,
  type StickyLink,
  type StickyMark,
  type StickyMarkStyle,
} from '@roundtable/shared';

/** The list style of each line of a note, with null for a plain line. */
export type StickyLines = (StickyLineStyle | null)[];

/**
 * A sticky's note as the editor and the card work with it: its words, the
 * formatting over them, the list style and nesting of each line, and its links.
 * See `stickyContract` for why they are kept apart.
 */
export interface StickyNote {
  text: string;
  marks: StickyMark[];
  /** One entry for every line of `text`. */
  lines: StickyLines;
  /** How deeply each line is nested, one for every line: 0 for a line in no list. */
  levels: number[];
  links: StickyLink[];
}

/**
 * A note as it is stored, sent or saved as a draft: any of its formatting may
 * be absent, and none of it is trusted until it has been through `toStickyNote`.
 */
export interface StickyContent {
  text: string;
  marks?: readonly StickyMark[];
  lines?: readonly unknown[];
  levels?: readonly unknown[];
  links?: readonly unknown[];
}

/** A run of the note set all one way, and in the same link or none. */
export interface StickySegment {
  text: string;
  styles: StickyMarkStyle[];
  /** The address the run opens, when it is part of a link. */
  href?: string;
}

/** One line of a note, ready to draw. */
export interface StickyBlock {
  list: StickyLineStyle | null;
  /** How deeply the line is nested in its list, from 0. */
  level: number;
  /** Its place in the numbered list it is part of, counting from 1. */
  number: number | null;
  /** How that place is written at its depth: 3, then c, then iii. */
  label: string | null;
  segments: StickySegment[];
}

const STYLE_ORDER = new Map(STICKY_MARK_STYLES.map((style, index) => [style, index]));

// ---------------------------------------------------------------------------
// Formatting over the words.
// ---------------------------------------------------------------------------

/**
 * Formatting in its one tidy form: every range inside the text and covering
 * something, same-style ranges that touch or overlap merged into one, and the
 * lot in order.
 *
 * Everything that makes or receives formatting goes through this, so two notes
 * formatted the same way are always equal, and a range can never point past the
 * words it was set on — whatever a stored note or a crafted payload says.
 */
export function normalizeMarks(
  textLength: number,
  marks: readonly StickyMark[] = [],
): StickyMark[] {
  const byStyle = new Map<StickyMarkStyle, { from: number; to: number }[]>();
  for (const mark of marks) {
    if (!STYLE_ORDER.has(mark.style)) continue;
    const from = Math.max(0, Math.min(textLength, Math.floor(mark.from)));
    const to = Math.max(0, Math.min(textLength, Math.floor(mark.to)));
    if (!(to > from)) continue;
    const ranges = byStyle.get(mark.style) ?? [];
    ranges.push({ from, to });
    byStyle.set(mark.style, ranges);
  }

  const merged: StickyMark[] = [];
  for (const [style, ranges] of byStyle) {
    ranges.sort((a, b) => a.from - b.from);
    let current: { from: number; to: number } | null = null;
    for (const range of ranges) {
      if (current && range.from <= current.to) {
        current.to = Math.max(current.to, range.to);
      } else {
        if (current) merged.push({ ...current, style });
        current = { ...range };
      }
    }
    if (current) merged.push({ ...current, style });
  }

  return merged.sort(
    (a, b) => a.from - b.from || STYLE_ORDER.get(a.style)! - STYLE_ORDER.get(b.style)!,
  );
}

/** The styles on the character at `index`, in the board's order. */
export function stylesAt(marks: readonly StickyMark[], index: number): StickyMarkStyle[] {
  return STICKY_MARK_STYLES.filter((style) =>
    marks.some((mark) => mark.style === style && mark.from <= index && index < mark.to),
  );
}

/**
 * The styles a caret at `offset` types in: those of the character before it,
 * the way a word processor carries on in the formatting you were writing in.
 * At the very start, those of the first character.
 */
export function stylesForCaret(marks: readonly StickyMark[], offset: number): StickyMarkStyle[] {
  return stylesAt(marks, offset > 0 ? offset - 1 : 0);
}

/** Whether every character from `from` to `to` is in `style`. Expects normalised marks. */
export function hasStyleThroughout(
  marks: readonly StickyMark[],
  from: number,
  to: number,
  style: StickyMarkStyle,
): boolean {
  if (to <= from) return false;
  let reached = from;
  for (const mark of marks) {
    if (mark.style !== style || mark.to <= reached || mark.from > reached) continue;
    reached = mark.to;
    if (reached >= to) return true;
  }
  return reached >= to;
}

/** The styles every character from `from` to `to` shares. */
export function stylesThroughout(
  marks: readonly StickyMark[],
  from: number,
  to: number,
): StickyMarkStyle[] {
  return STICKY_MARK_STYLES.filter((style) => hasStyleThroughout(marks, from, to, style));
}

/** Takes `style` off the characters from `from` to `to`, leaving the rest of each range. */
function withoutStyle(
  marks: readonly StickyMark[],
  from: number,
  to: number,
  style: StickyMarkStyle,
): StickyMark[] {
  const out: StickyMark[] = [];
  for (const mark of marks) {
    if (mark.style !== style || mark.to <= from || mark.from >= to) {
      out.push(mark);
      continue;
    }
    if (mark.from < from) out.push({ ...mark, to: from });
    if (mark.to > to) out.push({ ...mark, from: to });
  }
  return out;
}

/**
 * Puts `style` on the characters from `from` to `to`, or takes it off if they
 * are all in it already: the one rule a Bold button follows.
 */
export function toggleStyle(
  note: StickyNote,
  from: number,
  to: number,
  style: StickyMarkStyle,
): StickyNote {
  if (to <= from) return note;
  const marks = hasStyleThroughout(note.marks, from, to, style)
    ? withoutStyle(note.marks, from, to, style)
    : [...note.marks, { from, to, style }];
  return { ...note, marks: normalizeMarks(note.text.length, marks) };
}

// ---------------------------------------------------------------------------
// Lines and lists.
// ---------------------------------------------------------------------------

function countLineBreaks(text: string): number {
  let count = 0;
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) {
    count += 1;
  }
  return count;
}

/** How many lines a note has: always at least one, however empty. */
export function lineCount(text: string): number {
  return countLineBreaks(text) + 1;
}

/** Which line the character at `offset` is on, counting from 0. */
export function lineIndexAt(text: string, offset: number): number {
  return countLineBreaks(text.slice(0, Math.max(0, offset)));
}

/** Where the line holding `offset` starts. */
export function lineStartAt(text: string, offset: number): number {
  return text.lastIndexOf('\n', Math.max(0, offset) - 1) + 1;
}

/** Where the line holding `offset` ends: at its line break, or the end of the note. */
export function lineEndAt(text: string, offset: number): number {
  const next = text.indexOf('\n', Math.max(0, offset));
  return next === -1 ? text.length : next;
}

/**
 * List styles in their one tidy form: exactly one for every line of the text,
 * each a style a sticky has or null.
 */
export function normalizeLines(text: string, lines: readonly unknown[] = []): StickyLines {
  return Array.from({ length: lineCount(text) }, (_, index) => {
    const style = lines[index];
    return (STICKY_LINE_STYLES as readonly unknown[]).includes(style)
      ? (style as StickyLineStyle)
      : null;
  });
}

/**
 * Nesting in its one tidy form: a level for every line of the text, whole and
 * no deeper than a sticky goes, and 0 for any line that is not in a list.
 */
export function normalizeLevels(
  text: string,
  lines: readonly unknown[] = [],
  levels: readonly unknown[] = [],
): number[] {
  return normalizeLines(text, lines).map((style, index) => {
    const level = levels[index];
    if (style === null || typeof level !== 'number' || !Number.isFinite(level)) return 0;
    return Math.max(0, Math.min(STICKY_LIST_MAX_LEVEL, Math.floor(level)));
  });
}

/**
 * The lines a selection from `from` to `to` touches. A selection that ends
 * right at the start of a line, as selecting whole lines does, does not reach
 * into that line.
 */
function linesTouched(text: string, from: number, to: number): { first: number; last: number } {
  const first = lineIndexAt(text, from);
  const reachesNextLine = to > from && text[to - 1] === '\n';
  const last = Math.max(first, lineIndexAt(text, to) - (reachesNextLine ? 1 : 0));
  return { first, last };
}

/** The list style every line a selection touches shares, or null if they differ. */
export function listThroughout(note: StickyNote, from: number, to: number): StickyLineStyle | null {
  const { first, last } = linesTouched(note.text, from, to);
  const lines = normalizeLines(note.text, note.lines);
  const style = lines[first] ?? null;
  for (let index = first + 1; index <= last; index += 1) {
    if (lines[index] !== style) return null;
  }
  return style;
}

/** Sets the lines a selection touches to `style`, or to plain with null. */
export function setLineStyle(
  note: StickyNote,
  from: number,
  to: number,
  style: StickyLineStyle | null,
): StickyNote {
  const { first, last } = linesTouched(note.text, from, to);
  const lines = normalizeLines(note.text, note.lines);
  const levels = normalizeLevels(note.text, lines, note.levels);
  for (let index = first; index <= last; index += 1) {
    lines[index] = style;
    // A line taken out of its list is no longer nested in it.
    if (style === null) levels[index] = 0;
  }
  return { ...note, lines, levels };
}

/**
 * Makes the lines a selection touches a bulleted or numbered list, or plain
 * again if they all are one already: the one rule a list button follows.
 */
export function toggleList(
  note: StickyNote,
  from: number,
  to: number,
  style: StickyLineStyle,
): StickyNote {
  return setLineStyle(note, from, to, listThroughout(note, from, to) === style ? null : style);
}

/**
 * The deepest a list line can be nested: one level under the item above it, so
 * every nested item has an item it is nested under. The first item of a list
 * has none, and stays where it is.
 */
function deepestFor(lines: StickyLines, levels: readonly number[], index: number): number {
  if (!lines[index]) return 0;
  const above = index > 0 && lines[index - 1] ? levels[index - 1]! + 1 : 0;
  return Math.min(STICKY_LIST_MAX_LEVEL, above);
}

/** Whether Tab would nest any of the list lines a selection touches. */
export function canIndent(note: StickyNote, from: number, to: number): boolean {
  const { first, last } = linesTouched(note.text, from, to);
  const lines = normalizeLines(note.text, note.lines);
  const levels = normalizeLevels(note.text, lines, note.levels);
  for (let index = first; index <= last; index += 1) {
    if (lines[index] && levels[index]! < deepestFor(lines, levels, index)) return true;
  }
  return false;
}

/** Whether Shift+Tab would bring any of the list lines a selection touches out a level. */
export function canOutdent(note: StickyNote, from: number, to: number): boolean {
  const { first, last } = linesTouched(note.text, from, to);
  const levels = normalizeLevels(note.text, note.lines, note.levels);
  for (let index = first; index <= last; index += 1) {
    if (levels[index]! > 0) return true;
  }
  return false;
}

/**
 * Nests the list lines a selection touches one level deeper, or brings them one
 * level out. Lines that are not in a list are left alone, and a line already as
 * deep as it can go stays there. Lines are nested top to bottom, so a run of
 * items selected together moves in together.
 */
export function indentLines(note: StickyNote, from: number, to: number, by: 1 | -1): StickyNote {
  const { first, last } = linesTouched(note.text, from, to);
  const lines = normalizeLines(note.text, note.lines);
  const levels = normalizeLevels(note.text, lines, note.levels);
  for (let index = first; index <= last; index += 1) {
    if (!lines[index]) continue;
    const level = levels[index]!;
    levels[index] =
      by > 0
        ? Math.max(level, Math.min(level + 1, deepestFor(lines, levels, index)))
        : Math.max(0, level - 1);
  }
  return { ...note, lines, levels };
}

// ---------------------------------------------------------------------------
// Links.
// ---------------------------------------------------------------------------

const checkedHrefs = new Map<string, boolean>();

/** Whether an address is one a link may open, exactly as it is written. */
function isSafeHref(href: string): boolean {
  let safe = checkedHrefs.get(href);
  if (safe === undefined) {
    safe = stickyLinkHref(href) === href;
    if (checkedHrefs.size >= 500) checkedHrefs.clear();
    checkedHrefs.set(href, safe);
  }
  return safe;
}

/**
 * Links in their one tidy form: each over some of the text and opening a
 * website, in order, none over another, and one link where two to the same
 * address touch.
 *
 * A link from a stored note or a crafted payload that would open anything but a
 * website is dropped here, before anything can draw it.
 */
export function normalizeLinks(textLength: number, links: readonly unknown[] = []): StickyLink[] {
  const valid: StickyLink[] = [];
  for (const link of links) {
    if (typeof link !== 'object' || link === null) continue;
    const { from, to, href } = link as Record<string, unknown>;
    if (typeof from !== 'number' || typeof to !== 'number' || typeof href !== 'string') continue;
    if (!isSafeHref(href)) continue;
    const start = Math.max(0, Math.min(textLength, Math.floor(from)));
    const end = Math.max(0, Math.min(textLength, Math.floor(to)));
    if (!(end > start)) continue;
    valid.push({ from: start, to: end, href });
  }
  valid.sort((a, b) => a.from - b.from);

  const tidy: StickyLink[] = [];
  for (const link of valid) {
    const previous = tidy.at(-1);
    // Where two overlap, the one that starts first keeps its words.
    const from = previous ? Math.max(link.from, previous.to) : link.from;
    if (link.to <= from) continue;
    if (previous && previous.to === from && previous.href === link.href) {
      previous.to = link.to;
      continue;
    }
    if (tidy.length >= STICKY_LINK_LIMIT) break;
    tidy.push({ ...link, from });
  }
  return tidy;
}

/**
 * The link a selection is in, for a toolbar to show and edit: the one a
 * selection lies wholly inside, or the one a caret is in or at either end of.
 */
export function linkAround(note: StickyNote, from: number, to: number): StickyLink | null {
  if (to > from) {
    return note.links.find((link) => link.from <= from && to <= link.to) ?? null;
  }
  return (
    note.links.find((link) => link.from < from && from < link.to) ??
    note.links.find((link) => link.to === from) ??
    note.links.find((link) => link.from === from) ??
    null
  );
}

/**
 * Makes the characters from `from` to `to` a link to `href`, or no link with
 * null. Any link already over some of them loses those words and keeps the rest.
 */
export function setLink(
  note: StickyNote,
  from: number,
  to: number,
  href: string | null,
): StickyNote {
  if (to <= from) return note;
  const links: StickyLink[] = [];
  for (const link of note.links) {
    if (link.to <= from || link.from >= to) {
      links.push(link);
      continue;
    }
    if (link.from < from) links.push({ ...link, to: from });
    if (link.to > to) links.push({ ...link, from: to });
  }
  if (href) links.push({ from, to, href });
  return { ...note, links: normalizeLinks(note.text.length, links) };
}

/** Punctuation that ends the sentence a web address is in, rather than the address. */
const TRAILING_PUNCTUATION = /[.,;:!?'"]+$/;

/**
 * Links the web address just typed before `offset`, the way a word processor
 * does when a space or a new line finishes it. Null when there is nothing to
 * link: the word before the caret is not an address, is already linked, or is
 * not one a link may open.
 *
 * Only an address written as one — starting `http://`, `https://` or `www.` —
 * is taken for one. A bare `example.com` could as easily be a file name or the
 * end of a sentence, so it is left as words. Punctuation after an address, as
 * at the end of a sentence, stays out of the link, and so does a closing
 * bracket the address did not open.
 */
export function autoLinkBefore(note: StickyNote, offset: number): StickyNote | null {
  let from = offset;
  while (from > 0 && !/\s/.test(note.text[from - 1]!)) from -= 1;
  let word = note.text.slice(from, offset).replace(TRAILING_PUNCTUATION, '');
  if (word.endsWith(')') && !word.includes('(')) {
    word = word.slice(0, -1).replace(TRAILING_PUNCTUATION, '');
  }
  const to = from + word.length;
  if (!/^(https?:\/\/|www\.)\S+$/i.test(word)) return null;
  if (note.links.some((link) => link.from < to && from < link.to)) return null;
  const href = stickyLinkHref(word);
  return href ? setLink(note, from, to, href) : null;
}

// ---------------------------------------------------------------------------
// Editing the words.
// ---------------------------------------------------------------------------

/**
 * Replaces the characters from `from` to `to` with `insert`, set in `styles`.
 *
 * Formatting either side stays on the words it was on: a range ending before
 * the change is untouched, one starting after it moves with the words, and one
 * running through it loses what was taken out. The new words take `styles` and
 * nothing else, so typing at the end of a bold word carries on in bold only
 * because the caller asked for it.
 *
 * Lines follow the same rules a word processor does. Lines joined by taking out
 * the break between them take the list style and nesting of the first, unless
 * the first is taken out whole, when the line that is left keeps its own. New
 * lines take the style and nesting of the line they were started on, so Enter
 * in a list carries the list on at the same depth.
 *
 * A link grows and shrinks with a change made inside it, and is cut short by
 * one that reaches its edge. Typing straight after a link is not part of it, so
 * a sentence can carry on past a link without the link carrying on too.
 */
export function replaceText(
  note: StickyNote,
  from: number,
  to: number,
  insert: string,
  styles: readonly StickyMarkStyle[],
): StickyNote {
  const start = Math.max(0, Math.min(from, note.text.length));
  const end = Math.max(start, Math.min(to, note.text.length));
  const text = note.text.slice(0, start) + insert + note.text.slice(end);
  const shift = insert.length - (end - start);

  const marks: StickyMark[] = [];
  for (const mark of note.marks) {
    // Before the change: kept as it is, cut short where the change begins.
    if (mark.from < start) marks.push({ ...mark, to: Math.min(mark.to, start) });
    // After the change: moved along with the words it is on.
    if (mark.to > end) {
      marks.push({ ...mark, from: Math.max(mark.from, end) + shift, to: mark.to + shift });
    }
  }
  if (insert.length > 0) {
    for (const style of styles) marks.push({ from: start, to: start + insert.length, style });
  }

  const links: StickyLink[] = [];
  for (const link of note.links) {
    if (link.from < start && link.to > end) {
      // The change is inside the link, so the link takes what was put there.
      links.push({ ...link, to: link.to + shift });
      continue;
    }
    if (link.from < start) links.push({ ...link, to: Math.min(link.to, start) });
    if (link.to > end) {
      links.push({ ...link, from: Math.max(link.from, end) + shift, to: link.to + shift });
    }
  }

  const beforeLines = normalizeLines(note.text, note.lines);
  const beforeLevels = normalizeLevels(note.text, beforeLines, note.levels);
  const line = lineIndexAt(note.text, start);
  const removed = countLineBreaks(note.text.slice(start, end));
  const added = countLineBreaks(insert);
  // Whole lines taken off the top of the change leave nothing of the first line
  // behind, so what survives is the line the change ended on, in its own style.
  const firstLineGone = removed > 0 && start === lineStartAt(note.text, start);
  const keptIndex = firstLineGone ? line + removed : line;
  function spliced<T>(each: readonly T[], fallback: T): T[] {
    const kept = each[keptIndex] ?? fallback;
    return [
      ...each.slice(0, line),
      kept,
      ...Array.from({ length: added }, () => kept),
      ...each.slice(line + 1 + removed),
    ];
  }
  const lines = normalizeLines(text, spliced<StickyLineStyle | null>(beforeLines, null));

  return {
    text,
    marks: normalizeMarks(text.length, marks),
    lines,
    levels: normalizeLevels(text, lines, spliced(beforeLevels, 0)),
    links: normalizeLinks(text.length, links),
  };
}

// ---------------------------------------------------------------------------
// Drawing and storing a note.
// ---------------------------------------------------------------------------

/** The note broken into runs that are each set all one way, and in one link or none, in order. */
export function stickySegments(
  text: string,
  marks: readonly StickyMark[] = [],
  links: readonly unknown[] = [],
): StickySegment[] {
  const tidy = normalizeMarks(text.length, marks);
  const tidyLinks = normalizeLinks(text.length, links);
  const cuts = new Set([0, text.length]);
  for (const range of [...tidy, ...tidyLinks]) {
    cuts.add(range.from);
    cuts.add(range.to);
  }
  const points = [...cuts].sort((a, b) => a - b);

  const segments: StickySegment[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index]!;
    const to = points[index + 1]!;
    if (to <= from) continue;
    const styles = stylesAt(tidy, from);
    const href = tidyLinks.find((link) => link.from <= from && from < link.to)?.href;
    const previous = segments.at(-1);
    if (previous && previous.styles.join() === styles.join() && previous.href === href) {
      previous.text += text.slice(from, to);
    } else {
      segments.push({ text: text.slice(from, to), styles, ...(href ? { href } : {}) });
    }
  }
  return segments;
}

/** Counts 1, 2, 3 as a, b, c, and on past z as aa, ab. */
function alphabetic(count: number): string {
  let label = '';
  for (let left = count; left > 0; left = Math.floor((left - 1) / 26)) {
    label = String.fromCharCode(97 + ((left - 1) % 26)) + label;
  }
  return label;
}

const ROMAN: [number, string][] = [
  [1000, 'm'],
  [900, 'cm'],
  [500, 'd'],
  [400, 'cd'],
  [100, 'c'],
  [90, 'xc'],
  [50, 'l'],
  [40, 'xl'],
  [10, 'x'],
  [9, 'ix'],
  [5, 'v'],
  [4, 'iv'],
  [1, 'i'],
];

function roman(count: number): string {
  let label = '';
  let left = count;
  for (const [value, numeral] of ROMAN) {
    for (; left >= value; left -= value) label += numeral;
  }
  return label;
}

/**
 * How an item's place in a numbered list is written at its depth: 1, 2, 3 at
 * the top, a, b, c under that, and i, ii, iii under that, so a nested list is
 * told apart from the one it is in at a glance.
 */
export function listLabel(count: number, level: number): string {
  if (level % 3 === 1) return alphabetic(count);
  if (level % 3 === 2) return roman(count);
  return String(count);
}

/**
 * The note line by line, each with its runs and its place in a list.
 *
 * A numbered list counts from 1 and starts again after any line that is not in
 * it, so two numbered lists with a sentence between them are numbered apart. A
 * nested list counts on its own, from 1 under each item it is nested under, and
 * the list it is nested in carries on counting after it.
 */
export function stickyBlocks(content: StickyContent): StickyBlock[] {
  const { text } = content;
  const styles = normalizeLines(text, content.lines);
  const levels = normalizeLevels(text, styles, content.levels);
  const blocks: StickyBlock[] = styles.map((list, index) => ({
    list,
    level: levels[index]!,
    number: null,
    label: null,
    segments: [],
  }));

  let line = 0;
  for (const segment of stickySegments(text, content.marks, content.links)) {
    const parts = segment.text.split('\n');
    parts.forEach((part, index) => {
      if (index > 0) line += 1;
      if (part) blocks[line]!.segments.push({ ...segment, text: part });
    });
  }

  // How far each depth of the list being drawn has counted.
  const counts: { list: StickyLineStyle; count: number }[] = [];
  for (const block of blocks) {
    if (!block.list) {
      counts.length = 0;
      continue;
    }
    counts.length = Math.min(counts.length, block.level + 1);
    const at = counts[block.level];
    const count = at && at.list === block.list ? at.count + 1 : 1;
    counts[block.level] = { list: block.list, count };
    if (block.list === 'number') {
      block.number = count;
      block.label = listLabel(count, block.level);
    }
  }
  return blocks;
}

/**
 * The note as plain text that reads the way it looks, for the clipboard.
 *
 * The stored words alone lose the lists: bullets and numbers are drawn from the
 * line styles, not written into the text, so a copied numbered list would paste
 * as lines run together. Here every list line gets the marker the card shows —
 * "•", or the same "1."/"a."/"i." `stickyBlocks` counts — indented two spaces
 * a level. Formatting and link addresses have no plain-text form and are left
 * behind; the words they were on are not.
 */
export function stickyPlainText(content: StickyContent): string {
  return stickyBlocks(content)
    .map((block) => {
      const words = block.segments.map((segment) => segment.text).join('');
      if (!block.list) return words;
      const marker = block.list === 'bullet' ? '•' : `${block.label}.`;
      return `${'  '.repeat(block.level)}${marker} ${words}`;
    })
    .join('\n');
}

/** A line's runs, gathered into the links they are in, so each link is drawn as one. */
export function linkRuns(
  segments: readonly StickySegment[],
): { href: string | null; segments: StickySegment[] }[] {
  const runs: { href: string | null; segments: StickySegment[] }[] = [];
  for (const segment of segments) {
    const href = segment.href ?? null;
    const previous = runs.at(-1);
    if (previous && previous.href === href) previous.segments.push(segment);
    else runs.push({ href, segments: [segment] });
  }
  return runs;
}

/** The note a run of segments makes, as ranges over their joined text. */
export function noteFromSegments(
  segments: readonly StickySegment[],
  lines: readonly unknown[] = [],
  levels: readonly unknown[] = [],
): StickyNote {
  let text = '';
  const marks: StickyMark[] = [];
  const links: StickyLink[] = [];
  for (const segment of segments) {
    const from = text.length;
    text += segment.text;
    for (const style of segment.styles) marks.push({ from, to: text.length, style });
    if (segment.href) links.push({ from, to: text.length, href: segment.href });
  }
  return toStickyNote({ text, marks, lines, levels, links });
}

/** A note as the editor holds it, from a stored one that may have no formatting. */
export function toStickyNote(source: StickyContent): StickyNote {
  const lines = normalizeLines(source.text, source.lines);
  return {
    text: source.text,
    marks: normalizeMarks(source.text.length, source.marks),
    lines,
    levels: normalizeLevels(source.text, lines, source.levels),
    links: normalizeLinks(source.text.length, source.links),
  };
}

/** Whether two notes say the same thing, set the same way. */
export function sameNote(a: StickyContent, b: StickyContent): boolean {
  if (a.text !== b.text) return false;
  const left = toStickyNote(a);
  const right = toStickyNote(b);
  return (
    left.marks.length === right.marks.length &&
    left.marks.every(
      (mark, index) =>
        mark.from === right.marks[index]!.from &&
        mark.to === right.marks[index]!.to &&
        mark.style === right.marks[index]!.style,
    ) &&
    left.lines.every((style, index) => style === right.lines[index]) &&
    left.levels.every((level, index) => level === right.levels[index]) &&
    left.links.length === right.links.length &&
    left.links.every(
      (link, index) =>
        link.from === right.links[index]!.from &&
        link.to === right.links[index]!.to &&
        link.href === right.links[index]!.href,
    )
  );
}

/**
 * The inline styles a run in these styles is drawn with.
 *
 * Shared by the card, the editor and the probe that sizes a sticky, so all
 * three set a note the same way. Bold is wider than the note's usual weight, so
 * a probe that did not draw it would size a bold note too small.
 *
 * A run in a link is underlined by the link already, so underlining it again
 * would draw a second line under the first.
 */
export function segmentStyle(
  styles: readonly StickyMarkStyle[],
  linked = false,
): {
  fontWeight?: number;
  fontStyle?: 'italic';
  textDecorationLine?: string;
} {
  const decoration = [
    styles.includes('underline') && !linked ? 'underline' : null,
    styles.includes('strike') ? 'line-through' : null,
  ].filter(Boolean);
  return {
    ...(styles.includes('bold') ? { fontWeight: 700 } : {}),
    ...(styles.includes('italic') ? { fontStyle: 'italic' as const } : {}),
    ...(decoration.length ? { textDecorationLine: decoration.join(' ') } : {}),
  };
}

/**
 * The formatting ready to store: normalised, and left off entirely when there
 * is none. Line styles stop at the last line in a list, and nesting at the last
 * nested line, so a note with no lists stores neither.
 */
export function formatForArtifact(note: StickyNote): {
  marks?: StickyMark[];
  lines?: StickyLines;
  levels?: number[];
  links?: StickyLink[];
} {
  const { marks, lines, levels, links } = toStickyNote(note);
  let lastInList = -1;
  let lastNested = -1;
  lines.forEach((style, index) => {
    if (style !== null) lastInList = index;
    if (levels[index]! > 0) lastNested = index;
  });
  return {
    ...(marks.length ? { marks } : {}),
    ...(lastInList >= 0 ? { lines: lines.slice(0, lastInList + 1) } : {}),
    ...(lastNested >= 0 ? { levels: levels.slice(0, lastNested + 1) } : {}),
    ...(links.length ? { links } : {}),
  };
}
