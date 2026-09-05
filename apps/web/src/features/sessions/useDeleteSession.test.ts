import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const del = vi.fn();

vi.mock('../../lib/api', () => ({
  api: { delete: (...args: unknown[]) => del(...args) },
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

const { useDeleteSession } = await import('./useDeleteSession');
const { ApiClientError } = await import('../../lib/api');

beforeEach(() => {
  del.mockReset();
  del.mockResolvedValue(undefined);
});

describe('useDeleteSession', () => {
  it('DELETEs the session and reports success — hide vs destroy is the server’s call', async () => {
    const { result } = renderHook(() => useDeleteSession());

    let ok = false;
    await act(async () => {
      ok = await result.current.remove('s1');
    });

    expect(ok).toBe(true);
    expect(del).toHaveBeenCalledWith('/api/sessions/s1');
    expect(result.current.error).toBeNull();
  });

  it('keeps a live-session refusal on the hook so the card can show it', async () => {
    del.mockRejectedValue(
      new ApiClientError(409, 'Cannot delete a live session — end it first', 'INVALID_TRANSITION'),
    );
    const { result } = renderHook(() => useDeleteSession());

    let ok = true;
    await act(async () => {
      ok = await result.current.remove('s1');
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe('Cannot delete a live session — end it first');
  });
});
