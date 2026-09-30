// How the studio draws its own chrome — selection frames, grips, previews,
// targets — as opposed to the artwork on the canvas.
//
// These used to be literals scattered through the editor, and they had drifted:
// four dash patterns, corner radii of 0, 3, 4, 5, 7 and 9, a slate outline here
// and an amber one there for the same idea, and every size in scene units, so
// a frame that looked right at 100% was a thick blunt band at 400%. One place
// for the values means one look, and sizes in CSS pixels mean the same look at
// every zoom: the editor multiplies them by one pixel in scene units.

/** The accent: selection, grips, snapping. The brand's `rt-secondary`. */
export const STUDIO_ACCENT = '#E0A33C';
/** Previews of what is about to be placed. The brand's `rt-cool-deep`. */
export const STUDIO_COOL = '#4D6A74';
/** The accent darkened, for the one control that takes something away. */
export const STUDIO_ACCENT_DEEP = '#8A5B14';
/** The accent as a wash over an area: a marquee, a range of cells. */
export const STUDIO_ACCENT_WASH = 'rgba(224,163,60,0.14)';

/** Chrome sizes, in CSS pixels. */
export const CHROME = {
  /** How far a frame sits outside what it surrounds. */
  frameOutset: 5,
  frameRadius: 6,
  frameStroke: 1.5,
  frameDash: [4, 3],
  /** A member of a group: a quiet outline, not a frame to pull. */
  memberStroke: 1,
  memberOpacity: 0.6,
  /** Something a drop or a snap will land on: solid, and heavier. */
  targetStroke: 2,
  /** Square grips on a frame's corners. */
  gripSize: 7,
  gripReach: 10,
  gripStroke: 1.5,
  /** Round grips on a point: an arrow's ends and bend, a path's anchors. */
  pointRadius: 4.5,
  pointReach: 10,
  /** A bezier handle's end, and the line out to it. */
  handleDot: 3,
  handleLine: 1,
  /** The quadrant outside each corner that turns an element. */
  rotateReach: 22,
  /** A preview of what is about to be placed. */
  ghostStroke: 1.5,
  ghostDash: [4, 3],
  ghostOpacity: 0.55,
  marqueeStroke: 1,
  marqueeDash: [4, 3],
} as const;

/** A dash pattern in pixels, as scene units for the current zoom. */
export function chromeDash(pattern: readonly number[], pixel: number): string {
  return pattern.map((length) => length * pixel).join(' ');
}

/** The one shadow every floating panel in the studio casts. */
export const STUDIO_PANEL_SHADOW = 'shadow-[0_6px_24px_rgba(8,12,21,0.14)]';
