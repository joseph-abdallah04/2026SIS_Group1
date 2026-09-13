/**
 * Ten lines of ordinary prose on the largest sticky, with room to spare.
 *
 * Measured in Chrome with Inter: nine lines at a sticky's width hold at most
 * 275 characters of real prose, and ten hold at least 307. A cap between the
 * two means a note at the cap needs all ten lines, so it ends at the bottom of
 * the largest square, and never needs an eleventh. Set low in that window, so
 * prose whose words wrap badly still runs out of count before it runs out of
 * paper, and the counter is what tells somebody their note is full.
 */
export const STICKY_TEXT_LIMIT = 280;
export const DRAWING_SVG_LIMIT = 100_000;
export const DIAGRAM_NODE_LIMIT = 100;
export const DIAGRAM_EDGE_LIMIT = 200;

export type PreparedStickyText = { ok: true; text: string } | { ok: false; error: string };

export function prepareStickyText(value: string): PreparedStickyText {
  const text = value.trim();

  if (!text) {
    return { ok: false, error: 'Write something before proposing this sticky.' };
  }

  if (text.length > STICKY_TEXT_LIMIT) {
    return {
      ok: false,
      error: `Keep your sticky to ${STICKY_TEXT_LIMIT} characters or fewer.`,
    };
  }

  return { ok: true, text };
}
