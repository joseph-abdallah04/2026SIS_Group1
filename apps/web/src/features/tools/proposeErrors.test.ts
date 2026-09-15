import { describe, expect, it } from 'vitest';

import { proposalErrorMessage } from './proposeErrors';

describe('proposalErrorMessage', () => {
  it('maps a known acknowledgement code to useful copy', () => {
    const error = Object.assign(new Error('Conflict'), { code: 'QUESTION_CLOSED' });
    expect(proposalErrorMessage(error)).toBe('This question is no longer accepting proposals.');
  });

  // The original was taken off the board while someone was building on it.
  it('explains a refused extension in terms of the removed original', () => {
    const error = Object.assign(
      new Error('Cannot build on a proposal that is not in this session'),
      {
        code: 'INVALID_EXTENDS',
      },
    );
    expect(proposalErrorMessage(error)).toBe(
      'The idea you were building on was removed from the board.',
    );
  });

  it('preserves a server message when no known code is available', () => {
    expect(proposalErrorMessage(new Error('The server is restarting.'))).toBe(
      'The server is restarting.',
    );
  });

  it('uses a stable fallback for an unknown failure', () => {
    expect(proposalErrorMessage(null)).toBe('Your idea could not be proposed. Try again.');
  });
});
