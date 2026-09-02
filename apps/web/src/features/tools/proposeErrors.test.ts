import { describe, expect, it } from 'vitest';

import { proposalErrorMessage } from './proposeErrors';

describe('proposalErrorMessage', () => {
  it('maps a known acknowledgement code to useful copy', () => {
    const error = Object.assign(new Error('Conflict'), { code: 'QUESTION_CLOSED' });
    expect(proposalErrorMessage(error)).toBe(
      'This question is no longer accepting proposals.',
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
