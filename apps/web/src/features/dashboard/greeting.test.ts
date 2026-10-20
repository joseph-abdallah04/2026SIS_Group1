import { describe, expect, it } from 'vitest';

import { greetingFor } from './greeting';

const day = (date: number) => new Date(2026, 9, date, 9);
/** An account made months before any of these days. */
const longAgo = new Date(2026, 3, 1);

describe('greetingFor', () => {
  it('welcomes a new account with nothing here yet', () => {
    expect(
      greetingFor({ firstName: 'Mo', sessionDates: [], accountCreatedAt: day(20), now: day(21) }),
    ).toBe('Welcome to RoundTable, Mo');
  });

  // Somebody who has deleted every session is no newcomer.
  it('does not welcome an older account just because its list is empty', () => {
    expect(
      greetingFor({ firstName: 'Mo', sessionDates: [], accountCreatedAt: longAgo, now: day(21) }),
    ).toBe('Let’s decide, Mo');
  });

  it('says it has been a while when the latest session is over two weeks old', () => {
    expect(
      greetingFor({
        firstName: 'Mo',
        sessionDates: [day(1), day(3)],
        accountCreatedAt: longAgo,
        now: day(20),
      }),
    ).toBe('It’s been a while, Mo');
  });

  it('goes by the latest session, not the first', () => {
    expect(
      greetingFor({
        firstName: 'Mo',
        sessionDates: [day(1), day(19)],
        accountCreatedAt: longAgo,
        now: day(20),
      }),
    ).toBe('Let’s decide, Mo');
  });

  it('otherwise says what the product is for', () => {
    expect(
      greetingFor({
        firstName: 'Mo',
        sessionDates: [day(18)],
        accountCreatedAt: longAgo,
        now: day(20),
      }),
    ).toBe('Let’s decide, Mo');
  });
});
