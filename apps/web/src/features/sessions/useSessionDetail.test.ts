import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
vi.mock('../../lib/api', () => ({
  api: { get: (...args: unknown[]) => get(...args) },
}));

const { useSessionDetail } = await import('./useSessionDetail');

/** A response the test answers when it chooses. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const lobby = { id: 's1', status: 'lobby', questions: [] };
const active = { id: 's1', status: 'active', questions: [] };

beforeEach(() => {
  get.mockReset();
});

describe('useSessionDetail', () => {
  it('blanks the session on reload, behind "loading"', async () => {
    get.mockResolvedValueOnce(lobby);
    const { result } = renderHook(() => useSessionDetail('s1'));
    await waitFor(() => expect(result.current.session).toEqual(lobby));

    const next = deferred<typeof active>();
    get.mockReturnValueOnce(next.promise);
    act(() => result.current.reload());
    expect(result.current.session).toBeNull();
    expect(result.current.loading).toBe(true);

    await act(async () => next.resolve(active));
    expect(result.current.session).toEqual(active);
  });

  // The waiting room hands over to the board in one render only if the lobby
  // stays up until the new copy has arrived.
  it('keeps the session up through a refresh, then swaps it', async () => {
    get.mockResolvedValueOnce(lobby);
    const { result } = renderHook(() => useSessionDetail('s1'));
    await waitFor(() => expect(result.current.session).toEqual(lobby));

    const next = deferred<typeof active>();
    get.mockReturnValueOnce(next.promise);
    act(() => result.current.refresh());
    expect(result.current.session).toEqual(lobby);
    expect(result.current.loading).toBe(false);

    await act(async () => next.resolve(active));
    expect(result.current.session).toEqual(active);
  });

  it('lets the latest of two refreshes win', async () => {
    get.mockResolvedValueOnce(lobby);
    const { result } = renderHook(() => useSessionDetail('s1'));
    await waitFor(() => expect(result.current.session).toEqual(lobby));

    const older = deferred<unknown>();
    const newer = deferred<unknown>();
    get.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    act(() => result.current.refresh());
    act(() => result.current.refresh());

    await act(async () => newer.resolve(active));
    await act(async () => older.resolve(lobby));
    expect(result.current.session).toEqual(active);
  });

  it('reports a failed refresh', async () => {
    get.mockResolvedValueOnce(lobby);
    const { result } = renderHook(() => useSessionDetail('s1'));
    await waitFor(() => expect(result.current.session).toEqual(lobby));

    get.mockRejectedValueOnce(new Error('network down'));
    await act(async () => result.current.refresh());
    await waitFor(() => expect(result.current.error).toBe('network down'));
  });
});
