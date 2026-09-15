import { describe, expect, it } from 'vitest';

import { ApiError } from '../../middleware/error.js';
import { assertTurnAllowed, resetTurnLimiter } from './rateLimit.js';

describe('assertTurnAllowed', () => {
  it('allows a burst up to the limit, then refuses', () => {
    resetTurnLimiter();
    assertTurnAllowed('u1', 2, 1_000);
    assertTurnAllowed('u1', 2, 1_100);
    expect(() => assertTurnAllowed('u1', 2, 1_200)).toThrow(ApiError);
    try {
      assertTurnAllowed('u1', 2, 1_200);
    } catch (cause) {
      expect(cause).toMatchObject({ status: 429, code: 'ASSISTANT_RATE_LIMITED' });
    }
  });

  it('counts each user separately', () => {
    resetTurnLimiter();
    assertTurnAllowed('a', 1, 1_000);
    expect(() => assertTurnAllowed('a', 1, 1_100)).toThrow(ApiError);
    expect(() => assertTurnAllowed('b', 1, 1_100)).not.toThrow();
  });

  it('forgets turns that have left the window', () => {
    resetTurnLimiter();
    assertTurnAllowed('u1', 1, 1_000);
    expect(() => assertTurnAllowed('u1', 1, 61_000)).not.toThrow();
  });

  it('does nothing when the limit is disabled', () => {
    resetTurnLimiter();
    expect(() => assertTurnAllowed('u1', 0, 1_000)).not.toThrow();
    expect(() => assertTurnAllowed('u1', 0, 1_001)).not.toThrow();
  });
});
