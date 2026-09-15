import { CARD_FOOT_CLASS } from '../../pinboard/pinboardTokens';
import { fillWithNote } from './stickyDom';
import type { StickyContent } from './stickyMarks';

/**
 * How sticky text is set, everywhere it is shown.
 *
 * One size for every note, however long. The type used to step down as a note
 * grew, which kept each sticky the same square but paid for it in the only
 * thing on the card that matters: a long note arrived on the board too small to
 * read at a glance, and glancing is what a board is for. The note grows
 * instead, in both directions.
 *
 * Shared by the board card, the editors and the probe that sizes them, so all
 * of them set a note the same way.
 */
export const STICKY_FONT_SIZE = 14;
export const STICKY_LINE_HEIGHT = 1.45;
/**
 * Whitespace is shown exactly as it was typed: line breaks, blank lines, runs
 * of spaces and indents. It may well be deliberate, and a board that tidied it
 * would be rewriting somebody's note. It also takes the room it takes, so the
 * size a note is given counts it.
 */
export const STICKY_NOTE_CLASS =
  'min-h-0 flex-1 wrap-break-word whitespace-pre-wrap font-medium text-rt-ink';
export const STICKY_NOTE_PADDING = '14px 14px 6px';

/**
 * What a sticky spends on things other than its note: the note's own padding
 * and the byline under it. Measured in Chrome with Inter loaded rather than
 * added up from the classes, because the byline's height depends on the line
 * height its text inherits.
 */
const CHROME_PX = 54.5;
const LINE_PX = STICKY_FONT_SIZE * STICKY_LINE_HEIGHT;

/**
 * The square that holds exactly this many lines of note.
 *
 * Whole lines are what make a note end at the bottom of its paper. A square a
 * few pixels short of a whole line fits one line fewer than it looks like it
 * should, and the note spills over the byline.
 */
export const stickySquare = (lines: number) => Math.ceil(CHROME_PX + lines * LINE_PX);

/**
 * The sizes a sticky can be: one for every line of note from eight to fourteen.
 *
 * A note sits on the smallest one it fits, and moves up a line at a time as it
 * grows, each size exactly one line taller and wider than the last. That is
 * what makes a long note grow steadily as it is written rather than jumping
 * between a few sizes far apart.
 *
 * Fourteen lines hold a note at the editor's length in ordinary prose. One that
 * still does not fit — many short lines, or a lot of bold — stays as wide as the
 * largest size and grows a little taller than it, rather than hiding any of
 * somebody's words.
 */
const STICKY_LINES = [8, 9, 10, 11, 12, 13, 14];
export const STICKY_MIN_SIZE = stickySquare(STICKY_LINES[0]!);
export const STICKY_MAX_SIZE = stickySquare(STICKY_LINES.at(-1)!);

/**
 * How much a line holds, for when the page cannot be asked.
 *
 * The width a character of ordinary prose effectively takes once wrapping is
 * counted, measured in Chrome with Inter across real sticky-length notes. Only
 * used where there is no layout to measure against, which in practice means
 * tests; the board measures.
 */
const EFFECTIVE_ADVANCE_PX = 7.2;

/** About how many lines a note wraps to at a square of this size. */
function estimatedLines(text: string, size: number): number {
  const perLine = Math.max(1, Math.floor((size - 28) / EFFECTIVE_ADVANCE_PX));
  return text
    .split('\n')
    .reduce((lines, line) => lines + Math.max(1, Math.ceil(line.length / perLine)), 0);
}

function estimatedSize(text: string): number {
  for (const lines of STICKY_LINES) {
    const size = stickySquare(lines);
    if (estimatedLines(text, size) <= lines) return size;
  }
  return STICKY_MAX_SIZE;
}

/**
 * An offscreen copy of a sticky, set exactly as the card sets it.
 *
 * Counting characters cannot say where a note will wrap, and a guess that is a
 * line out is the difference between a note that fits and one that spills over
 * the byline. So the note is laid out for real, formatting and all, at each
 * candidate width, in the font the page is actually using.
 */
let probe: { card: HTMLDivElement; note: HTMLDivElement } | null = null;

function getProbe() {
  if (probe?.card.isConnected) return probe;

  const card = document.createElement('div');
  card.setAttribute('aria-hidden', 'true');
  card.style.cssText =
    'position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;display:flex;flex-direction:column';

  const note = document.createElement('div');
  note.setAttribute('data-sticky-note', '');
  note.className = STICKY_NOTE_CLASS;
  note.style.padding = STICKY_NOTE_PADDING;
  note.style.fontSize = `${STICKY_FONT_SIZE}px`;
  note.style.lineHeight = String(STICKY_LINE_HEIGHT);

  // One line of byline, which is all a byline ever is: the name truncates.
  const foot = document.createElement('footer');
  foot.className = CARD_FOOT_CLASS;
  foot.innerHTML = '<span class="font-medium">M</span><span>00:00</span>';

  card.append(note, foot);
  document.body.append(card);
  probe = { card, note };
  return probe;
}

/**
 * Lays the note out in the probe, runs `measure` against it, and empties it.
 *
 * Emptied every time. Left holding the last note, the probe is a hidden second
 * copy of somebody's words in the page: one more match for anything that
 * searches the document for them.
 */
function withNoteLaidOut<T>(content: StickyContent, measure: (card: HTMLDivElement) => T): T {
  const { card, note } = getProbe();
  fillWithNote(note, content);
  try {
    return measure(card);
  } finally {
    note.replaceChildren();
  }
}

/** The smallest whole-line square the note is laid out within, or null with no layout. */
function measuredSize(content: StickyContent): number | null {
  if (typeof document === 'undefined') return null;
  return withNoteLaidOut(content, (card) => {
    for (const lines of STICKY_LINES) {
      const size = stickySquare(lines);
      card.style.width = `${size}px`;
      const height = card.getBoundingClientRect().height;
      // Nothing lays out a non-empty card at zero height except an environment
      // with no layout engine at all.
      if (height === 0) return null;
      if (height <= size) return size;
    }
    return STICKY_MAX_SIZE;
  });
}

const measured = new Map<string, number>();
/** Enough for every note on a busy board and the edits in progress on it. */
const MEASURED_LIMIT = 1000;

function measure(content: StickyContent) {
  const { text, marks = [], lines = [], levels = [] } = content;
  // The formatting is part of the key: bold is wider, and a list item is
  // indented, the more so nested, so any of them can need a line more. Links
  // are not: a link is set in the same type as the words around it.
  const key =
    marks.length || lines.some(Boolean)
      ? `${text}\u0000${JSON.stringify(marks)}\u0000${JSON.stringify(lines)}\u0000${JSON.stringify(levels)}`
      : text;
  const known = measured.get(key);
  if (known) return known;

  const result = measuredSize(content);
  if (result === null) return estimatedSize(text);

  // Only a measurement taken in the page's real font is remembered: one taken
  // while Inter is still loading was set in the fallback face, which wraps
  // differently, and remembering it would keep a card the wrong size after the
  // font arrived.
  if (typeof document !== 'undefined' && document.fonts?.status === 'loaded') {
    if (measured.size >= MEASURED_LIMIT) measured.clear();
    measured.set(key, result);
  }
  return result;
}

/**
 * How wide a sticky with this note is, and how tall at the least: the smallest
 * square it fits, or the largest for a note that fits none.
 */
export function stickySize(content: StickyContent): number {
  return measure(content);
}
