import { afterEach, describe, expect, it, vi } from 'vitest';

import { hintKeyFor, isHintRetired, retireHint } from './firstProposalHintStorage';

const KEY = hintKeyFor('session-1', 'user-1');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('first-proposal hint storage', () => {
  it('is not retired before anything is stored', () => {
    expect(isHintRetired(KEY)).toBe(false);
  });

  it('stays retired once retired', () => {
    retireHint(KEY);

    expect(isHintRetired(KEY)).toBe(true);
  });

  // The next session starts fresh, and so does the next person on the machine.
  it('keeps each person, in each session, to their own hint', () => {
    retireHint(KEY);

    expect(isHintRetired(hintKeyFor('session-1', 'user-2'))).toBe(false);
    expect(isHintRetired(hintKeyFor('session-2', 'user-1'))).toBe(false);
  });

  // Private modes and blocked site data throw on any access at all.
  it('carries on when storage cannot be reached', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(isHintRetired(KEY)).toBe(false);
    expect(() => retireHint(KEY)).not.toThrow();
  });
});
