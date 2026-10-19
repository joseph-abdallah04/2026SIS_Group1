import { describe, expect, it } from 'vitest';

import {
  clearSetup,
  readSetup,
  savedAgo,
  SETUP_AUTOSAVE_MAX_AGE_MS,
  setupAutosaveKey,
  writeSetup,
} from './setupAutosave';
import { initialSetupState } from './useSessionSetupForm';

const state = initialSetupState(
  { title: 'Roadmap', questions: [{ text: 'What ships first?', votingEnabled: true }] },
  () => 'k1',
);

describe('setupAutosave', () => {
  it('keeps one form per user', () => {
    expect(setupAutosaveKey('u1')).toBe('rt_setup_draft:u1');
    expect(setupAutosaveKey(null)).toBeNull();
  });

  it('gives back what it kept, and nothing once cleared', () => {
    const key = setupAutosaveKey('u1')!;
    writeSetup(key, state, 1_000);
    expect(readSetup(key, 2_000)).toEqual({ version: 1, savedAt: 1_000, state });

    clearSetup(key);
    expect(readSetup(key)).toBeNull();
  });

  it('lets a form too old to be worth offering go', () => {
    const key = setupAutosaveKey('u1')!;
    writeSetup(key, state, 0);
    expect(readSetup(key, SETUP_AUTOSAVE_MAX_AGE_MS + 1)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('drops anything it cannot read as a form', () => {
    const key = setupAutosaveKey('u1')!;
    localStorage.setItem(key, '{not json');
    expect(readSetup(key)).toBeNull();

    localStorage.setItem(
      key,
      JSON.stringify({ version: 1, savedAt: Date.now(), state: { title: 3 } }),
    );
    expect(readSetup(key)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('says how long ago, in words', () => {
    const now = 10 * 24 * 60 * 60 * 1000;
    expect(savedAgo(now - 20_000, now)).toBe('just now');
    expect(savedAgo(now - 12 * 60_000, now)).toBe('12 min ago');
    expect(savedAgo(now - 3 * 60 * 60_000, now)).toBe('3 h ago');
    expect(savedAgo(now - 30 * 60 * 60_000, now)).toBe('yesterday');
    expect(savedAgo(now - 4 * 24 * 60 * 60_000, now)).toBe('4 days ago');
  });
});
