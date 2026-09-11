/** F14 pinboard tokens — RoundTable soft style, project palette only. */

import type { StickyColor } from '@roundtable/shared';

/**
 * Zoom stops, largest first. Above 100% for reading a dense corner of the
 * board; down to 25% for finding your way around a big one.
 *
 * The steps get finer towards the middle. A fixed step is not a fixed change:
 * ten points off 400% is a barely visible nudge, while ten points off 30% is a
 * third of the board. Spacing them by where the eye actually notices keeps a
 * press feeling like the same size move wherever you are on the ladder, and
 * puts the finest control where people spend their time, either side of
 * natural size.
 */
// prettier-ignore
export const ZOOM_LEVELS = [
  // Coarse at the far end, where a step is a big move and nobody is reading.
  400, 350,
  // Twenty-fives through the range you magnify a corner of the board in.
  300, 275, 250, 225,
  // Tens either side of natural size, which is where most zooming happens.
  200, 190, 180, 170, 160, 150, 140, 130, 120, 110,
  100,
  // Fives on the way out: below natural size a ten-point step throws away a
  // tenth of the board at once, and fitting a card into view needs finer
  // control than that.
  95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25,
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
export const CARD_RADIUS = '16px';
export const CARD_SHADOW = '0 2px 8px rgba(8,12,21,0.08), 0 1px 2px rgba(8,12,21,0.04)';

/** Soft accent for the leader mark in a card's footer. */
export const OWNED_INK = '#7A6A4C';

/**
 * The slate a chip you reacted with is shaded in.
 *
 * The board's own blue-grey (`#8CA4AC`), the one already ringing the sheet and
 * edging a blue sticky, rather than the amber accent every button in the app
 * uses.
 *
 * Solid, not translucent. A chip straddles the card's bottom edge, so a
 * see-through fill picked up the paper above the edge and the board's dots
 * below it, and the chip read as two halves.
 *
 * Both are that slate mixed down over white, the fill at about a seventh
 * strength and the edge at a little over two fifths. Light enough that a row
 * of them settles into the card rather than banding across its bottom edge,
 * dark enough that a reacted chip is still plainly not a white one.
 */
export const REACTION_ON_FILL = '#EFF2F3';
export const REACTION_ON_BORDER = '#CFD9DC';

/**
 * What an unpressed chip does under the pointer.
 *
 * The same slate again, so hovering previews the colour that pressing gives
 * rather than flashing an unrelated one on the way to it. Kept a clear step
 * lighter than `REACTION_ON_FILL`: close enough to read as the same idea, far
 * enough that hovering a chip you have not pressed never looks as though you
 * have.
 */
export const REACTION_HOVER_FILL = '#F4F6F7';

/**
 * What the bin does under the pointer.
 *
 * The one red in the app, and it is here because removing a proposal is the
 * one action on a card that cannot be undone. Every other control on the board
 * hovers to the slate; this one should not, or the difference between tidying
 * a card and destroying it would be a matter of which icon you happened to be
 * over.
 */
export const REMOVE_HOVER_FILL = '#FDECEC';
export const REMOVE_HOVER_BORDER = '#EFBDBD';
export const REMOVE_HOVER_INK = '#A93B34';

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

/**
 * Square corners, because a sticky note has square corners.
 *
 * Every other card on the board is a rounded panel. A sticky is meant to read
 * as a piece of paper somebody stuck there, and rounding it is the single
 * change that makes it read as a UI card instead.
 */
export const STICKY_RADIUS = '0px';

/**
 * The shadow a sticky casts.
 *
 * Weighted downward rather than spread evenly like `CARD_SHADOW`: paper is lit
 * from above and lifts slightly at its bottom edge, so the shadow gathers under
 * it. An even shadow reads as a floating panel, which is what the other cards
 * are and this one is not.
 */
export const STICKY_SHADOW =
  '0 7px 10px -5px rgba(8,12,21,0.30), 0 2px 3px -1px rgba(8,12,21,0.16)';

/** Intrinsic widths — types differ on purpose. */
export const CARD_WIDTH: Record<'sticky' | 'drawing' | 'diagram', number> = {
  sticky: 210,
  drawing: 250,
  diagram: 300,
};

/**
 * A sticky is square, so it is as tall as it is wide.
 *
 * Unlike the other cards it does not grow to fit its contents: a pad of notes
 * comes in one size, and a wall of them reads as a wall precisely because they
 * all match. Text that would overflow is clamped rather than allowed to
 * stretch the paper.
 */
export const STICKY_SIZE = CARD_WIDTH.sticky;

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
