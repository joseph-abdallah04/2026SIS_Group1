import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import {
  Bold,
  ExternalLink,
  Italic,
  Link2,
  List,
  ListIndentDecrease,
  ListIndentIncrease,
  ListOrdered,
  Strikethrough,
  Underline,
  type LucideIcon,
} from 'lucide-react';
import {
  STICKY_MARK_STYLES,
  stickyLinkHref,
  type StickyLineStyle,
  type StickyMarkStyle,
} from '@roundtable/shared';

import { fillWithNote, STICKY_HREF_ATTRIBUTE, STICKY_STYLES_ATTRIBUTE } from './stickyDom';
import {
  autoLinkBefore,
  canIndent,
  canOutdent,
  indentLines,
  lineCount,
  lineEndAt,
  lineIndexAt,
  lineStartAt,
  linkAround,
  listThroughout,
  noteFromSegments,
  replaceText,
  sameNote,
  setLineStyle,
  setLink,
  stylesAt,
  stylesForCaret,
  stylesThroughout,
  toggleList,
  toggleStyle,
  type StickyLines,
  type StickyNote,
  type StickySegment,
} from './stickyMarks';

/** How far back undo reaches. */
const HISTORY_LIMIT = 200;
/** Keystrokes closer together than this undo as one. */
const TYPING_RUN_MS = 1000;
/** How wide the box for a link's address is, at most. */
const LINK_EDITOR_WIDTH_PX = 320;

interface Selection {
  start: number;
  end: number;
}

/** What the selection, or the caret, is set in, for a toolbar to show. */
export interface StickyFormat {
  styles: StickyMarkStyle[];
  list: StickyLineStyle | null;
  /** The address of the link the selection is in, if it is in one. */
  link: string | null;
  /** Whether Tab, or Increase indent, would nest a list item. */
  canIndent: boolean;
  /** Whether Shift+Tab, or Decrease indent, would bring a list item out a level. */
  canOutdent: boolean;
}

export const NO_STICKY_FORMAT: StickyFormat = {
  styles: [],
  list: null,
  link: null,
  canIndent: false,
  canOutdent: false,
};

// ---------------------------------------------------------------------------
// The DOM the field draws, read back as offsets into the note's text.
//
// The field holds one element for each line of the note. The line break
// between two lines is the gap between their elements, not a character in
// either, so it counts as one character here and appears nowhere in the DOM.
// ---------------------------------------------------------------------------

/** How many characters of the note a node inside a line stands for. */
function lengthOf(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return (node as Text).data.length;
  let total = 0;
  node.childNodes.forEach((child) => {
    total += lengthOf(child);
  });
  return total;
}

function lineNodes(root: HTMLElement): Node[] {
  return Array.from(root.childNodes);
}

/** The offset of a DOM position into the line that holds it. */
function offsetWithin(line: Node, container: Node, offset: number): number {
  let total = 0;
  const walk = (node: Node): boolean => {
    if (node === container) {
      if (node.nodeType === Node.TEXT_NODE) {
        total += offset;
      } else {
        for (let index = 0; index < offset && index < node.childNodes.length; index += 1) {
          total += lengthOf(node.childNodes[index]!);
        }
      }
      return true;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      total += (node as Text).data.length;
      return false;
    }
    for (const child of Array.from(node.childNodes)) if (walk(child)) return true;
    return false;
  };
  walk(line);
  return total;
}

/** The offset into the note of a DOM position inside the field. */
function offsetOf(root: HTMLElement, container: Node, offset: number): number {
  const lines = lineNodes(root);
  if (container === root) {
    let total = 0;
    for (let index = 0; index < Math.min(offset, lines.length); index += 1) {
      total += lengthOf(lines[index]!) + 1;
    }
    // Before a line is where it starts; past the last one, the end of the note.
    return offset >= lines.length ? Math.max(0, total - 1) : total;
  }
  let base = 0;
  for (const line of lines) {
    if (line === container || line.contains(container)) {
      return base + offsetWithin(line, container, offset);
    }
    base += lengthOf(line) + 1;
  }
  return Math.max(0, base - 1);
}

/** The DOM position of an offset into the note. */
function pointAt(root: HTMLElement, target: number): { node: Node; offset: number } {
  const lines = lineNodes(root);
  let base = 0;
  for (const line of lines) {
    const length = lengthOf(line);
    if (target <= base + length) {
      const within = target - base;
      if (line.nodeType === Node.TEXT_NODE) return { node: line, offset: within };
      let reached = 0;
      const texts = root.ownerDocument.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      for (let node = texts.nextNode(); node; node = texts.nextNode()) {
        const size = (node as Text).data.length;
        if (within <= reached + size) return { node, offset: within - reached };
        reached += size;
      }
      // An empty line: before the break that gives it a height.
      return { node: line, offset: 0 };
    }
    base += length + 1;
  }
  return { node: root, offset: lines.length };
}

