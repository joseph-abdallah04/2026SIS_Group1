/**
 * A long paragraph: room for a real idea with its reasons, still a note.
 *
 * Ordinary prose this long fits the largest sticky. A note that does not — many
 * short lines, or a lot of it in bold — makes that sticky a little taller, so
 * this limit is a count of characters. Lines have their own, below.
 */
export const STICKY_TEXT_LIMIT = 500;
/**
 * Lines a sticky may have, blank ones included. Enough for a heading over a
 * good list with room to breathe, without letting Enter held down fill a note
 * with nothing but empty lines.
 */
export const STICKY_MAX_LINES = 20;
export const DRAWING_SVG_LIMIT = 100_000;
export const DIAGRAM_NODE_LIMIT = 100;
export const DIAGRAM_EDGE_LIMIT = 200;

export type PreparedStickyText = { ok: true; text: string } | { ok: false; error: string };

/**
 * Checks a sticky before it is proposed, and hands back exactly what was typed.
 *
 * Whitespace is the writer's to decide: spaces lining words up, a blank line
 * between two thoughts, an indent, a gap left on purpose. None of it is trimmed
 * or collapsed. The one thing refused is a note of nothing but whitespace,
 * which would land on the board as a blank sticky.
 */
export function prepareStickyText(value: string): PreparedStickyText {
  const text = value;

  if (!text.trim()) {
    return { ok: false, error: 'Write something before proposing this sticky.' };
  }

  if (text.length > STICKY_TEXT_LIMIT) {
    return {
      ok: false,
      error: `Keep your sticky to ${STICKY_TEXT_LIMIT} characters or fewer.`,
    };
  }

  if (text.split('\n').length > STICKY_MAX_LINES) {
    return { ok: false, error: `Keep your sticky to ${STICKY_MAX_LINES} lines or fewer.` };
  }

  return { ok: true, text };
}
