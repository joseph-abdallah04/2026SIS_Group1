import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();

vi.mock('../../lib/api', () => ({
  api: { post: (...args: unknown[]) => post(...args) },
  ApiClientError: class ApiClientError extends Error {
    constructor(
      public status: number,
      message: string,
      public code?: string,
    ) {
      super(message);
    }
  },
}));

const { useLeaveSession } = await import('./useLeaveSession');
const { ApiClientError } = await import('../../lib/api');

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue(undefined);
});

describe('useLeaveSession', () => {
  it('POSTs /:id/leave and reports success', async () => {
    const { result } = renderHook(() => useLeaveSession());

    let ok = false;
    await act(async () => {
      ok = await result.current.leave('s1');
    });

    expect(ok).toBe(true);
    expect(post).toHaveBeenCalledWith('/api/sessions/s1/leave', {});
    expect(result.current.error).toBeNull();
    expect(result.current.leaving).toBe(false);
  });

  it('keeps the server’s message when leave is refused (e.g. the leader)', async () => {
    post.mockRejectedValue(
      new ApiClientError(409, 'The leader cannot leave — end the session instead', 'LEADER_CANNOT_LEAVE'),
    );
    const { result } = renderHook(() => useLeaveSession());

    let ok = true;
    await act(async () => {
      ok = await result.current.leave('s1');
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe('The leader cannot leave — end the session instead');
  });

  it('falls back to a generic message for a non-API failure', async () => {
    post.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useLeaveSession());

    await act(async () => {
      await result.current.leave('s1');
    });
    expect(result.current.error).toBe('Failed to leave session');
  });
});
