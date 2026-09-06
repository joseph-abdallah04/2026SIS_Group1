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
