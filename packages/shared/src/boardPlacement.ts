/**
 * Where cards go on a board, shared by the browser and the server.
 *
 * The browser picks where a new card would like to land — the middle of what
 * its author is looking at, beside the card it extends, where an image was
 * dropped — and the server makes the final call, clear of every card on the
 * board, while it holds the board's lock. Both need the same idea of how big a
 * card is and what counts as clear, or a spot one of them thought free would
 * not be free to the other.
 */
import type { ProposalType } from './index.js';

/**
 * The pinboard itself, in board units. A fixed sheet rather than an endless
 * plane, and every card is clamped inside it.
 */
export const BOARD_SIZE = { width: 4000, height: 2500 } as const;

/**
 * How wide each kind of card is. A sticky grows with its note from this, the
 * smallest, to `STICKY_MAX_WIDTH`; the others are always this wide.
 */
export const CARD_WIDTH: Record<ProposalType, number> = {
  sticky: 217,
  drawing: 250,
  diagram: 300,
  image: 280,
};

/** The largest sticky: fourteen lines of note. */
export const STICKY_MAX_WIDTH = 339;

/**
 * What an artwork card is under its four-by-three plate: the byline strip and
 * the card's border, measured in the browser.
 */
const ARTWORK_FOOT_PX = 36;
/** The card's own border, which the plate sits inside. */
const CARD_BORDER_PX = 2;

/** Space left between cards that are placed. */
export const CARD_GAP = 28;
/** Where a card goes on an otherwise empty board with nothing to centre on. */
export const BOARD_INSET = 32;

/** How much of the board a card covers. */
export interface CardSize {
  width: number;
  height: number;
}

export interface CardRect extends CardSize {
  x: number;
  y: number;
}

/** A sticky's width, held to the sizes a sticky can be. */
export function clampStickyWidth(width: number): number {
  return Math.round(Math.min(Math.max(width, CARD_WIDTH.sticky), STICKY_MAX_WIDTH));
}

/**
 * How much of the board a card of this kind covers.
 *
 * A sticky is square, as wide as its note needs; with no width to go on — a
 * card stored before widths were — it is taken as the largest, so nothing is
 * placed where a big one might reach. Artwork cards are their plate, a
 * four-by-three area the card's width across, over the byline.
 */
export function cardFootprint(type: ProposalType, stickyWidth?: number | null): CardSize {
  if (type === 'sticky') {
    const width = clampStickyWidth(stickyWidth ?? STICKY_MAX_WIDTH);
    return { width, height: width };
  }
  const width = CARD_WIDTH[type];
  return { width, height: Math.round(((width - CARD_BORDER_PX) * 3) / 4) + ARTWORK_FOOT_PX };
}

/** Whether two cards touch, or come closer than the gap placed cards keep. */
function crowds(a: CardRect, b: CardRect): boolean {
  return !(
    a.x + a.width + CARD_GAP <= b.x ||
    b.x + b.width + CARD_GAP <= a.x ||
    a.y + a.height + CARD_GAP <= b.y ||
    b.y + b.height + CARD_GAP <= a.y
  );
}

/** Keeps a coordinate on the sheet: never negative, never past the far edge. */
function onSheet(value: number, max: number): number {
  return Math.round(Math.min(Math.max(value, 0), Math.max(0, max)));
}

/**
 * Grid offsets on the ring `r` steps out from the centre, nearest first by
 * the distance on the board: a step across and a step down are not the same
 * length when the card is wider than it is tall.
 */
function ring(r: number, stepX: number, stepY: number): ReadonlyArray<{ dx: number; dy: number }> {
  if (r === 0) return [{ dx: 0, dy: 0 }];
  const cells: { dx: number; dy: number }[] = [];
  for (let dx = -r; dx <= r; dx += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) === r) cells.push({ dx, dy });
    }
  }
  // Sort by true distance so a ring fills outwards evenly rather than
  // preferring its corners.
  return cells.sort(
    (a, b) => Math.hypot(a.dx * stepX, a.dy * stepY) - Math.hypot(b.dx * stepX, b.dy * stepY),
  );
}

/** How far out to look before giving up and going below everything. */
const MAX_RINGS = 8;

/**
 * The nearest spot to `origin` where a card of `size` is clear of `cards`.
 *
 * Tries `origin` itself first, so a spot that is already clear is kept exactly,
 * then walks outwards this card's own width and height at a time, plus the gap.
 * Stepping by the largest kind of card instead spread small stickies out as if
 * each were a diagram, and the board grew away from the view far faster than
 * it filled. Always on the sheet. On a board too crowded around `origin` to
 * find one, it goes below everything.
 */
export function findClearSpot(
  cards: readonly CardRect[],
  size: CardSize,
  origin: { x: number; y: number },
): { x: number; y: number } {
  const stepX = size.width + CARD_GAP;
  const stepY = size.height + CARD_GAP;
  const maxX = BOARD_SIZE.width - size.width;
  const maxY = BOARD_SIZE.height - size.height;

  for (let r = 0; r <= MAX_RINGS; r += 1) {
    for (const { dx, dy } of ring(r, stepX, stepY)) {
      const candidate = {
        x: onSheet(origin.x + dx * stepX, maxX),
        y: onSheet(origin.y + dy * stepY, maxY),
        ...size,
      };
      if (cards.every((card) => !crowds(candidate, card))) {
        return { x: candidate.x, y: candidate.y };
      }
    }
  }

  const lowest = cards.reduce(
    (bottom, card) => Math.max(bottom, card.y + card.height),
    BOARD_INSET - CARD_GAP,
  );
  return { x: onSheet(origin.x, maxX), y: onSheet(lowest + CARD_GAP, maxY) };
}
