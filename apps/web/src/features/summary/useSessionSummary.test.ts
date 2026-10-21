import type { SessionRecap } from '@roundtable/shared';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
vi.mock('../../lib/api', () => ({ api: { get: (path: string) => get(path) } }));

const { useSessionSummary } = await import('./useSessionSummary');

function recap(sessionId: string, title: string): SessionRecap {
  return {
    sessionId,
    title,
    createdAt: '2026-09-01T00:00:00.000Z',
    startedAt: null,
    endedAt: null,
    leaderId: null,
    participants: [],
    questions: [],
  };
}

beforeEach(() => {
  get.mockReset();
});

describe('useSessionSummary', () => {
  it('asks for the summary with the id encoded', async () => {
    get.mockResolvedValue(recap('a/b', 'Odd id'));
    const { result } = renderHook(() => useSessionSummary('a/b'));

    await waitFor(() => expect(result.current.summary?.title).toBe('Odd id'));
    expect(get).toHaveBeenCalledWith('/api/sessions/a%2Fb/summary');
  });

  // B17: moving to another session used to keep showing the last one's.
  it('never shows one session’s summary as another’s', async () => {
    let finish: (value: SessionRecap) => void = () => {};
    get.mockResolvedValueOnce(recap('s1', 'First'));
    get.mockReturnValueOnce(new Promise<SessionRecap>((resolve) => (finish = resolve)));

    const { result, rerender } = renderHook(({ id }) => useSessionSummary(id), {
      initialProps: { id: 's1' },
    });
    await waitFor(() => expect(result.current.summary?.title).toBe('First'));

    rerender({ id: 's2' });
    expect(result.current.summary).toBeNull();
    expect(result.current.loading).toBe(true);

    await act(async () => finish(recap('s2', 'Second')));
    expect(result.current.summary?.title).toBe('Second');
  });

  it('tries again after a failure, loading in the meantime', async () => {
    get.mockRejectedValueOnce(new Error('Network down'));
    get.mockResolvedValueOnce(recap('s1', 'Back'));

    const { result } = renderHook(() => useSessionSummary('s1'));
    await waitFor(() => expect(result.current.error).toBe('Network down'));

    act(() => result.current.reload());
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    await waitFor(() => expect(result.current.summary?.title).toBe('Back'));
    expect(get).toHaveBeenCalledTimes(2);
  });
});
