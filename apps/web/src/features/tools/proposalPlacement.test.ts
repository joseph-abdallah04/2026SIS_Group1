import { afterEach, describe, expect, it } from 'vitest';

import { CARD_WIDTH } from '../pinboard/pinboardTokens';
import { clearBoardCentre, setBoardCentre } from '../pinboard/boardView';
import { findOpenProposalPosition } from './proposalPlacement';

/** Matches the module's own constants; a card plus its gap. */
const CELL_WIDTH = CARD_WIDTH.diagram + 28;
const CELL_HEIGHT = 260 + 28;

afterEach(() => clearBoardCentre());

describe('findOpenProposalPosition', () => {
  describe('with no board on screen', () => {
    // Tool previews, and the tests below that never set a centre.
    it('falls back to the top-left inset', () => {
      expect(findOpenProposalPosition([], 'sticky')).toEqual({ x: 32, y: 32 });
    });

    it('steps away when that spot is taken', () => {
      const position = findOpenProposalPosition([{ type: 'sticky', x: 32, y: 32 }], 'sticky');
      expect(position).not.toEqual({ x: 32, y: 32 });
    });
  });

  describe('with a board in view', () => {
    it('centres the card on the middle of the view, not its corner', () => {
      setBoardCentre({ x: 1000, y: 800 });
      expect(findOpenProposalPosition([], 'sticky')).toEqual({
        x: 1000 - CARD_WIDTH.sticky / 2,
        y: 800 - 260 / 2,
      });
    });

    it('sizes the offset to the card, so a wide diagram still lands centred', () => {
      setBoardCentre({ x: 1000, y: 800 });
      expect(findOpenProposalPosition([], 'diagram')).toEqual({
        x: 1000 - CARD_WIDTH.diagram / 2,
        y: 800 - 260 / 2,
      });
    });

    // The point of proposing into the view: it must not land on top of what is
    // already there, but it must stay near where the viewer is looking.
    it('steps to an adjacent cell when the centre is occupied', () => {
      setBoardCentre({ x: 1000, y: 800 });
      const centred = { x: 1000 - CARD_WIDTH.sticky / 2, y: 800 - 130 };
      const position = findOpenProposalPosition([{ type: 'sticky', ...centred }], 'sticky');

      expect(position).not.toEqual(centred);
      // One grid step away at most: still in view, not exiled to the corner.
      expect(Math.abs(position.x - centred.x)).toBeLessThanOrEqual(CELL_WIDTH);
      expect(Math.abs(position.y - centred.y)).toBeLessThanOrEqual(CELL_HEIGHT);
    });

    it('never proposes above or left of the board origin', () => {
      // Viewer parked in the far top-left corner: half the ring around them is
      // off the board entirely.
      setBoardCentre({ x: 10, y: 10 });
      const position = findOpenProposalPosition([], 'sticky');
      expect(position.x).toBeGreaterThanOrEqual(0);
      expect(position.y).toBeGreaterThanOrEqual(0);
    });

    it('clears the view between boards, so the next one starts fresh', () => {
      setBoardCentre({ x: 5000, y: 5000 });
      clearBoardCentre();
      expect(findOpenProposalPosition([], 'sticky')).toEqual({ x: 32, y: 32 });
    });
  });
});
