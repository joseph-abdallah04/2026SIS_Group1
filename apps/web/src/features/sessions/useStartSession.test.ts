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

const { useStartSession } = await import('./useStartSession');
const { ApiClientError } = await import('../../lib/api');

const STARTED = {
  id: 's1',
  title: 'Roadmap',
  status: 'active',
  startedAt: '2026-09-05T12:00:00.000Z',
};

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue(STARTED);
});

describe('useStartSession', () => {
  it('POSTs /:id/start — other waiting clients move on the broadcast, not this return', async () => {
    const { result } = renderHook(() => useStartSession('s1'));

    let session: unknown = null;
    await act(async () => {
      session = await result.current.start();
    });

    expect(session).toEqual(STARTED);
    expect(post).toHaveBeenCalledWith('/api/sessions/s1/start', {});
  });

  it('surfaces a non-leader refusal', async () => {
    post.mockRejectedValue(
      new ApiClientError(403, 'Only the session leader can start it', 'NOT_SESSION_LEADER'),
    );
    const { result } = renderHook(() => useStartSession('s1'));

    let session: unknown = STARTED;
    await act(async () => {
      session = await result.current.start();
    });

    expect(session).toBeNull();
    expect(result.current.error).toBe('Only the session leader can start it');
  });
});
