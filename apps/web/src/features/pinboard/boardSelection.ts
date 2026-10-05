import { BOARD_SIZE, type CardRect } from '@roundtable/shared';

/** A rectangle on the board, from where a marquee began to where it is now. */
export interface MarqueeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The rectangle between two corners, whichever way the pointer was dragged. */
export function rectBetween(a: { x: number; y: number }, b: { x: number; y: number }): MarqueeRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/**
 * The cards a marquee touches.
 *
 * Touching rather than wholly inside: a box drawn across a cluster should pick
 * up the cards it crosses, not only the ones it happened to swallow whole,
 * which is how most canvases feel when sweeping across a crowded area.
 */
export function cardsInRect(
  cards: ReadonlyArray<CardRect & { id: string }>,
  rect: MarqueeRect,
): string[] {
  return cards
    .filter(
      (card) =>
        card.x < rect.x + rect.width &&
        card.x + card.width > rect.x &&
        card.y < rect.y + rect.height &&
        card.y + card.height > rect.y,
    )
    .map((card) => card.id);
}

/**
 * How far a group may actually move, given how far the pointer asked it to.
 *
 * The group moves as one: if any card would leave the sheet, the whole move
 * stops at the edge, so the cards keep their arrangement rather than piling up
 * against the border one by one.
 */
export function clampGroupDelta(
  cards: readonly CardRect[],
  dx: number,
  dy: number,
): { dx: number; dy: number } {
  if (cards.length === 0) return { dx: 0, dy: 0 };
  const left = Math.min(...cards.map((card) => card.x));
  const top = Math.min(...cards.map((card) => card.y));
  const right = Math.max(...cards.map((card) => card.x + card.width));
  const bottom = Math.max(...cards.map((card) => card.y + card.height));
  return {
    dx: Math.min(Math.max(dx, -left), BOARD_SIZE.width - right),
    dy: Math.min(Math.max(dy, -top), BOARD_SIZE.height - bottom),
  };
}
