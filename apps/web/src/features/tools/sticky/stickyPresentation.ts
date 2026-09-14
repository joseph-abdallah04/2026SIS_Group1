import { CARD_FOOT_CLASS } from '../../pinboard/pinboardTokens';

/**
 * How sticky text is set, everywhere it is shown.
 *
 * One size for every note, however long. The type used to step down as a note
 * grew, which kept each sticky the same square but paid for it in the only
 * thing on the card that matters: a long note arrived on the board too small to
 * read at a glance, and glancing is what a board is for. The note grows
 * instead, in both directions.
 *
 * Shared by the board card, the inline editor and the probe that sizes them, so
 * all three set a note the same way.
 */
export const STICKY_FONT_SIZE = 14;
export const STICKY_LINE_HEIGHT = 1.45;
/**
 * Line breaks are kept, so a note laid out in lines on the popup lands in those
 * lines on the board. They used to collapse, which meant a line break took no
 * room on the paper and nothing counted it: pressing Enter over and over grew
 * the popup without end while the note stayed "fitting". Runs of spaces still
 * collapse, as they do everywhere else on the page.
 */
export const STICKY_NOTE_CLASS =
  'min-h-0 flex-1 wrap-break-word whitespace-pre-line font-medium text-rt-ink';
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
 * The three sizes a sticky can be: eight, nine and ten lines of note.
 *
 * A note sits on the smallest one it fits, and moves up only when its text
 * reaches the bottom of the paper. Each is exactly one line taller than the
 * last, so a note that has grown ends on the last line of its card.
 *
 * Three and no more. The character cap is set so ordinary prose always fits in
 * ten lines, and the editors refuse text that would not fit the largest square
 * however it is written, so nothing needs a fourth.
 */
const STICKY_LINES = [8, 9, 10];
export const STICKY_MIN_SIZE = stickySquare(8);
export const STICKY_MAX_SIZE = stickySquare(10);

/**
 * How much a line holds, for when the page cannot be asked.
 *
 * The width a character of ordinary prose effectively takes once wrapping is
 * counted, measured in Chrome with Inter across real sticky-length notes. Only
 * used where there is no layout to measure against, which in practice means
 * tests; the board measures.
 */
const EFFECTIVE_ADVANCE_PX = 7.2;

function estimatedSize(text: string): number {
  for (const lines of STICKY_LINES) {
    const size = stickySquare(lines);
    if (text.length <= lines * ((size - 28) / EFFECTIVE_ADVANCE_PX)) return size;
  }
  return STICKY_MAX_SIZE;
}

/**
 * An offscreen copy of a sticky, set exactly as the card sets it.
 *
 * Counting characters cannot say where a note will wrap, and a guess that is a
 * line out is the difference between a note that fits and one that spills over
 * the byline. So the note is laid out for real, at each candidate width, in the
 * font the page is actually using.
 */
let probe: { card: HTMLDivElement; note: HTMLParagraphElement } | null = null;

function getProbe() {
  if (probe?.card.isConnected) return probe;

  const card = document.createElement('div');
  card.setAttribute('aria-hidden', 'true');
  card.style.cssText =
    'position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;display:flex;flex-direction:column';

  const note = document.createElement('p');
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

/** The smallest whole-line square the note is laid out within, or null with no layout. */
function measuredSize(text: string): number | null {
  if (typeof document === 'undefined') return null;

  const { card, note } = getProbe();
  note.textContent = text;
  try {
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
  } finally {
    // Emptied every time. Left holding the last note, the probe is a hidden
    // second copy of somebody's words in the page: one more match for anything
    // that searches the document for them.
    note.textContent = '';
  }
}

const measured = new Map<string, number>();
/** Enough for every note on a busy board and the edits in progress on it. */
const MEASURED_LIMIT = 1000;

/**
 * The square a sticky with this note is shown on.
 *
 * Measured, then remembered. Only a measurement taken in the page's real font
 * is remembered: one taken while Inter is still loading was set in the fallback
 * face, which wraps differently, and remembering it would keep a card the wrong
 * size after the font arrived.
 */
export function stickySize(text: string): number {
  const note = text.trim();
  const known = measured.get(note);
  if (known !== undefined) return known;

  const size = measuredSize(note);
  if (size === null) return estimatedSize(note);

  if (typeof document !== 'undefined' && document.fonts?.status === 'loaded') {
    if (measured.size >= MEASURED_LIMIT) measured.clear();
    measured.set(note, size);
  }
  return size;
}

/**
 * Whether a note fits on the largest sticky.
 *
 * The character cap keeps ordinary prose inside ten lines, but it counts
 * characters, not width: a note in capitals, or one key held down, runs out of
 * paper well before it runs out of characters. The editors ask this before
 * taking more text, so no note can be written that the largest square cannot
 * hold, and no card ever has to grow taller than it is wide.
 */
export function stickyFits(text: string): boolean {
  if (typeof document === 'undefined') return true;

  const { card, note } = getProbe();
  // Untrimmed. Line breaks at either end are trimmed when the note is saved,
  // but they are on the paper while it is being written, and a check that
  // ignored them would let Enter grow the popup forever.
  //
  // A line break at the very end draws no line of its own in a paragraph, yet
  // in the box being typed into it has moved the cursor onto a new one. Left
  // uncounted, the Enter on the last line was taken and put the cursor on a
  // line the sticky does not have, where nothing more could be written. A
  // zero-width space gives that empty line a height, so it is the Enter that
  // is refused and the cursor stays where there is still room.
  note.textContent = text.endsWith('\n') ? `${text}\u200b` : text;
  try {
    card.style.width = `${STICKY_MAX_SIZE}px`;
    const height = card.getBoundingClientRect().height;
    // No layout engine, nothing to measure: the character cap is all there is.
    return height === 0 || height <= STICKY_MAX_SIZE;
  } finally {
    note.textContent = '';
  }
}

/**
 * A note cut down to what the largest sticky can hold, keeping the words.
 *
 * For text that did not come through the editor's own refusal: a draft saved
 * before line breaks were counted could hold hundreds of empty lines, and the
 * popup, which grows to fit what it holds, opened thousands of pixels tall
 * with its top and its close button far off the window.
 *
 * A note that fits is returned as it is. One that does not first has its runs
 * of blank lines closed up to a single blank line, which is nearly always what
 * made it too tall and costs no words. Only if that is still too much is it cut
 * to the longest start that fits; adding to a note never makes it shorter, so
 * that length can be found by halving.
 */
export function fitToSticky(text: string): string {
  if (stickyFits(text)) return text;

  const closedUp = text.replace(/\n{3,}/g, '\n\n');
  if (stickyFits(closedUp)) return closedUp;

  let fits = 0;
  let overflows = closedUp.length;
  while (overflows - fits > 1) {
    const middle = Math.floor((fits + overflows) / 2);
    if (stickyFits(closedUp.slice(0, middle))) fits = middle;
    else overflows = middle;
  }
  return closedUp.slice(0, fits);
}
