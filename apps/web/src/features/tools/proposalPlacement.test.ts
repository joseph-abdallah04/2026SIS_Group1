import type { ArtifactJson, BoardItem } from '@roundtable/shared';
import { afterEach, describe, expect, it } from 'vitest';

import { cardWidth } from '../pinboard/cardMetrics';
import { CARD_WIDTH } from '../pinboard/pinboardTokens';
import { clearBoardCentre, setBoardCentre } from '../pinboard/boardView';
import { findOpenProposalPosition } from './proposalPlacement';

/** Matches the module's own constants; a card plus its gap. */
const CELL_WIDTH = CARD_WIDTH.diagram + 28;
const CELL_HEIGHT = 260 + 28;

const STICKY: ArtifactJson = { type: 'sticky', text: 'Ship it', color: 'yellow' };
const DIAGRAM: ArtifactJson = { type: 'diagram', nodes: [], edges: [] };
const STICKY_WIDTH = cardWidth({ type: 'sticky', artifactJson: STICKY });

function stickyAt(
  x: number,
  y: number,
  text = 'Ship it',
): Pick<BoardItem, 'type' | 'artifactJson' | 'x' | 'y'> {
  return { type: 'sticky', artifactJson: { type: 'sticky', text, color: 'yellow' }, x, y };
}

afterEach(() => clearBoardCentre());

describe('findOpenProposalPosition', () => {
  describe('with no board on screen', () => {
    // Tool previews, and the tests below that never set a centre.
    it('falls back to the top-left inset', () => {
      expect(findOpenProposalPosition([], STICKY)).toEqual({ x: 32, y: 32 });
    });

    it('steps away when that spot is taken', () => {
      const position = findOpenProposalPosition([stickyAt(32, 32)], STICKY);
      expect(position).not.toEqual({ x: 32, y: 32 });
    });
  });

  describe('with a board in view', () => {
    it('centres the card on the middle of the view, not its corner', () => {
      setBoardCentre({ x: 1000, y: 800 });
      // Rounded: positions are whole pixels, and a sticky's width can be odd.
      expect(findOpenProposalPosition([], STICKY)).toEqual({
        x: Math.round(1000 - STICKY_WIDTH / 2),
        y: 800 - 260 / 2,
      });
    });

    it('sizes the offset to the card, so a wide diagram still lands centred', () => {
      setBoardCentre({ x: 1000, y: 800 });
      expect(findOpenProposalPosition([], DIAGRAM)).toEqual({
        x: 1000 - CARD_WIDTH.diagram / 2,
        y: 800 - 260 / 2,
      });
    });

    // The point of proposing into the view: it must not land on top of what is
    // already there, but it must stay near where the viewer is looking.
    it('steps to an adjacent cell when the centre is occupied', () => {
      setBoardCentre({ x: 1000, y: 800 });
      const centred = { x: 1000 - STICKY_WIDTH / 2, y: 800 - 130 };
      const position = findOpenProposalPosition([stickyAt(centred.x, centred.y)], STICKY);

      expect(position).not.toEqual(centred);
      // One grid step away at most: still in view, not exiled to the corner.
      expect(Math.abs(position.x - centred.x)).toBeLessThanOrEqual(CELL_WIDTH);
      expect(Math.abs(position.y - centred.y)).toBeLessThanOrEqual(CELL_HEIGHT);
    });

    // A sticky grows with its note. Taken for the smallest, a long one left
    // room to its right that was not really there, and the new card landed
    // over its edge.
    it('keeps clear of the whole width of a long sticky', () => {
      setBoardCentre({ x: 1000, y: 800 });
      const long = stickyAt(0, 800 - 130, 'a'.repeat(280));
      const longWidth = cardWidth(long);
      // Just far enough right of the long sticky to clear the smallest one,
      // and not far enough to clear this one.
      const spot = 1000 - STICKY_WIDTH / 2;
      long.x = spot - (CARD_WIDTH.sticky + 28);

      const position = findOpenProposalPosition([long], STICKY);

      const clears =
        position.x >= long.x + longWidth + 28 ||
        position.x + STICKY_WIDTH + 28 <= long.x ||
        Math.abs(position.y - long.y) >= 260 + 28;
      expect(longWidth).toBeGreaterThan(CARD_WIDTH.sticky);
      expect(clears).toBe(true);
    });

    it('never proposes above or left of the board origin', () => {
      // Viewer parked in the far top-left corner: half the ring around them is
      // off the board entirely.
      setBoardCentre({ x: 10, y: 10 });
      const position = findOpenProposalPosition([], STICKY);
      expect(position.x).toBeGreaterThanOrEqual(0);
      expect(position.y).toBeGreaterThanOrEqual(0);
    });

    it('clears the view between boards, so the next one starts fresh', () => {
      setBoardCentre({ x: 5000, y: 5000 });
      clearBoardCentre();
      expect(findOpenProposalPosition([], STICKY)).toEqual({ x: 32, y: 32 });
    });
  });
});

describe('findOpenProposalPosition beside an original', () => {
  // An extension belongs next to what it builds on, wherever the viewer is looking.
  it('lands just to the right of the original, level with its top', () => {
    setBoardCentre({ x: 2000, y: 1200 });
    const original = stickyAt(400, 300);

    expect(findOpenProposalPosition([original], STICKY, original)).toEqual({
      x: 400 + STICKY_WIDTH + 28,
      y: 300,
    });
  });

  it('walks outward from there when the spot beside it is taken', () => {
    const original = stickyAt(400, 300);
    const neighbour = stickyAt(400 + STICKY_WIDTH + 28, 300);

    const position = findOpenProposalPosition([original, neighbour], DIAGRAM, original);
    expect(position).not.toEqual({ x: 400 + STICKY_WIDTH + 28, y: 300 });
    // Still close by: within one ring of the spot it wanted.
    expect(Math.abs(position.x - (400 + STICKY_WIDTH + 28))).toBeLessThanOrEqual(CELL_WIDTH);
    expect(Math.abs(position.y - 300)).toBeLessThanOrEqual(CELL_HEIGHT);
  });
});
