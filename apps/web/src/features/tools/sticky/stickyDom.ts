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
