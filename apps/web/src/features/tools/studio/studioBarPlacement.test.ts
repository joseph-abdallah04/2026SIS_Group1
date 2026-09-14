import { describe, expect, it } from 'vitest';

import { BAR_GAP, placePropertiesBar } from './studioBarPlacement';

const viewport = { x: 0, y: 0, width: 900, height: 600 };
const bar = { width: 240, height: 40 };

describe('where the properties bar goes', () => {
  it('leaves room for what an element draws outside its own bounds', () => {
    // A table's insert and remove badges sit above its top edge and left of
    // its first column. The bar used to be placed close enough to cover them.
    expect(BAR_GAP).toBeGreaterThanOrEqual(21);
  });

  it('sits just above the selection, centred on it', () => {
    const placed = placePropertiesBar({ x: 300, y: 200, width: 200, height: 100 }, bar, viewport);
    expect(placed.side).toBe('above');
    expect(placed.y).toBe(200 - BAR_GAP - bar.height);
    // Centred: the bar's middle lines up with the selection's.
    expect(placed.x + bar.width / 2).toBe(400);
  });

  it('drops below when there is no room above', () => {
    // A selection against the top of the canvas would otherwise push the bar
    // off it entirely.
    const placed = placePropertiesBar({ x: 300, y: 4, width: 200, height: 100 }, bar, viewport);
    expect(placed.side).toBe('below');
    expect(placed.y).toBe(4 + 100 + BAR_GAP);
  });

  it('stays inside the left edge', () => {
    const placed = placePropertiesBar({ x: 0, y: 300, width: 60, height: 40 }, bar, viewport);
    expect(placed.x).toBe(BAR_GAP);
  });

  it('stays inside the right edge', () => {
    const placed = placePropertiesBar({ x: 860, y: 300, width: 40, height: 40 }, bar, viewport);
    expect(placed.x + bar.width).toBe(viewport.width - BAR_GAP);
  });

  it('keeps clear of the selection when it can, on either side', () => {
    const selection = { x: 300, y: 4, width: 200, height: 100 };
    const placed = placePropertiesBar(selection, bar, viewport);
    // Below the selection's bottom edge, not over it.
    expect(placed.y).toBeGreaterThanOrEqual(selection.y + selection.height);
  });

  it('stays on screen when a selection leaves no clear side', () => {
    // A selection filling the canvas has no room above or below. Overlapping a
    // shape is recoverable; a bar scrolled out of the canvas is not.
    const placed = placePropertiesBar({ x: 0, y: 0, width: 900, height: 600 }, bar, viewport);
    expect(placed.y).toBe(BAR_GAP);
    expect(placed.y + bar.height).toBeLessThanOrEqual(viewport.height);
  });

  it('measures against the canvas it was given, not the whole window', () => {
    // The canvas is inset in the page, so the limits move with it.
    const inset = { x: 100, y: 60, width: 400, height: 300 };
    const placed = placePropertiesBar({ x: 110, y: 62, width: 40, height: 20 }, bar, inset);
    expect(placed.x).toBe(inset.x + BAR_GAP);
    expect(placed.side).toBe('below');
  });

  it('left-aligns a bar wider than the canvas rather than pushing it off', () => {
    const narrow = { x: 0, y: 0, width: 200, height: 400 };
    const placed = placePropertiesBar({ x: 20, y: 200, width: 40, height: 40 }, bar, narrow);
    expect(placed.x).toBe(BAR_GAP);
  });
});
