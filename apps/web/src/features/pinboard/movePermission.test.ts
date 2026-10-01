import { describe, expect, it } from 'vitest';

import { canMoveProposal } from './movePermission';

const open = { boardOpen: true, viewerId: 'me' };

describe('canMoveProposal', () => {
  // Locked, the default: the board is the leader's to arrange.
  it('lets only the leader move proposals while the board is locked', () => {
    expect(
      canMoveProposal({ ...open, isLeader: true, boardLocked: true, authorId: 'someone' }),
    ).toBe(true);
    expect(canMoveProposal({ ...open, isLeader: false, boardLocked: true, authorId: 'me' })).toBe(
      false,
    );
  });

  it('lets members move their own, and only their own, once it is unlocked', () => {
    expect(canMoveProposal({ ...open, isLeader: false, boardLocked: false, authorId: 'me' })).toBe(
      true,
    );
    expect(
      canMoveProposal({ ...open, isLeader: false, boardLocked: false, authorId: 'someone' }),
    ).toBe(false);
  });

  it('still lets the leader move anything once it is unlocked', () => {
    expect(
      canMoveProposal({ ...open, isLeader: true, boardLocked: false, authorId: 'someone' }),
    ).toBe(true);
  });

  it('lets nobody move anything once the board has closed for voting', () => {
    const closed = { boardOpen: false, viewerId: 'me', boardLocked: false };
    expect(canMoveProposal({ ...closed, isLeader: true, authorId: 'me' })).toBe(false);
    expect(canMoveProposal({ ...closed, isLeader: false, authorId: 'me' })).toBe(false);
  });

  it('lets nobody move as themselves before the board knows who they are', () => {
    expect(
      canMoveProposal({
        boardOpen: true,
        viewerId: null,
        isLeader: false,
        boardLocked: false,
        authorId: null,
      }),
    ).toBe(false);
  });
});
