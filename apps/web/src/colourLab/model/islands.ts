/**
 * Content that stays light when the app goes dark.
 *
 * A sticky is paper, a drawing is on a white sheet, and a diagram's colours are
 * chosen against white. Darkening them would change what the author made, and
 * stored drawings carry their colours inside the file where no stylesheet can
 * reach. So the app around them goes dark and these stay as they are, the way
 * paper does on a dark desk.
 *
 * Found by what the app already marks them with, so none of it needs the app to
 * change. Each is the outermost element of its kind of content.
 */
export const ISLAND_SELECTORS: readonly string[] = [
  // A card on the board, in the recap, in a list, and its enlarged view.
  'article:has([data-card-plate], [data-sticky-note])',
  '[data-proposal-card]',
  '[role="dialog"][aria-label*=" by "]',
  // The sticky being written: the popup is the paper.
  '[role="dialog"][aria-labelledby="sticky-composer-label"]',
  // The two drawing surfaces, with the surround the diagram draws round its sheet.
  'div:has(> svg[aria-label="Drawing canvas"])',
  'svg:has([data-testid="diagram-sheet"])',
  // The pen colours of the drawing tool. A swatch shows the colour the pen draws in, and the drawing
  // is on a white sheet whatever the page is, so the swatch is what it says: not darkened with the page.
  'button[aria-label$=" ink"]',
  // The little notes in a session's thumbnail on the dashboard: stickies, so paper, on a tile that is not.
  'span.absolute.rounded-xl[style*="rotate"]',
  // What the assistant shows it has made.
  '.rt-assistant-sticky',
  '.rt-assistant-card-well',
  '.rt-assistant-diagram-fit',
];

export const ISLAND_SELECTOR = ISLAND_SELECTORS.join(', ');

/** The island an element is inside, if any. */
export function islandOf(element: Element): Element | null {
  try {
    return element.closest(ISLAND_SELECTOR);
  } catch {
    return null;
  }
}
