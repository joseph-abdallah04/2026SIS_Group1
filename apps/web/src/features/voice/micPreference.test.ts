import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readMicMuted, writeMicMuted } from './micPreference';

describe('micPreference', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('defaults to unmuted for a participant who has never toggled', () => {
    expect(readMicMuted('session-1', 'user-1')).toBe(false);
  });

  it('remembers a mute across a reload, which is the whole point (F12)', () => {
    writeMicMuted('session-1', 'user-1', true);

    expect(readMicMuted('session-1', 'user-1')).toBe(true);
  });

  it('forgets the mute once you unmute, rather than storing a falsey value', () => {
    writeMicMuted('session-1', 'user-1', true);
    writeMicMuted('session-1', 'user-1', false);

    expect(readMicMuted('session-1', 'user-1')).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it('keeps each session separate: muting one meeting does not mute the next', () => {
    writeMicMuted('session-1', 'user-1', true);

    expect(readMicMuted('session-2', 'user-1')).toBe(false);
  });

  it('keeps each user separate, so a shared browser does not inherit a mute', () => {
    writeMicMuted('session-1', 'user-1', true);

    expect(readMicMuted('session-1', 'user-2')).toBe(false);
  });

  it('survives storage that throws — a blocked cookie jar must not break voice', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('The operation is insecure.');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('The operation is insecure.');
    });

    expect(() => writeMicMuted('session-1', 'user-1', true)).not.toThrow();
    expect(readMicMuted('session-1', 'user-1')).toBe(false);
  });
});
