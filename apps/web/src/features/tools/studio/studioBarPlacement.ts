// Where the properties bar sits.
//
// The bar belongs to the selection, so it is held just above it and centred on
// it. Three things can go wrong with that, and all three are the caller's
// problem to avoid rather than the user's to work around: it can run off the
// top, off the side, or — for a selection tall enough to fill the canvas — have
// nowhere clear to go at all.
//
// Pure arithmetic over rectangles, so every edge case is testable without a
// browser. Coordinates are in the canvas's own client space: the caller
// measures once and hands both rectangles over.

export interface PlacementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BarPlacement {
  x: number;
  y: number;
  /** Which side of the selection it ended up on, for the caller to style. */
  side: 'above' | 'below';
}

/** Breathing room from the selection and from the edges of the canvas. */
const GAP = 8;

export function placePropertiesBar(
  selection: PlacementRect,
  bar: { width: number; height: number },
  viewport: PlacementRect,
  gap = GAP,
): BarPlacement {
  // Centred on the selection, then pulled back inside the canvas. Clamping the
  // low edge last means a bar wider than the canvas is left-aligned rather than
  // pushed off to the right.
  const centred = selection.x + selection.width / 2 - bar.width / 2;
  const maxX = viewport.x + viewport.width - gap - bar.width;
  const x = Math.max(viewport.x + gap, Math.min(centred, maxX));

  const above = selection.y - gap - bar.height;
  const below = selection.y + selection.height + gap;
  const topLimit = viewport.y + gap;
  const bottomLimit = viewport.y + viewport.height - gap - bar.height;

  // Above by preference: it is out of the way of everything the selection is
  // near, and it does not move when the selection grows downwards.
  if (above >= topLimit) return { x, y: above, side: 'above' };
  // No room above, so drop underneath — still clear of the selection itself.
  if (below <= bottomLimit) return { x, y: below, side: 'below' };
  // A selection tall enough to leave no clear side at all. Staying on screen
  // matters more than staying off the selection: a bar that has scrolled out of
  // the canvas cannot be used, while one overlapping a shape still can.
  return { x, y: topLimit, side: 'above' };
}