function readSelection(root: HTMLElement): Selection | null {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const a = offsetOf(root, range.startContainer, range.startOffset);
  const b = offsetOf(root, range.endContainer, range.endOffset);
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

function rangeFor(root: HTMLElement, { start, end }: Selection): Range {
  const from = pointAt(root, start);
  const to = start === end ? from : pointAt(root, end);
  const range = root.ownerDocument.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  return range;
}

function placeSelection(root: HTMLElement, selection: Selection) {
  const current = root.ownerDocument.getSelection();
  if (!current) return;
  current.removeAllRanges();
  current.addRange(rangeFor(root, selection));
}

/**
 * Where a caret at `offset` is on screen. A caret on an empty line has no box
 * of its own, so it takes the line's.
 */
function caretBox(
  root: HTMLElement,
  offset: number,
): { top: number; bottom: number; left: number } {
  const box = rangeFor(root, { start: offset, end: offset }).getBoundingClientRect();
  if (box.height) return box;
  const { node } = pointAt(root, offset);
  const element = node instanceof Element ? node : (node.parentElement ?? root);
  return element.getBoundingClientRect();
}

/** Room kept between the caret and the edge of the note when it is scrolled into view. */
const CARET_MARGIN_PX = 8;

/**
 * Scrolls a note taller than its field just far enough to show the caret.
 *
 * A browser keeps the caret in view when it makes a change itself. This field
 * makes every change and draws the note again, so a new line typed at the
 * bottom would otherwise go on out of sight below the last one showing.
 */
function revealCaret(root: HTMLElement, offset: number) {
  if (root.scrollHeight <= root.clientHeight) return;
  const caret = caretBox(root, offset);
  const view = root.getBoundingClientRect();
  // The popup rises in scaled, and what is on screen is measured scaled with
  // it while scrolling is not, so the distance is scaled back first.
  const scale = root.offsetHeight ? view.height / root.offsetHeight : 1;
  const top = view.top;
  const bottom = top + root.clientHeight * scale;
  if (caret.bottom > bottom - CARET_MARGIN_PX * scale) {
    root.scrollTop += (caret.bottom - bottom) / scale + CARET_MARGIN_PX;
  } else if (caret.top < top + CARET_MARGIN_PX * scale) {
    root.scrollTop -= (top - caret.top) / scale + CARET_MARGIN_PX;
  }
}

/** The styles an element sets, whoever drew it: this field, or the browser. */
function stylesOfElement(element: HTMLElement): StickyMarkStyle[] {
  const styles = new Set<StickyMarkStyle>();
  const own = element.getAttribute(STICKY_STYLES_ATTRIBUTE);
  if (own) {
    for (const style of own.split(' ')) {
      if ((STICKY_MARK_STYLES as readonly string[]).includes(style)) {
        styles.add(style as StickyMarkStyle);
      }
    }
  }
  const tag = element.tagName;
  if (tag === 'B' || tag === 'STRONG') styles.add('bold');
  if (tag === 'I' || tag === 'EM') styles.add('italic');
  if (tag === 'U') styles.add('underline');
  if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') styles.add('strike');
  const weight = element.style.fontWeight;
  if (weight === 'bold' || Number(weight) >= 600) styles.add('bold');
  if (element.style.fontStyle === 'italic') styles.add('italic');
  const decoration = `${element.style.textDecorationLine} ${element.style.textDecoration}`;
  if (decoration.includes('underline')) styles.add('underline');
  if (decoration.includes('line-through')) styles.add('strike');
  return [...styles];
}

/**
 * The note the field's DOM holds, however it came to hold it. A link is read
 * back from the address this field drew it with; the note it makes checks that
 * address again before keeping it.
 */
function readNote(root: HTMLElement): StickyNote {
  const segments: StickySegment[] = [];
  const lines: StickyLines = [];
  const levels: number[] = [];
  const visit = (node: Node, styles: StickyMarkStyle[], href: string | undefined) => {
    if (node.nodeType === Node.TEXT_NODE) {
      segments.push({ text: (node as Text).data, styles, ...(href ? { href } : {}) });
      return;
    }
    if (!(node instanceof HTMLElement) || node.tagName === 'BR') return;
    const next = STICKY_MARK_STYLES.filter(
      (style) => styles.includes(style) || stylesOfElement(node).includes(style),
    );
    const link = node.getAttribute(STICKY_HREF_ATTRIBUTE) ?? href;
    node.childNodes.forEach((child) => visit(child, next, link));
  };
  lineNodes(root).forEach((line, index) => {
    if (index > 0) segments.push({ text: '\n', styles: [] });
    const element = line instanceof HTMLElement ? line : null;
    const list = element?.getAttribute('data-list');
    lines.push(list === 'bullet' || list === 'number' ? list : null);
    levels.push(Number(element?.getAttribute('data-level') ?? 0) || 0);
    visit(line, [], undefined);
  });
  return noteFromSegments(segments, lines, levels);
}

/** Drops a lone half of a character a cut would otherwise leave at the end. */
function withoutBrokenEnd(text: string): string {
  const last = text.charCodeAt(text.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? text.slice(0, -1) : text;
}

/**
 * As much of `data` as fits in the note in place of `range`: no more characters
 * than the limit, and no more lines. Whatever does not fit is cut from the end
 * of what is going in, never from what the note already says, so Enter at the
 * line limit does nothing and a paste stops at the last line there is room for.
 */
function fitting(
  note: StickyNote,
  range: Selection,
  data: string,
  limit: number,
  lineLimit: number | undefined,
): string {
  const room = limit - (note.text.length - (range.end - range.start));
  const text = withoutBrokenEnd(data.slice(0, Math.max(0, room)));
  if (lineLimit === undefined || !text.includes('\n')) return text;
  const kept = lineCount(note.text) - (lineCount(note.text.slice(range.start, range.end)) - 1);
  return text
    .split('\n')
    .slice(0, Math.max(0, lineLimit - kept) + 1)
    .join('\n');
}

/**
 * The stretch that changed between two versions of a note's text: where it
 * starts, and where it ends in each. Everything before it and after it is the
 * same in both.
 */
function changedStretch(
  before: string,
  after: string,
): { start: number; endBefore: number; endAfter: number } {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) {
    start += 1;
  }
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore -= 1;
    endAfter -= 1;
  }
  return { start, endBefore, endAfter };
}

function withStyle(styles: readonly StickyMarkStyle[], style: StickyMarkStyle, on: boolean) {
  return STICKY_MARK_STYLES.filter((each) => (each === style ? on : styles.includes(each)));
}

