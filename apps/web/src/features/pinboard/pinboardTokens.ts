/** F14 pinboard tokens — RoundTable soft style, project palette only. */

import type { StickyColor } from '@roundtable/shared';

/**
 * Zoom stops, largest first. Above 100% for reading a dense corner of the
 * board; down to 25% for finding your way around a big one.
 */
export const ZOOM_LEVELS = [
  400, 350, 300, 250, 200, 175, 150, 125, 110, 100, 90, 80, 70, 60, 50, 40, 30, 25,
] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

/**
 * Card styling. The project palette throughout — the Organic wireframes
 * supplied the card's *structure* (body, then a footer carrying the author and
 * the time), not its colours.
 */
export const CARD_INK = '#080C15';
/** Edge for cards with no colour of their own; a sticky uses its theme's. */
export const CARD_BORDER = '#CFCFCF';
export const CARD_RADIUS = '12px';
export const CARD_SHADOW = '0 2px 8px rgba(8,12,21,0.08), 0 1px 2px rgba(8,12,21,0.04)';

/** Soft accent for the leader mark in a card's footer. */
export const OWNED_INK = '#7A6A4C';

/** Diagram preview blocks, in the same greys the old node boxes used. */
export const NODE_BORDER = '1px solid #CFCFCF';
export const NODE_PLACEHOLDER_BORDER = '1px dashed #CFCFCF';
export const NODE_ROOT_BORDER = '1px solid #8CA4AC';
export const NODE_ROOT_FILL = '#EEF2F4';

/** Plate behind a drawing's artwork. */
export const THUMB_BACKGROUND = '#F7F7F8';

/**
 * Sticky paper.
 *
 * On the board every card now shares one ink-coloured border, so the author's
 * colour choice shows only as the paper it is written on. `border` is kept for
 * the creative tools' own sticky editor, which draws its swatches from here.
 */
export const STICKY_THEMES: Record<StickyColor, { bg: string; border: string }> = {
  yellow: { bg: '#FDF4E5', border: '#F1C881' },
  pink: { bg: '#F9EEF2', border: '#E0A33C' },
  blue: { bg: '#EEF2F4', border: '#8CA4AC' },
  green: { bg: '#EEF4F0', border: '#4D6A74' },
};

/** Kept for the tools' sticky editor; board cards use `CARD_RADIUS`. */
export const STICKY_RADIUS = '14px';

/** Intrinsic widths — types differ on purpose. */
export const CARD_WIDTH: Record<'sticky' | 'drawing' | 'diagram', number> = {
  sticky: 210,
  drawing: 250,
  diagram: 300,
};

/**
 * Zoom is a property of the view, not of the cards: the board is drawn once at
 * its natural size and the whole scene is scaled, exactly as Figma, Miro and
 * Lucidchart do it. So a level is simply a scale factor, and the label matches
 * it — 80% really is 0.8 of natural size.
 *
 * Nothing below this line may be consulted while rendering a card. If a card
 * asked the zoom level how big to be, zooming would re-lay-out the board rather
 * than magnify it, and text would reflow as you zoomed.
 */
export const ZOOM_SCALE = Object.fromEntries(
  ZOOM_LEVELS.map((level) => [level, level / 100]),
) as Record<ZoomLevel, number>;

/**
 * The pinboard itself, in board units. A fixed sheet rather than an endless
 * plane: zooming out shows the whole board getting smaller, which is what
 * zooming out means, instead of revealing more and more empty space and making
 * the board look like it grew.
 *
 * Big enough that a session never runs out of room — roughly nineteen sticky
 * notes across — and every card is clamped inside it, so the board a viewer
 * sees at 25% is all the board there is.
 */
export const BOARD_SIZE = { width: 4000, height: 2500 } as const;

/**
 * Desk showing around the board, in *screen* pixels rather than board units.
 *
 * A margin in board units would magnify with everything else, so the desk would
 * be a hairline when zoomed out and a wide moat at 400%. Holding it in screen
 * pixels keeps the board framed the same way at every zoom.
 */
export const DESK_MARGIN = 64;

/** The dotted grid, in board units, so it magnifies with everything else. */
export const DOT_SPACING = 22;
export const DOT_RADIUS = 1.5;
export const DOT_COLOR = 'rgba(32, 30, 29, 0.16)';
