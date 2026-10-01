import type { BoardResponse } from '@roundtable/shared';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();

vi.mock('../../lib/api', () => ({
  api: { get: (...args: unknown[]) => get(...args) },
}));

const { useArchivedBoard } = await import('./useArchivedBoard');

function board(questionId: string): BoardResponse {
  return {
    sessionId: 's1',
    sessionTitle: 'Roadmap',
    leaderId: 'leader-1',
    questionId,
    questionText: questionId,
    questionPosition: 0,
    questionStatus: 'discussion',
    items: [],
    discussionTimer: null,
  };
}

beforeEach(() => {
  get.mockReset();
});

describe('useArchivedBoard', () => {
  it('stops loading when the response names a different question', async () => {
    get.mockResolvedValue(board('q-other'));

    const { result } = renderHook(() => useArchivedBoard('s1', 'q1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.board).toBeNull();
    expect(result.current.error).toMatch(/could not load this board/i);
  });

  it('does not fetch when there is no question', () => {
    renderHook(() => useArchivedBoard('s1', null));
    expect(get).not.toHaveBeenCalled();
  });

  it('loads the named question and ignores a slower response for the one left behind', async () => {
    const pending: {
      resolve: (value: BoardResponse) => void;
      signal?: AbortSignal;
    }[] = [];
    get.mockImplementation((_path: string, init?: { signal?: AbortSignal }) => {
      return new Promise<BoardResponse>((resolve) => {
        pending.push({ resolve, signal: init?.signal });
      });
    });

    const { result, rerender } = renderHook(
      ({ questionId }: { questionId: string }) => useArchivedBoard('s1', questionId),
      { initialProps: { questionId: 'q1' } },
    );

    await waitFor(() => expect(pending).toHaveLength(1));
    rerender({ questionId: 'q2' });
    await waitFor(() => expect(pending).toHaveLength(2));

    expect(pending[0]?.signal?.aborted).toBe(true);
    expect(get).toHaveBeenLastCalledWith(
      '/api/sessions/s1/proposals?questionId=q2',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    await act(async () => {
      pending[1]?.resolve(board('q2'));
    });
    await waitFor(() => expect(result.current.board?.questionId).toBe('q2'));

    await act(async () => {
      pending[0]?.resolve(board('q1'));
    });
    expect(result.current.board?.questionId).toBe('q2');
  });
});
