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

export const CARD_RADIUS = '12px';
export const STICKY_RADIUS = '14px';

/** Soft light border + shadow (drawing / diagram / sticky edges). */
export const CARD_SHADOW = '0 2px 8px rgba(8,12,21,0.08), 0 1px 2px rgba(8,12,21,0.04)';

/** Sticky fills from the RoundTable palette — soft tinted edges. */
export const STICKY_THEMES: Record<StickyColor, { bg: string; border: string; ink: string }> = {
  yellow: { bg: '#FDF4E5', border: '#F1C881', ink: '#080C15' },
  pink: { bg: '#F9EEF2', border: '#E0A33C', ink: '#080C15' },
  blue: { bg: '#EEF2F4', border: '#8CA4AC', ink: '#080C15' },
  green: { bg: '#EEF4F0', border: '#4D6A74', ink: '#080C15' },
};

/**
 * Ring marking a card the viewer authored (F16). An outline rather than a fill
 * swap: a sticky's colour is the author's choice and carries meaning, so
 * ownership is drawn around the card instead of painted over it.
 */
export const OWNED_OUTLINE = '2px solid #E0A33C';
export const OWNED_OUTLINE_OFFSET = '2px';

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
export const DOT_COLOR = 'rgba(140,164,172,0.38)';
