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

const { useEndSession } = await import('./useEndSession');
const { ApiClientError } = await import('../../lib/api');

const ENDED = {
  id: 's1',
  title: 'Roadmap',
  status: 'ended',
  endedAt: '2026-09-05T13:00:00.000Z',
};

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue(ENDED);
});

describe('useEndSession', () => {
  it('POSTs /:id/end and returns the session — navigation is the broadcast’s job', async () => {
    const { result } = renderHook(() => useEndSession('s1'));

    let session: unknown = null;
    await act(async () => {
      session = await result.current.end();
    });

    expect(session).toEqual(ENDED);
    expect(post).toHaveBeenCalledWith('/api/sessions/s1/end', {});
    expect(result.current.error).toBeNull();
  });

  it('surfaces the server’s refusal without throwing', async () => {
    post.mockRejectedValue(
      new ApiClientError(403, 'Only the session leader can end it', 'NOT_SESSION_LEADER'),
    );
    const { result } = renderHook(() => useEndSession('s1'));

    let session: unknown = ENDED;
    await act(async () => {
      session = await result.current.end();
    });

    expect(session).toBeNull();
    expect(result.current.error).toBe('Only the session leader can end it');
  });
});
