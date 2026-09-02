import { describe, expect, it } from 'vitest';

import { findOpenProposalPosition } from './proposalPlacement';

describe('findOpenProposalPosition', () => {
  it('starts an empty board inside the canvas edge', () => {
    expect(findOpenProposalPosition([], 'sticky')).toEqual({ x: 32, y: 32 });
  });

  it('moves to the next grid cell when the first is occupied', () => {
    expect(findOpenProposalPosition([{ type: 'sticky', x: 32, y: 32 }], 'sticky')).toEqual({
      x: 360,
      y: 32,
    });
  });

  it('does not overlap a wider diagram', () => {
    const position = findOpenProposalPosition(
      [
        { type: 'diagram', x: 24, y: 20 },
        { type: 'drawing', x: 350, y: 40 },
      ],
      'sticky',
    );

    expect(position).toEqual({ x: 688, y: 32 });
  });
});
