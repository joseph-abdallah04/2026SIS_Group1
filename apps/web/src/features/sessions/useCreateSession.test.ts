import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateSessionInput } from '@roundtable/shared/schemas';

const post = vi.fn();
vi.mock('../../lib/api', () => ({
  api: { post: (...args: unknown[]) => post(...args) },
  ApiClientError: class ApiClientError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));

const { ApiClientError } = await import('../../lib/api');
const { useCreateSession } = await import('./useCreateSession');

const input: CreateSessionInput = {
  title: 'Roadmap',
  questions: [{ text: 'What ships first?', votingEnabled: true }],
  discussionTimerSeconds: null,
  votingTimerSeconds: null,
  voiceEnabled: false,
};

describe('useCreateSession createAndOpen', () => {
  beforeEach(() => post.mockReset());

  it('creates the draft, then opens it', async () => {
    post.mockResolvedValueOnce({ id: 's1' }).mockResolvedValueOnce({ id: 's1', code: 'K7NP-3WQZ' });
    const { result } = renderHook(() => useCreateSession());

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.createAndOpen(input);
    });

    expect(post).toHaveBeenNthCalledWith(1, '/api/sessions', input);
    expect(post).toHaveBeenNthCalledWith(2, '/api/sessions/s1/open', {});
    expect(outcome).toEqual({ sessionId: 's1', opened: true, code: 'K7NP-3WQZ' });
    expect(result.current.submitting).toBe(false);
  });

  it('keeps the draft, and says why, when it will not open', async () => {
    post
      .mockResolvedValueOnce({ id: 's1' })
      .mockRejectedValueOnce(new ApiClientError(409, 'You are already in a live session'));
    const { result } = renderHook(() => useCreateSession());

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.createAndOpen(input);
    });

    expect(outcome).toEqual({
      sessionId: 's1',
      opened: false,
      openError: 'You are already in a live session',
    });
  });

  it('reports a create that fails, and opens nothing', async () => {
    post.mockRejectedValueOnce(new ApiClientError(400, 'Title is required'));
    const { result } = renderHook(() => useCreateSession());

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.createAndOpen(input);
    });

    expect(outcome).toBeNull();
    expect(post).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe('Title is required');
    expect(result.current.submitting).toBe(false);
  });
});
