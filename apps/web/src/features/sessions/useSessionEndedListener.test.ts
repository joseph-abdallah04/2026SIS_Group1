import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (payload: unknown) => void;
const listeners = new Map<string, Set<Handler>>();

const socket = {
  on(event: string, cb: Handler) {
    const set = listeners.get(event) ?? new Set();
    set.add(cb);
    listeners.set(event, set);
  },
  off(event: string, cb: Handler) {
    listeners.get(event)?.delete(cb);
  },
};

function emitServer(event: string, payload: unknown) {
  for (const cb of listeners.get(event) ?? []) cb(payload);
}

vi.mock('../../lib/socket', () => ({
  getSocket: () => socket,
}));

const { useSessionEndedListener } = await import('./useSessionEndedListener');

beforeEach(() => {
  listeners.clear();
});

describe('useSessionEndedListener', () => {
  it('calls onEnded only for this session — it does not join the room itself', () => {
    const onEnded = vi.fn();
    renderHook(() => useSessionEndedListener('s1', onEnded));

    act(() => {
      emitServer('sessionEnded', { sessionId: 'other', endedAt: '2026-09-05T13:00:00.000Z' });
    });
    expect(onEnded).not.toHaveBeenCalled();

    act(() => {
      emitServer('sessionEnded', { sessionId: 's1', endedAt: '2026-09-05T13:00:00.000Z' });
    });
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('stops listening on unmount so a later end cannot fire a stale router', () => {
    const onEnded = vi.fn();
    const { unmount } = renderHook(() => useSessionEndedListener('s1', onEnded));
    unmount();

    act(() => {
      emitServer('sessionEnded', { sessionId: 's1', endedAt: '2026-09-05T13:00:00.000Z' });
    });
    expect(onEnded).not.toHaveBeenCalled();
  });
});
