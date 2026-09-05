import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
const joinSessionRoom = vi.fn();
const scheduleLeaveSessionRoom = vi.fn();

type Handler = (payload: unknown) => void;
const listeners = new Map<string, Set<Handler>>();

const socket = {
  connected: true,
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

vi.mock('../../lib/api', () => ({
  api: { get: (...args: unknown[]) => get(...args) },
}));

vi.mock('../../lib/socket', () => ({
  getSocket: () => socket,
  joinSessionRoom: (...args: unknown[]) => joinSessionRoom(...args),
  scheduleLeaveSessionRoom: (...args: unknown[]) => scheduleLeaveSessionRoom(...args),
}));

const { useWaitingRoom } = await import('./useWaitingRoom');
const { usePinboard } = await import('../pinboard/usePinboard');

const MEMBERS = [
  { userId: 'u1', displayName: 'Alice', joinedAt: '2026-09-05T00:00:00.000Z' },
];

const EMPTY_BOARD = {
  sessionId: 's1',
  sessionTitle: 'Roadmap',
  leaderId: 'leader-1',
  questionId: 'q1',
  questionText: 'What ships first?',
  questionPosition: 0,
  questionStatus: 'discussion' as const,
  items: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  listeners.clear();
  socket.connected = true;
  get.mockImplementation((path: string) => {
    if (path.includes('/members')) return Promise.resolve(MEMBERS);
    if (path.includes('/proposals')) return Promise.resolve(EMPTY_BOARD);
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
  joinSessionRoom.mockImplementation((_id: string, ack?: (res: { ok: boolean }) => void) => {
    ack?.({ ok: true });
  });
});

describe('useWaitingRoom', () => {
  it('joins the session room on mount when the socket is already connected', async () => {
    const { result } = renderHook(() => useWaitingRoom('s1'));

    expect(joinSessionRoom).toHaveBeenCalledWith('s1', expect.any(Function));
    await waitFor(() => expect(result.current.isLive).toBe(true));
  });

  it('waits for connect before joining if the socket is still down', () => {
    socket.connected = false;
    renderHook(() => useWaitingRoom('s1'));
    expect(joinSessionRoom).not.toHaveBeenCalled();

    act(() => emitServer('connect', undefined));
    expect(joinSessionRoom).toHaveBeenCalledWith('s1', expect.any(Function));
  });

  it('asks the server to leave the room on unmount — the singleton stays connected', () => {
    const { unmount } = renderHook(() => useWaitingRoom('s1'));
    unmount();
    expect(scheduleLeaveSessionRoom).toHaveBeenCalledWith('s1');
  });

  it('paints persisted members first, then replaces them with the live snapshot', async () => {
    const { result } = renderHook(() => useWaitingRoom('s1'));

    await waitFor(() =>
      expect(result.current.participants).toEqual([{ id: 'u1', displayName: 'Alice' }]),
    );

    act(() => {
      emitServer('sessionState', {
        sessionId: 's1',
        participants: [{ id: 'u2', displayName: 'Bob' }],
      });
    });

    expect(result.current.participants).toEqual([{ id: 'u2', displayName: 'Bob' }]);
    expect(result.current.error).toBeNull();
  });

  it('does not let a late REST response overwrite a live snapshot that already arrived', async () => {
    let resolveMembers!: (value: typeof MEMBERS) => void;
    get.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMembers = resolve as (value: typeof MEMBERS) => void;
        }),
    );

    const { result } = renderHook(() => useWaitingRoom('s1'));

    act(() => {
      emitServer('sessionState', {
        sessionId: 's1',
        participants: [{ id: 'live', displayName: 'Live' }],
      });
    });
    expect(result.current.participants).toEqual([{ id: 'live', displayName: 'Live' }]);

    await act(async () => {
      resolveMembers(MEMBERS);
    });
    expect(result.current.participants).toEqual([{ id: 'live', displayName: 'Live' }]);
  });

  it('ignores a sessionState snapshot for a different session', async () => {
    const { result } = renderHook(() => useWaitingRoom('s1'));
    await waitFor(() => expect(result.current.participants).not.toBeNull());

    act(() => {
      emitServer('sessionState', {
        sessionId: 'other',
        participants: [{ id: 'x', displayName: 'Nope' }],
      });
    });

    expect(result.current.participants).toEqual([{ id: 'u1', displayName: 'Alice' }]);
  });

  it('adds and removes people from memberJoined / memberLeft', async () => {
    const { result } = renderHook(() => useWaitingRoom('s1'));
    await waitFor(() => expect(result.current.participants).not.toBeNull());

    act(() => {
      emitServer('memberJoined', { user: { id: 'u2', displayName: 'Bob' } });
    });
    expect(result.current.participants).toEqual([
      { id: 'u1', displayName: 'Alice' },
      { id: 'u2', displayName: 'Bob' },
    ]);

    act(() => {
      emitServer('memberJoined', { user: { id: 'u2', displayName: 'Bob' } });
    });
    expect(result.current.participants).toHaveLength(2);

    act(() => {
      emitServer('memberLeft', { user: { id: 'u1', displayName: 'Alice' } });
    });
    expect(result.current.participants).toEqual([{ id: 'u2', displayName: 'Bob' }]);
  });

  it('fires onStarted only for this session’s sessionStarted broadcast', () => {
    const onStarted = vi.fn();
    renderHook(() => useWaitingRoom('s1', onStarted));

    act(() => {
      emitServer('sessionStarted', { sessionId: 'other', startedAt: '2026-09-05T12:00:00.000Z' });
    });
    expect(onStarted).not.toHaveBeenCalled();

    act(() => {
      emitServer('sessionStarted', { sessionId: 's1', startedAt: '2026-09-05T12:00:00.000Z' });
    });
    expect(onStarted).toHaveBeenCalledTimes(1);
  });

  it('marks the room offline on disconnect and surfaces a failed join', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    joinSessionRoom.mockImplementation((_id: string, ack?: (res: { ok: boolean; error?: string }) => void) => {
      ack?.({ ok: false, error: 'not a member' });
    });

    const { result } = renderHook(() => useWaitingRoom('s1'));
    await waitFor(() => expect(result.current.isLive).toBe(false));
    expect(error).toHaveBeenCalled();

    joinSessionRoom.mockImplementation((_id: string, ack?: (res: { ok: boolean }) => void) => {
      ack?.({ ok: true });
    });
    act(() => emitServer('connect', undefined));
    await waitFor(() => expect(result.current.isLive).toBe(true));

    act(() => emitServer('disconnect', undefined));
    expect(result.current.isLive).toBe(false);
    error.mockRestore();
  });

  it('records a REST failure so the waiting room can show it', async () => {
    get.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useWaitingRoom('s1'));
    await waitFor(() => expect(result.current.error).toBe('network down'));
    expect(result.current.loading).toBe(false);
  });

  it('does not join or leave when sessionId is empty', () => {
    renderHook(() => useWaitingRoom(''));
    expect(joinSessionRoom).not.toHaveBeenCalled();
    expect(scheduleLeaveSessionRoom).not.toHaveBeenCalled();
  });
});

describe('lobby → pinboard room handoff', () => {
  it('leaves on waiting-room unmount and joins again from the pinboard — the deferred leave is socket.ts’s job', async () => {
    const waiting = renderHook(() => useWaitingRoom('s1'));
    expect(joinSessionRoom).toHaveBeenCalledWith('s1', expect.any(Function));

    waiting.unmount();
    expect(scheduleLeaveSessionRoom).toHaveBeenCalledWith('s1');

    joinSessionRoom.mockClear();
    renderHook(() => usePinboard('s1'));
    expect(joinSessionRoom).toHaveBeenCalledWith('s1', expect.any(Function));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/sessions/s1/proposals'));
  });
});
