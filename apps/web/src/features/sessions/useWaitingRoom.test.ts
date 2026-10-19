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

const { LEAVE_HOLD_MS, useWaitingRoom } = await import('./useWaitingRoom');
const { usePinboard } = await import('../pinboard/usePinboard');

const MEMBERS = [{ userId: 'u1', displayName: 'Alice', joinedAt: '2026-09-05T00:00:00.000Z' }];

/** The parts of a join snapshot this hook reads, for a session still in its lobby. */
function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 's1',
    status: 'lobby',
    viewer: { id: 'u1', displayName: 'Alice' },
    participants: [{ id: 'u1', displayName: 'Alice' }],
    ...overrides,
  };
}

const EMPTY_BOARD = {
  sessionId: 's1',
  sessionTitle: 'Roadmap',
  leaderId: 'leader-1',
  questionId: 'q1',
  questionText: 'What ships first?',
  questionPosition: 0,
  questionStatus: 'discussion' as const,
  items: [],
  discussionTimer: null,
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

  // The persisted list includes people who closed their tab long ago. Seated
  // first, they used to flash in and then leave the moment the snapshot landed.
  it('seats only who the snapshot says is here, and keeps names from the member list', async () => {
    const { result } = renderHook(() => useWaitingRoom('s1'));

    await waitFor(() => expect(result.current.memberNames.get('u1')).toBe('Alice'));
    expect(result.current.participants).toBeNull();
    expect(result.current.loading).toBe(true);

    act(() => {
      emitServer('sessionState', snapshot({ participants: [{ id: 'u2', displayName: 'Bob' }] }));
    });

    expect(result.current.participants).toEqual([{ id: 'u2', displayName: 'Bob' }]);
    expect(result.current.loading).toBe(false);
    // Alice is not here, but her name is still known.
    expect(result.current.memberNames.get('u1')).toBe('Alice');
    expect(result.current.memberNames.get('u2')).toBe('Bob');
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
      emitServer('sessionState', snapshot({ participants: [{ id: 'live', displayName: 'Live' }] }));
    });
    expect(result.current.participants).toEqual([{ id: 'live', displayName: 'Live' }]);

    await act(async () => {
      resolveMembers(MEMBERS);
    });
    expect(result.current.participants).toEqual([{ id: 'live', displayName: 'Live' }]);
  });

  it('ignores a sessionState snapshot for a different session', () => {
    const { result } = renderHook(() => useWaitingRoom('s1'));
    act(() => {
      emitServer('sessionState', snapshot());
    });

    act(() => {
      emitServer(
        'sessionState',
        snapshot({ sessionId: 'other', participants: [{ id: 'x', displayName: 'Nope' }] }),
      );
    });

    expect(result.current.participants).toEqual([{ id: 'u1', displayName: 'Alice' }]);
  });

  it('knows who this socket is from the snapshot', () => {
    const { result } = renderHook(() => useWaitingRoom('s1'));
    expect(result.current.viewerId).toBeNull();

    act(() => {
      emitServer('sessionState', snapshot({ viewer: { id: 'u7', displayName: 'Gus' } }));
    });
    expect(result.current.viewerId).toBe('u7');
  });

  // A socket that was down when the leader pressed Start (or End) never hears
  // the broadcast. Its rejoin snapshot is the only news that the room moved on.
  it.each(['active', 'ended'])('leaves the lobby on a snapshot that says %s', (status) => {
    const onLeftLobby = vi.fn();
    renderHook(() => useWaitingRoom('s1', onLeftLobby));

    act(() => {
      emitServer('sessionState', snapshot({ status }));
    });
    expect(onLeftLobby).toHaveBeenCalledExactlyOnceWith('moved-on');
  });

  it('stays put on a lobby snapshot, and on another session’s', () => {
    const onLeftLobby = vi.fn();
    renderHook(() => useWaitingRoom('s1', onLeftLobby));

    act(() => {
      emitServer('sessionState', snapshot());
      emitServer('sessionState', snapshot({ sessionId: 'other', status: 'active' }));
    });
    expect(onLeftLobby).not.toHaveBeenCalled();
  });

  it('does not rejoin the room when the caller passes a new callback', () => {
    const { rerender } = renderHook(({ cb }) => useWaitingRoom('s1', cb), {
      initialProps: { cb: vi.fn() },
    });
    const latest = vi.fn();
    rerender({ cb: latest });

    expect(joinSessionRoom).toHaveBeenCalledTimes(1);
    expect(scheduleLeaveSessionRoom).not.toHaveBeenCalled();
    act(() => {
      emitServer('sessionStarted', { sessionId: 's1', startedAt: '2026-09-05T12:00:00.000Z' });
    });
    expect(latest).toHaveBeenCalledExactlyOnceWith('started');
  });

  it('adds people on memberJoined, and removes them a moment after memberLeft', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useWaitingRoom('s1'));
      act(() => {
        emitServer('sessionState', snapshot());
      });

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
      // Held, in case it is only a refresh.
      expect(result.current.participants).toHaveLength(2);
      act(() => vi.advanceTimersByTime(LEAVE_HOLD_MS));
      expect(result.current.participants).toEqual([{ id: 'u2', displayName: 'Bob' }]);
    } finally {
      vi.useRealTimers();
    }
  });

  // A refresh is a leave and a join a moment apart. Drawn as both, the table
  // would empty a chair and fill it again every time someone reloaded.
  it('treats a quick leave-and-rejoin as nobody having left', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useWaitingRoom('s1'));
      act(() => {
        emitServer('sessionState', snapshot());
      });
      const before = result.current.participants;

      act(() => {
        emitServer('memberLeft', { user: { id: 'u1', displayName: 'Alice' } });
      });
      act(() => vi.advanceTimersByTime(LEAVE_HOLD_MS - 100));
      act(() => {
        emitServer('memberJoined', { user: { id: 'u1', displayName: 'Alice' } });
      });
      act(() => vi.advanceTimersByTime(LEAVE_HOLD_MS));

      expect(result.current.participants).toEqual([{ id: 'u1', displayName: 'Alice' }]);
      // The same list throughout: nothing downstream saw a change.
      expect(result.current.participants).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves the lobby only for this session’s sessionStarted broadcast', () => {
    const onLeftLobby = vi.fn();
    renderHook(() => useWaitingRoom('s1', onLeftLobby));

    act(() => {
      emitServer('sessionStarted', { sessionId: 'other', startedAt: '2026-09-05T12:00:00.000Z' });
    });
    expect(onLeftLobby).not.toHaveBeenCalled();

    act(() => {
      emitServer('sessionStarted', { sessionId: 's1', startedAt: '2026-09-05T12:00:00.000Z' });
    });
    expect(onLeftLobby).toHaveBeenCalledExactlyOnceWith('started');
  });

  it('marks the room offline on disconnect and says when a join was refused', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    joinSessionRoom.mockImplementation(
      (_id: string, ack?: (res: { ok: boolean; error?: string }) => void) => {
        ack?.({ ok: false, error: 'not a member' });
      },
    );

    const { result } = renderHook(() => useWaitingRoom('s1'));
    await waitFor(() => expect(result.current.joinFailed).toBe(true));
    expect(result.current.isLive).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(error).toHaveBeenCalled();

    joinSessionRoom.mockImplementation((_id: string, ack?: (res: { ok: boolean }) => void) => {
      ack?.({ ok: true });
    });
    act(() => emitServer('connect', undefined));
    await waitFor(() => expect(result.current.isLive).toBe(true));
    expect(result.current.joinFailed).toBe(false);

    act(() => emitServer('disconnect', undefined));
    expect(result.current.isLive).toBe(false);
    error.mockRestore();
  });

  it('asks to join again on retry, after a refusal', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    joinSessionRoom.mockImplementation(
      (_id: string, ack?: (res: { ok: boolean; error?: string }) => void) => {
        ack?.({ ok: false, error: 'busy' });
      },
    );
    const { result } = renderHook(() => useWaitingRoom('s1'));
    await waitFor(() => expect(result.current.joinFailed).toBe(true));

    joinSessionRoom.mockImplementation((_id: string, ack?: (res: { ok: boolean }) => void) => {
      ack?.({ ok: true });
    });
    act(() => result.current.retryJoin());
    expect(joinSessionRoom).toHaveBeenCalledTimes(2);
    expect(result.current.joinFailed).toBe(false);
    error.mockRestore();
  });

  it('carries on without names when the member list will not load', async () => {
    get.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useWaitingRoom('s1'));
    await waitFor(() => expect(get).toHaveBeenCalled());

    act(() => {
      emitServer('sessionState', snapshot());
    });
    expect(result.current.participants).toEqual([{ id: 'u1', displayName: 'Alice' }]);
    expect(result.current.memberNames.get('u1')).toBe('Alice');
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
