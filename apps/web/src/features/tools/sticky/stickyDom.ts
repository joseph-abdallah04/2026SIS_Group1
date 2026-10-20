import {
  linkRuns,
  segmentStyle,
  stickyBlocks,
  type StickyBlock,
  type StickyContent,
  type StickySegment,
} from './stickyMarks';

/** Marks a run the editor or the probe drew, and which styles it is in. */
export const STICKY_STYLES_ATTRIBUTE = 'data-sticky-styles';

/** Marks a link the editor or the probe drew, and the address it opens. */
export const STICKY_HREF_ATTRIBUTE = 'data-sticky-href';

/**
 * Every line of a sticky is one of these. A line in a list carries `data-list`,
 * how deeply it is nested `data-level`, and a numbered one `data-number`; the
 * stylesheet hangs the bullet or number in the margin from them, so a long item
 * wraps under its own words.
 */
export const STICKY_LINE_CLASS = 'rt-sticky-line';

/** How a link looks, wherever it is drawn. */
export const STICKY_LINK_CLASS = 'rt-sticky-link';

/** The attributes a line is drawn with, shared with `StickyText`. */
export function lineAttributes(block: StickyBlock): Record<string, string> {
  return {
    ...(block.list ? { 'data-list': block.list } : {}),
    ...(block.list && block.level > 0 ? { 'data-level': String(block.level) } : {}),
    ...(block.label !== null ? { 'data-number': block.label } : {}),
  };
}

/** The room a one-character marker ("1.", "a.", "•") takes, in em. */
const MARKER_WIDTH = 1.15;

/** The gap between a marker and its words, in em. */
const MARKER_GAP = 0.35;

/** How far a nested item's marker starts before its parent's words, in em. */
const NESTED_OVERLAP = 0.25;

/**
 * The room a list's markers take, in em: wide enough for the longest label it
 * has ("10.", "viii."), at roughly the width of a bold figure a character.
 */
function markerWidth(labelWidth: number | null): number {
  return labelWidth === null ? MARKER_WIDTH : Math.max(MARKER_WIDTH, labelWidth * 0.6 + 0.3);
}

const em = (value: number) => `${Number(value.toFixed(3))}em`;

/**
 * Where a list line's marker and words sit, as the custom properties the
 * stylesheet reads: room for its own list's widest label, and an indent that
 * starts each level just past where the list it is nested in starts its words.
 */
export function lineStyle(block: StickyBlock): Record<string, string> | undefined {
  if (!block.list) return undefined;
  const indent = block.outerLabelWidths.reduce<number>(
    (total, labelWidth) => total + markerWidth(labelWidth) + MARKER_GAP - NESTED_OVERLAP,
    0,
  );
  return {
    '--rt-list-indent': em(indent),
    '--rt-marker-width': em(markerWidth(block.labelWidth)),
  };
}

function runNode(segment: StickySegment): Node {
  if (segment.styles.length === 0) return document.createTextNode(segment.text);
  const span = document.createElement('span');
  span.setAttribute(STICKY_STYLES_ATTRIBUTE, segment.styles.join(' '));
  const style = segmentStyle(segment.styles, segment.href !== undefined);
  if (style.fontWeight) span.style.fontWeight = String(style.fontWeight);
  if (style.fontStyle) span.style.fontStyle = style.fontStyle;
  if (style.textDecorationLine) span.style.textDecorationLine = style.textDecorationLine;
  span.textContent = segment.text;
  return span;
}

/**
 * Writes a note into an element, formatted, as plain DOM: one element a line.
 *
 * For the two places that set a note outside React: the probe that sizes a
 * sticky, and the editor, which draws its own content so it can put the caret
 * back where it was. Both set a note the way `StickyText` does, from the same
 * blocks and the same `segmentStyle`, so a note measures, edits and shows
 * exactly the same.
 *
 * A link here is a span that looks like one, not an anchor: nothing drawn here
 * is ever meant to be followed, and an anchor inside an editable note is one a
 * stray press could open.
 *
 * Only text nodes, spans and line elements. Nothing a peer wrote is ever
 * parsed as markup.
 */
export function fillWithNote(element: HTMLElement, content: StickyContent) {
  element.replaceChildren(
    ...stickyBlocks(content).map((block) => {
      const line = document.createElement('div');
      line.className = STICKY_LINE_CLASS;
      for (const [name, value] of Object.entries(lineAttributes(block))) {
        line.setAttribute(name, value);
      }
      for (const [name, value] of Object.entries(lineStyle(block) ?? {})) {
        line.style.setProperty(name, value);
      }
      // An empty line still needs its height, and somewhere for a caret.
      if (block.segments.length === 0) line.append(document.createElement('br'));
      for (const run of linkRuns(block.segments)) {
        if (run.href === null) {
          line.append(...run.segments.map(runNode));
          continue;
        }
        const link = document.createElement('span');
        link.className = STICKY_LINK_CLASS;
        link.setAttribute(STICKY_HREF_ATTRIBUTE, run.href);
        link.title = run.href;
        link.append(...run.segments.map(runNode));
        line.append(link);
      }
      return line;
    }),
  );
}
