import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STICKY_TEXT_LIMIT } from '../artifactLimits';
import { clearStickyDraft, draftKeyFor, readStickyDraft, writeStickyDraft } from './stickyDraft';

const KEY = draftKeyFor('session-1', 'user-1');

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sticky draft', () => {
  it('gives back what was saved, colour included', () => {
    writeStickyDraft(KEY, { text: 'Ship the beta', color: 'pink' });

    expect(readStickyDraft(KEY)).toEqual({ text: 'Ship the beta', color: 'pink' });
  });

  it('has nothing to give back before anything is written', () => {
    expect(readStickyDraft(KEY)).toBeNull();
  });

  // Emptying the popup is how a draft is thrown away.
  it('forgets a draft that has been emptied', () => {
    writeStickyDraft(KEY, { text: 'Ship the beta', color: 'pink' });
    writeStickyDraft(KEY, { text: '   ', color: 'pink' });

    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('forgets a draft once it is cleared', () => {
    writeStickyDraft(KEY, { text: 'Ship the beta', color: 'pink' });
    clearStickyDraft(KEY);

    expect(readStickyDraft(KEY)).toBeNull();
  });

  // Somebody else signing in on the same machine, or the same person in
  // another session, must not open the popup on this note.
  it('keeps each person in each session to their own draft', () => {
    writeStickyDraft(KEY, { text: 'Mine', color: 'yellow' });

    expect(readStickyDraft(draftKeyFor('session-1', 'user-2'))).toBeNull();
    expect(readStickyDraft(draftKeyFor('session-2', 'user-1'))).toBeNull();
  });

  // Stored data outlives the code that wrote it.
  it('ignores what is stored when it is not a draft', () => {
    localStorage.setItem(KEY, 'not json');
    expect(readStickyDraft(KEY)).toBeNull();

    localStorage.setItem(KEY, JSON.stringify({ text: 'Hi', color: 'purple' }));
    expect(readStickyDraft(KEY)).toBeNull();

    localStorage.setItem(KEY, JSON.stringify({ text: 42, color: 'yellow' }));
    expect(readStickyDraft(KEY)).toBeNull();
  });

  it('cuts a draft saved under a longer limit to the current one', () => {
    localStorage.setItem(KEY, JSON.stringify({ text: 'a'.repeat(400), color: 'blue' }));

    expect(readStickyDraft(KEY)?.text).toHaveLength(STICKY_TEXT_LIMIT);
  });

  // Private modes and blocked site data throw on any access at all.
  it('carries on without a draft when storage cannot be reached', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readStickyDraft(KEY)).toBeNull();
    expect(() => writeStickyDraft(KEY, { text: 'Hi', color: 'yellow' })).not.toThrow();
    expect(() => clearStickyDraft(KEY)).not.toThrow();
  });
});