/** What typing at the start of a line turns it into: "- " and "* " a bullet, "1. " a number. */
function listFromShortcut(prefix: string): StickyLineStyle | null {
  if (prefix === '-' || prefix === '*') return 'bullet';
  if (/^1[.)]$/.test(prefix)) return 'number';
  return null;
}

/**
 * The address a paste is, when all it is is one: a web address, written out in
 * full. Anything less certain is pasted as the words it is.
 */
function pastedLink(text: string): string | null {
  const trimmed = text.trim();
  return /^https?:\/\/\S+$/i.test(trimmed) ? stickyLinkHref(trimmed) : null;
}

// ---------------------------------------------------------------------------
// The box a link's address is written in.
// ---------------------------------------------------------------------------

interface LinkEditorState {
  /** Counts each time it is opened, so opening it again starts it afresh. */
  opened: number;
  /** The words the link is over, or where its address goes as words when nothing is selected. */
  range: Selection;
  /** The address the link opens now, when it is one already. */
  href: string | null;
  top: number;
  left: number;
}

function LinkEditor({
  state,
  error,
  onApply,
  onRemove,
  onCancel,
}: {
  state: LinkEditorState;
  error: string | null;
  onApply: (typed: string) => void;
  onRemove: () => void;
  onCancel: (returnFocus: boolean) => void;
}) {
  const [typed, setTyped] = useState(state.href ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, []);

  return (
    <div
      role="group"
      aria-label="Link"
      className="rt-sticky-link-editor absolute z-10 rounded-xl border border-rt-tertiary bg-rt-surface p-2 text-rt-ink shadow-[0_6px_24px_rgba(8,12,21,0.16)]"
      style={{ top: state.top, left: state.left, width: `min(100%, ${LINK_EDITOR_WIDTH_PX}px)` }}
      onBlur={(event) => {
        // Put away once focus goes anywhere else, as a menu is.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onCancel(false);
      }}
      onKeyDown={(event) => {
        // Escape puts this away, not the popup the note is in.
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onCancel(true);
      }}
    >
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          aria-label="Link address"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          placeholder="Paste or type a link"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => {
            // Enter applies the link. Left alone it would submit the sticky.
            if (event.key !== 'Enter') return;
            event.preventDefault();
            event.stopPropagation();
            onApply(typed);
          }}
          className="h-8 min-w-0 flex-1 rounded-lg border border-rt-tertiary bg-rt-surface px-2.5 text-[13px] text-rt-ink outline-none placeholder:text-rt-ink-faint focus:border-rt-ink/50"
        />
        <button
          type="button"
          onClick={() => onApply(typed)}
          className="h-8 shrink-0 rounded-lg bg-rt-ink px-3 text-[12px] font-semibold text-white transition-colors hover:bg-rt-ink/85 focus-visible:ring-2 focus-visible:ring-rt-ink focus-visible:ring-offset-1 focus-visible:outline-none"
        >
          Apply
        </button>
      </div>
      {error ? (
        <p id={errorId} className="mt-1.5 px-0.5 text-[11.5px] text-rt-secondary-deep">
          {error}
        </p>
      ) : null}
      {state.href ? (
        <div className="mt-1.5 flex items-center justify-between gap-2 px-0.5">
          <a
            href={state.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 items-center gap-1 text-[11.5px] font-medium text-rt-cool-deep hover:underline focus-visible:underline focus-visible:outline-none"
          >
            <ExternalLink aria-hidden="true" size={12} strokeWidth={2.2} className="shrink-0" />
            <span className="truncate">Open link</span>
          </a>
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium text-rt-ink-muted hover:bg-rt-ink/8 hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-ink focus-visible:outline-none"
          >
            Remove link
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The field.
// ---------------------------------------------------------------------------

export interface RichStickyFieldHandle {
  /** Bold, italic, underline or strikethrough, on the selection or what is typed next. */
  toggle: (style: StickyMarkStyle) => void;
  /** A bulleted or numbered list, on the lines the selection touches. */
  toggleList: (style: StickyLineStyle) => void;
  /** Nests the list items the selection touches a level deeper, or brings them out one. */
  indent: (by: 1 | -1) => void;
  /** Opens the box for a link's address, for the selection or the link the caret is in. */
  openLink: () => void;
  focus: () => void;
}

interface RichStickyFieldProps {
  id?: string;
  label: string;
  value: StickyNote;
  onChange: (next: StickyNote) => void;
  /** Characters the note may hold. Typing and pasting stop there. */
  limit: number;
  /** Lines the note may hold. Enter does nothing there, and a paste stops there. */
  lineLimit?: number;
  /** Tells a toolbar what the selection, or the caret, is set in. */
  onFormatChange?: (format: StickyFormat) => void;
  placeholder?: string;
  autoFocus?: boolean;
  readOnly?: boolean;
  /** How tall the note grows before it scrolls instead. */
  maxHeight?: number;
  /** Type and padding, shared by the note and its placeholder. */
  className?: string;
  style?: CSSProperties;
}

/**
 * A sticky's note, written with formatting.
 *
 * Built on an editable element rather than a text box, because a text box
 * cannot show a word in bold or a line as a list. Everything that changes the
 * note — typing, deleting, pasting, a new line, a style, a list, a link, undo —
 * is made to the note itself, and the field then draws the note and puts the
 * caret back. So what is on screen is always exactly the note that will be
 * proposed: no stray markup a browser invented, nothing pasted in from
 * elsewhere but its words, and no formatting beyond what a sticky has.
 *
 * Lists behave the way they do in a word processor. Enter carries a list on,
 * and Enter on an empty item leaves it, a level at a time when it is nested.
 * Backspace at the start of an item does the same before it joins the line to
 * the one above. Tab nests an item under the one above it and Shift+Tab brings
 * it back out. "- ", "* " and "1. " typed at the start of a line start a list,
 * and undo gives the characters back.
 *
 * A link is made from the toolbar or Ctrl+K, over the selected words, or with
 * its address as its words when nothing is selected. Pasting a web address
 * over selected words links them to it. Ctrl+click opens a link from the note.
 *
 * The one thing left to the browser is composing a character with an input
 * method, which cannot be done on its behalf; the note is read back from the
 * field once it is finished.
 *
 * It grows with the note, eased, up to `maxHeight`, and scrolls beyond that.
 */
export const RichStickyField = forwardRef<RichStickyFieldHandle, RichStickyFieldProps>(
  function RichStickyField(
    {
      id,
      label,
      value,
      onChange,
      limit,
      lineLimit,
      onFormatChange,
      placeholder,
      autoFocus = false,
      readOnly = false,
      maxHeight,
      className = '',
      style,
    },
    ref,
  ) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const frameRef = useRef<HTMLDivElement>(null);
    /** The note the field is drawing now. */
    const shown = useRef<StickyNote>({
      text: '',
      marks: [],
      lines: [null],
      levels: [0],
      links: [],
    });
    /** Styles chosen with nothing selected, for whatever is typed next there. */
    const pending = useRef<{ at: number; styles: StickyMarkStyle[] } | null>(null);
    const lastSelection = useRef<Selection | null>(null);
    const undoStack = useRef<{ note: StickyNote; selection: Selection }[]>([]);
    const redoStack = useRef<{ note: StickyNote; selection: Selection }[]>([]);
    const lastEdit = useRef<{ kind: string; at: number } | null>(null);
    const formatKey = useRef('');
    const [linkEditor, setLinkEditor] = useState<LinkEditorState | null>(null);
    const [linkError, setLinkError] = useState<string | null>(null);
    const linkOpenings = useRef(0);

    // Read through refs by the listeners, which are attached once.
    const props = useRef({ onChange, onFormatChange, limit, lineLimit, readOnly });
    useEffect(() => {
      props.current = { onChange, onFormatChange, limit, lineLimit, readOnly };
    });

    const paint = useCallback((note: StickyNote, selection?: Selection) => {
      const root = rootRef.current;
      if (!root) return;
      fillWithNote(root, note);
      shown.current = note;
      if (selection && root.ownerDocument.activeElement === root) {
        placeSelection(root, selection);
        lastSelection.current = selection;
        revealCaret(root, selection.end);
      }
    }, []);

    const reportFormat = useCallback((force = false) => {
      const root = rootRef.current;
      const report = props.current.onFormatChange;
      if (!root || !report) return;
      const selection = readSelection(root) ?? lastSelection.current;
      const note = shown.current;
      const format: StickyFormat = { ...NO_STICKY_FORMAT };
      if (selection) {
        const { start, end } = selection;
        format.list = listThroughout(note, start, end);
        format.link = linkAround(note, start, end)?.href ?? null;
        format.canIndent = canIndent(note, start, end);
        format.canOutdent = canOutdent(note, start, end);
        if (start === end) {
          format.styles =
            pending.current && pending.current.at === start
              ? pending.current.styles
              : note.text.length
                ? stylesForCaret(note.marks, start)
                : [];
        } else {
          format.styles = stylesThroughout(note.marks, start, end);
        }
      }
      const key = JSON.stringify(format);
      if (key === formatKey.current && !force) return;
      formatKey.current = key;
      report(format);
    }, []);

    /** Makes a change: remembered for undo, drawn, and handed up. */
    const commit = useCallback(
      (next: StickyNote, selection: Selection, kind: string, before?: Selection) => {
        const previous = shown.current;
        const changed = !sameNote(previous, next);
        if (changed) {
          const now = Date.now();
          // A run of typing, or of deleting, undoes as one step, the way it was
          // done; a style, a list, a link, a paste or a change of direction is
          // a step of its own.
          const continuing =
            (kind === 'type' || kind === 'delete') &&
            lastEdit.current?.kind === kind &&
            now - lastEdit.current.at < TYPING_RUN_MS;
          if (!continuing) {
            undoStack.current.push({
              note: previous,
              selection: before ?? lastSelection.current ?? selection,
            });
            if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
          }
          redoStack.current = [];
          lastEdit.current = { kind, at: now };
        }
        pending.current = null;
        paint(next, selection);
        if (changed) props.current.onChange(next);
        reportFormat();
      },
      [paint, reportFormat],
    );

    const insert = useCallback(
      (range: Selection, data: string, kind: string) => {
        const note = shown.current;

        // "- " or "1. " at the start of a plain line starts a list.
        if (kind === 'type' && data === ' ' && range.start === range.end) {
          const start = lineStartAt(note.text, range.start);
          const list = note.lines[lineIndexAt(note.text, range.start)]
            ? null
            : listFromShortcut(note.text.slice(start, range.start));
          if (list) {
            const cleared = replaceText(note, start, range.start, '', []);
            commit(
              setLineStyle(cleared, start, start, list),
              { start, end: start },
              'format',
              range,
            );
            return;
          }
        }

        const text = fitting(note, range, data, props.current.limit, props.current.lineLimit);
        const caret = range.start + text.length;
        if (text.length > 0 || range.start !== range.end) {
          const styles =
            pending.current && pending.current.at === range.start
              ? pending.current.styles
              : range.end > range.start
                ? stylesAt(note.marks, range.start)
                : stylesForCaret(note.marks, range.start);
          const next = replaceText(note, range.start, range.end, text, styles);
          commit(next, { start: caret, end: caret }, kind, range);
        }

        // A web address finished with Enter or a space becomes a link. Made
        // after the space or line break it was finished with, as a step of its
        // own, so undo takes the link off first and leaves the words as typed.
        // Enter at the line limit starts no line, but still finishes the address.
        if (kind === 'type' && (data === ' ' || data === '\n') && range.start === range.end) {
          const linked = autoLinkBefore(shown.current, range.start);
          if (linked) {
            commit(linked, { start: caret, end: caret }, 'format', { start: caret, end: caret });
          }
        }
      },
      [commit],
    );

    /**
     * Links `range` to `href`. With nothing selected, `words` go in at the
     * caret as the link's words. False when there is no room left for them.
     */
    const link = useCallback(
      (range: Selection, href: string, words: string): boolean => {
        const note = shown.current;
        if (range.end > range.start) {
          commit(
            setLink(note, range.start, range.end, href),
            { start: range.end, end: range.end },
            'format',
            range,
          );
          return true;
        }
        if (note.text.length + words.length > props.current.limit) return false;
        const styles = stylesForCaret(note.marks, range.start);
        const typed = replaceText(note, range.start, range.start, words, styles);
        const end = range.start + words.length;
        commit(setLink(typed, range.start, end, href), { start: end, end }, 'format', range);
        return true;
      },
      [commit],
    );

    /**
     * Deletes `range`. `before` is where the caret or selection was when the
     * delete was asked for, which is where undo puts it back: a backspace
     * undone should leave the caret after the character, not select it.
     */
    const remove = useCallback(
      (range: Selection, before: Selection) => {
        if (range.end <= range.start) return;
        const next = replaceText(shown.current, range.start, range.end, '', []);
        commit(next, { start: range.start, end: range.start }, 'delete', before);
      },
      [commit],
    );

    const travel = useCallback(
      (from: 'undo' | 'redo') => {
        const root = rootRef.current;
        const source = from === 'undo' ? undoStack.current : redoStack.current;
        const target = from === 'undo' ? redoStack.current : undoStack.current;
        const step = source.pop();
        if (!root || !step) return;
        target.push({
          note: shown.current,
          selection: readSelection(root) ?? lastSelection.current ?? step.selection,
        });
        lastEdit.current = null;
        pending.current = null;
        paint(step.note, step.selection);
        props.current.onChange(step.note);
        reportFormat();
      },
      [paint, reportFormat],
    );

    /** The selection to act on, and the field focused to act on it. */
    const target = useCallback((): Selection | null => {
      const root = rootRef.current;
      if (!root || props.current.readOnly) return null;
      const length = shown.current.text.length;
      const selection = readSelection(root) ??
        lastSelection.current ?? { start: length, end: length };
      if (root.ownerDocument.activeElement !== root) root.focus({ preventScroll: true });
      return selection;
    }, []);

    const toggle = useCallback(
      (styleName: StickyMarkStyle) => {
        const root = rootRef.current;
        const selection = target();
        if (!root || !selection) return;

        if (selection.start === selection.end) {
          const length = shown.current.text.length;
          const base =
            pending.current && pending.current.at === selection.start
              ? pending.current.styles
              : length
                ? stylesForCaret(shown.current.marks, selection.start)
                : [];
          pending.current = {
            at: selection.start,
            styles: withStyle(base, styleName, !base.includes(styleName)),
          };
          placeSelection(root, selection);
          lastSelection.current = selection;
          reportFormat(true);
          return;
        }
        commit(
          toggleStyle(shown.current, selection.start, selection.end, styleName),
          selection,
          'format',
          selection,
        );
      },
      [commit, reportFormat, target],
    );

    const list = useCallback(
      (styleName: StickyLineStyle) => {
        const selection = target();
        if (!selection) return;
        commit(
          toggleList(shown.current, selection.start, selection.end, styleName),
          selection,
          'format',
          selection,
        );
      },
      [commit, target],
    );

    const indent = useCallback(
      (by: 1 | -1) => {
        const selection = target();
        if (!selection) return;
        commit(
          indentLines(shown.current, selection.start, selection.end, by),
          selection,
          'format',
          selection,
        );
      },
      [commit, target],
    );

    const openLink = useCallback(() => {
      const root = rootRef.current;
      const wrapper = wrapperRef.current;
      const selection = target();
      if (!root || !wrapper || !selection) return;
      // Inside a link, it is the whole link that is edited.
      const existing = linkAround(shown.current, selection.start, selection.end);
      const range = existing ? { start: existing.from, end: existing.to } : selection;
      lastSelection.current = selection;

      // Under the words it is for, kept inside the note's width.
      const words = rangeFor(root, range).getBoundingClientRect();
      const anchor = words.height ? words : caretBox(root, range.start);
      const box = wrapper.getBoundingClientRect();
      const width = Math.min(box.width, LINK_EDITOR_WIDTH_PX);
      linkOpenings.current += 1;
      setLinkError(null);
      setLinkEditor({
        opened: linkOpenings.current,
        range,
        href: existing?.href ?? null,
        top: Math.max(0, anchor.bottom - box.top + 6),
        left: Math.max(0, Math.min(anchor.left - box.left, box.width - width)),
      });
    }, [target]);

    const closeLink = useCallback((returnFocus: boolean) => {
      setLinkEditor(null);
      setLinkError(null);
      const root = rootRef.current;
      if (!returnFocus || !root) return;
      root.focus({ preventScroll: true });
      if (lastSelection.current) placeSelection(root, lastSelection.current);
    }, []);

    const applyLink = useCallback(
      (typed: string) => {
        if (!linkEditor) return;
        const href = stickyLinkHref(typed);
        if (!href) {
          setLinkError('Enter a web address, like example.com');
          return;
        }
        const { range } = linkEditor;
        const words = typed.trim();
        if (
          range.start === range.end &&
          shown.current.text.length + words.length > props.current.limit
        ) {
          setLinkError('There is no room left in the note for the address');
          return;
        }
        setLinkEditor(null);
        setLinkError(null);
        rootRef.current?.focus({ preventScroll: true });
        link(range, href, words);
      },
      [link, linkEditor],
    );

    const removeLink = useCallback(() => {
      if (!linkEditor) return;
      const { range } = linkEditor;
      setLinkEditor(null);
      setLinkError(null);
      rootRef.current?.focus({ preventScroll: true });
      commit(
        setLink(shown.current, range.start, range.end, null),
        { start: range.end, end: range.end },
        'format',
        lastSelection.current ?? range,
      );
    }, [commit, linkEditor]);

    useImperativeHandle(
      ref,
      () => ({
        toggle,
        toggleList: list,
        indent,
        openLink,
        focus: () => rootRef.current?.focus({ preventScroll: true }),
      }),
      [toggle, list, indent, openLink],
    );

    // A note arriving from outside — the first one, a restored draft — is drawn
    // as it is. The field's own changes are already on screen by then.
    useLayoutEffect(() => {
      if (!sameNote(shown.current, value) || !rootRef.current?.hasChildNodes()) {
        paint(value);
      }
    }, [value, paint]);

    // Grows with the note, eased, rather than jumping a line at a time.
    useLayoutEffect(() => {
      const root = rootRef.current;
      const frame = frameRef.current;
      if (!root || !frame) return;
      const from = frame.style.height;
      frame.style.transition = 'none';
      frame.style.height = 'auto';
      const natural = root.scrollHeight;
      const to = `${maxHeight ? Math.min(natural, maxHeight) : natural}px`;
      frame.style.height = from || to;
      void frame.offsetHeight;
      frame.style.transition = '';
      frame.style.height = to;
    }, [value, maxHeight]);

    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;
      if (autoFocus) {
        root.focus({ preventScroll: true });
        const end = shown.current.text.length;
        placeSelection(root, { start: end, end });
        lastSelection.current = { start: end, end };
        revealCaret(root, end);
      }

      /**
       * What Enter on an empty list item, or Backspace at the start of one,
       * does before anything else: brings a nested item out a level, and takes
       * the bullet or number off one that is not nested.
       */
      const leaveList = (selection: Selection, onlyAtLineStart: boolean): boolean => {
        const note = shown.current;
        if (selection.start !== selection.end) return false;
        const line = lineIndexAt(note.text, selection.start);
        if (!note.lines[line]) return false;
        const start = lineStartAt(note.text, selection.start);
        const atStart = start === selection.start;
        const empty = start === lineEndAt(note.text, selection.start);
        if (onlyAtLineStart ? !atStart : !empty) return false;
        const next =
          (note.levels[line] ?? 0) > 0
            ? indentLines(note, start, start, -1)
            : setLineStyle(note, start, start, null);
        commit(next, selection, 'format', selection);
        return true;
      };

      const onBeforeInput = (event: InputEvent) => {
        if (props.current.readOnly) {
          event.preventDefault();
          return;
        }
        const type = event.inputType;
        // Composing with an input method belongs to the browser; the note is
        // read back once it is done.
        if (type === 'insertCompositionText' || event.isComposing) return;
        event.preventDefault();

        const length = shown.current.text.length;
        const selection = readSelection(root) ??
          lastSelection.current ?? { start: length, end: length };
        const targets = event.getTargetRanges?.() ?? [];
        const range = targets[0]
          ? {
              start: offsetOf(root, targets[0].startContainer, targets[0].startOffset),
              end: offsetOf(root, targets[0].endContainer, targets[0].endOffset),
            }
          : null;

        switch (type) {
          case 'insertText':
            insert(selection, event.data ?? '', 'type');
            return;
          case 'insertReplacementText':
            insert(
              range ?? selection,
              event.data ?? event.dataTransfer?.getData('text/plain') ?? '',
              'replace',
            );
            return;
          case 'insertParagraph':
          case 'insertLineBreak':
            // Enter on an empty list item leaves the list rather than making
            // another empty one.
            if (!leaveList(selection, false)) insert(selection, '\n', 'type');
            return;
          case 'insertFromPaste':
          case 'insertFromPasteAsQuotation':
            // The paste event, below, is the one place a paste goes in. Some
            // browsers send this as well, before or after it, and taking both
            // pasted everything twice, and linked the wrong words for an
            // address pasted over a selection. Its default is already stopped.
            return;
          case 'historyUndo':
            travel('undo');
            return;
          case 'historyRedo':
            travel('redo');
            return;
          case 'formatBold':
            toggle('bold');
            return;
          case 'formatItalic':
            toggle('italic');
            return;
          case 'formatUnderline':
            toggle('underline');
            return;
          case 'formatStrikeThrough':
            toggle('strike');
            return;
          case 'insertUnorderedList':
            list('bullet');
            return;
          case 'insertOrderedList':
            list('number');
            return;
          case 'formatIndent':
            indent(1);
            return;
          case 'formatOutdent':
            indent(-1);
            return;
          default:
            break;
        }

        if (type.startsWith('delete')) {
          // Backspace at the start of a list item takes the bullet or number
          // off first; the next one joins the line to the one above.
          if (type.includes('Backward') && leaveList(selection, true)) return;
          if (range && range.end > range.start) {
            remove(range, selection);
          } else if (selection.end > selection.start) {
            remove(selection, selection);
          } else if (type.includes('Backward')) {
            const text = shown.current.text;
            const low = text.charCodeAt(selection.start - 1);
            const pair = low >= 0xdc00 && low <= 0xdfff && selection.start > 1 ? 2 : 1;
            remove({ start: Math.max(0, selection.start - pair), end: selection.start }, selection);
          } else {
            const text = shown.current.text;
            const high = text.charCodeAt(selection.start);
            const pair = high >= 0xd800 && high <= 0xdbff ? 2 : 1;
            remove(
              { start: selection.start, end: Math.min(text.length, selection.start + pair) },
              selection,
            );
          }
        }
        // Anything else — a drop, a browser's own link — is not something a sticky has.
      };

      /**
       * Whatever the browser changed itself, which is only ever composition.
       *
       * Held to the same limits as anything typed or pasted, characters and
       * lines both. What the input method put in is found as the stretch that
       * changed, and only that is cut back, so the words after it stay.
       */
      const onInput = (event: Event) => {
        if ((event as InputEvent).isComposing) return;
        const read = readNote(root);
        const previous = shown.current;
        if (sameNote(read, previous)) return;
        const selection = readSelection(root) ?? { start: read.text.length, end: read.text.length };
        const { start, endBefore, endAfter } = changedStretch(previous.text, read.text);
        const composed = read.text.slice(start, endAfter);
        const kept = fitting(
          previous,
          { start, end: endBefore },
          composed,
          props.current.limit,
          props.current.lineLimit,
        );
        const next =
          kept.length < composed.length
            ? replaceText(read, start + kept.length, endAfter, '', [])
            : read;
        const caret =
          kept.length < composed.length
            ? start + kept.length
            : Math.min(selection.end, next.text.length);
        commit(next, { start: caret, end: caret }, 'type');
      };

      const onKeyDown = (event: KeyboardEvent) => {
        const run = (action: () => void) => {
          event.preventDefault();
          action();
        };

        // Tab and Shift+Tab stay in the note only when they nest an item or
        // bring one out. Anywhere else, a line that is not in a list or an item
        // already as deep or as shallow as it goes, they move focus on as they
        // do on any page, so the note never holds on to the keyboard.
        if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const selection = readSelection(root) ?? lastSelection.current;
          if (!selection || props.current.readOnly) return;
          const note = shown.current;
          if (event.shiftKey) {
            if (canOutdent(note, selection.start, selection.end)) run(() => indent(-1));
          } else if (canIndent(note, selection.start, selection.end)) {
            run(() => indent(1));
          }
          return;
        }

        const mod = event.ctrlKey || event.metaKey;
        if (!mod || event.altKey) return;
        const key = event.key.toLowerCase();
        if (key === 'z' && !event.shiftKey) run(() => travel('undo'));
        else if ((key === 'z' && event.shiftKey) || key === 'y') run(() => travel('redo'));
        else if (key === 'b' && !event.shiftKey) run(() => toggle('bold'));
        else if (key === 'i' && !event.shiftKey) run(() => toggle('italic'));
        else if (key === 'u' && !event.shiftKey) run(() => toggle('underline'));
        else if (key === 'x' && event.shiftKey) run(() => toggle('strike'));
        else if (key === 'k' && !event.shiftKey) run(openLink);
        // By the key's place rather than its letter, since Shift changes what 8 and 7 type.
        else if (event.code === 'Digit8' && event.shiftKey) run(() => list('bullet'));
        else if (event.code === 'Digit7' && event.shiftKey) run(() => list('number'));
      };

      // A link in the note is words being written, so a plain press puts the
      // caret in it. Ctrl+click opens it, as in a word processor.
      const onClick = (event: MouseEvent) => {
        if (!(event.ctrlKey || event.metaKey) || !(event.target instanceof Element)) return;
        const href = event.target
          .closest(`[${STICKY_HREF_ATTRIBUTE}]`)
          ?.getAttribute(STICKY_HREF_ATTRIBUTE);
        if (!href || stickyLinkHref(href) !== href) return;
        event.preventDefault();
        window.open(href, '_blank', 'noopener,noreferrer');
      };

      const onSelectionChange = () => {
        const selection = readSelection(root);
        if (!selection) return;
        lastSelection.current = selection;
        if (
          pending.current &&
          (selection.start !== selection.end || selection.start !== pending.current.at)
        ) {
          pending.current = null;
        }
        reportFormat();
      };

      // Only the words: formatting from wherever they were copied is not a
      // sticky's, and nothing pasted is ever read as markup. A web address and
      // nothing else is the one exception: pasted over words, it links them,
      // and pasted anywhere else it goes in as a link to itself.
      const onPaste = (event: ClipboardEvent) => {
        event.preventDefault();
        if (props.current.readOnly) return;
        const length = shown.current.text.length;
        const selection = readSelection(root) ??
          lastSelection.current ?? { start: length, end: length };
        const text = (event.clipboardData?.getData('text/plain') ?? '').replace(/\r\n?/g, '\n');
        const href = pastedLink(text);
        if (href && link(selection, href, text.trim())) return;
        insert(selection, text, 'paste');
      };

      // Dropped text would arrive with whatever formatting it had.
      const onDrop = (event: DragEvent) => event.preventDefault();

      root.addEventListener('beforeinput', onBeforeInput);
      root.addEventListener('input', onInput);
      root.addEventListener('compositionend', onInput);
      root.addEventListener('keydown', onKeyDown);
      root.addEventListener('click', onClick);
      root.addEventListener('paste', onPaste);
      root.addEventListener('drop', onDrop);
      root.ownerDocument.addEventListener('selectionchange', onSelectionChange);
      return () => {
        root.removeEventListener('beforeinput', onBeforeInput);
        root.removeEventListener('input', onInput);
        root.removeEventListener('compositionend', onInput);
        root.removeEventListener('keydown', onKeyDown);
        root.removeEventListener('click', onClick);
        root.removeEventListener('paste', onPaste);
        root.removeEventListener('drop', onDrop);
        root.ownerDocument.removeEventListener('selectionchange', onSelectionChange);
      };
      // Attached once; everything that changes is read through refs.
    }, []);

    // Not over an empty list item, where the bullet would sit under it.
    const empty = value.text.length === 0 && !value.lines[0];

    return (
      <div ref={wrapperRef} className="relative">
        <div
          ref={frameRef}
          className="relative overflow-hidden transition-[height] duration-150 ease-out motion-reduce:transition-none"
        >
          {empty && placeholder ? (
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-0 top-0 opacity-35 ${className}`}
              style={style}
            >
              {placeholder}
            </div>
          ) : null}
          <div
            id={id}
            ref={rootRef}
            role="textbox"
            aria-multiline="true"
            aria-label={label}
            aria-placeholder={placeholder}
            aria-readonly={readOnly || undefined}
            contentEditable={!readOnly}
            suppressContentEditableWarning
            spellCheck
            // A slim bar on the paper rather than the system's own, and a
            // scroll that stops at the end of the note rather than carrying on
            // to whatever is behind it.
            className={`wrap-break-word whitespace-pre-wrap outline-none ${
              maxHeight
                ? 'overflow-y-auto overscroll-contain [scrollbar-color:rgba(8,12,21,0.22)_transparent] scrollbar-thin'
                : ''
            } ${className}`}
            style={{ ...style, ...(maxHeight ? { maxHeight } : {}) }}
          />
        </div>
        {linkEditor && !readOnly ? (
          <LinkEditor
            key={linkEditor.opened}
            state={linkEditor}
            error={linkError}
            onApply={applyLink}
            onRemove={removeLink}
            onCancel={closeLink}
          />
        ) : null}
      </div>
    );
  },
);

interface ButtonSpec {
  label: string;
  shortcut: string;
  Icon: LucideIcon;
}

const STYLE_BUTTONS: (ButtonSpec & { style: StickyMarkStyle })[] = [
  { style: 'bold', label: 'Bold', shortcut: 'Ctrl+B', Icon: Bold },
  { style: 'italic', label: 'Italic', shortcut: 'Ctrl+I', Icon: Italic },
  { style: 'underline', label: 'Underline', shortcut: 'Ctrl+U', Icon: Underline },
  { style: 'strike', label: 'Strikethrough', shortcut: 'Ctrl+Shift+X', Icon: Strikethrough },
];

const LIST_BUTTONS: (ButtonSpec & { style: StickyLineStyle })[] = [
  { style: 'bullet', label: 'Bulleted list', shortcut: 'Ctrl+Shift+8', Icon: List },
  { style: 'number', label: 'Numbered list', shortcut: 'Ctrl+Shift+7', Icon: ListOrdered },
];

function FormatButton({
  label,
  shortcut,
  Icon,
  on,
  disabled,
  onPress,
}: ButtonSpec & {
  /** Whether it is on, for a button that is; left out for one that only acts. */
  on?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      title={`${label} (${shortcut})`}
      disabled={disabled}
      // Keeps focus, and so the selection, in the note.
      onPointerDown={(event) => event.preventDefault()}
      onClick={onPress}
      className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-rt-ink focus-visible:outline-none disabled:opacity-35 ${
        on
          ? 'bg-rt-ink text-white'
          : 'text-rt-ink/75 enabled:hover:bg-rt-ink/8 enabled:hover:text-rt-ink'
      }`}
    >
      <Icon aria-hidden="true" size={15} strokeWidth={on ? 2.6 : 2.2} />
    </button>
  );
}

const Divider = () => <span aria-hidden="true" className="mx-1 h-5 w-px bg-rt-ink/15" />;

/**
 * Bold, italic, underline, strikethrough, links, lists and nesting, for a
 * `RichStickyField`.
 *
 * Pressing a button does not take focus from the note, so the selection it
 * applies to is still there, and typing carries straight on after it.
 */
export function StickyFormatBar({
  field,
  active,
  disabled = false,
  className = '',
}: {
  field: RefObject<RichStickyFieldHandle | null>;
  active: StickyFormat;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className={`flex flex-wrap items-center gap-1 ${className}`}
    >
      {STYLE_BUTTONS.map(({ style, ...spec }) => (
        <FormatButton
          key={style}
          {...spec}
          on={active.styles.includes(style)}
          disabled={disabled}
          onPress={() => field.current?.toggle(style)}
        />
      ))}
      <Divider />
      <FormatButton
        label="Link"
        shortcut="Ctrl+K"
        Icon={Link2}
        on={active.link !== null}
        disabled={disabled}
        onPress={() => field.current?.openLink()}
      />
      <Divider />
      {LIST_BUTTONS.map(({ style, ...spec }) => (
        <FormatButton
          key={style}
          {...spec}
          on={active.list === style}
          disabled={disabled}
          onPress={() => field.current?.toggleList(style)}
        />
      ))}
      <FormatButton
        label="Decrease indent"
        shortcut="Shift+Tab"
        Icon={ListIndentDecrease}
        disabled={disabled || !active.canOutdent}
        onPress={() => field.current?.indent(-1)}
      />
      <FormatButton
        label="Increase indent"
        shortcut="Tab"
        Icon={ListIndentIncrease}
        disabled={disabled || !active.canIndent}
        onPress={() => field.current?.indent(1)}
      />
    </div>
  );
}
