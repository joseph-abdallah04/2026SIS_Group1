import type { BoardItem, BoardResponse } from '@roundtable/shared';
import type { SessionStatePayload } from '@roundtable/shared/events';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
const joinSessionRoom = vi.fn();
const scheduleLeaveSessionRoom = vi.fn();

type Handler = (payload: unknown) => void;
const listeners = new Map<string, Set<Handler>>();

const socket = {
  connected: true,
  emit: vi.fn(),
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

const { usePinboard } = await import('./usePinboard');

function sticky(id: string, overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id,
    questionId: 'q1',
    authorId: 'u1',
    authorName: 'Alice',
    type: 'sticky',
    artifactJson: { type: 'sticky', text: id, color: 'yellow' },
    x: 0,
    y: 0,
    createdAt: '2026-09-05T00:00:00.000Z',
    extendsProposalId: null,
    ...overrides,
  };
}

const REST_BOARD: BoardResponse = {
  sessionId: 's1',
  sessionTitle: 'Roadmap',
  leaderId: 'leader-1',
  questionId: 'q1',
  questionText: 'What ships first?',
  questionPosition: 0,
  questionStatus: 'discussion',
  items: [],
};

function snapshot(overrides: Partial<SessionStatePayload> = {}): SessionStatePayload {
  return {
    sessionId: 's1',
    sessionTitle: 'Roadmap',
    leaderId: 'leader-1',
    questionId: 'q1',
    questionText: 'What ships first?',
    questionPosition: 0,
    questionStatus: 'discussion',
    status: 'active',
    proposals: [],
    participants: [{ id: 'u1', displayName: 'Alice' }],
    viewer: { id: 'u1', displayName: 'Alice' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listeners.clear();
  socket.connected = true;
  get.mockResolvedValue(REST_BOARD);
  joinSessionRoom.mockImplementation((_id: string, ack?: (res: { ok: boolean }) => void) => {
    ack?.({ ok: true });
  });
  socket.emit.mockReset();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('usePinboard room wiring', () => {
  it('joins the session room on mount and leaves it on unmount', async () => {
    const { result, unmount } = renderHook(() => usePinboard('s1'));

    expect(joinSessionRoom).toHaveBeenCalledWith('s1', expect.any(Function));
    await waitFor(() => expect(result.current.isLive).toBe(true));

    unmount();
    expect(scheduleLeaveSessionRoom).toHaveBeenCalledWith('s1');
  });

  it('paints the REST board first, then takes the join snapshot as source of truth', async () => {
    const { result } = renderHook(() => usePinboard('s1'));
    await waitFor(() => expect(result.current.board).toEqual(REST_BOARD));

    act(() => {
      emitServer('sessionState', snapshot({ proposals: [sticky('p1')] }));
    });

    expect(result.current.board?.items.map((item) => item.id)).toEqual(['p1']);
    expect(result.current.viewerId).toBe('u1');
  });

  it('does not let the first REST read overwrite a snapshot that already landed', async () => {
    let resolveBoard!: (value: BoardResponse) => void;
    get.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBoard = resolve as (value: BoardResponse) => void;
        }),
    );

    const { result } = renderHook(() => usePinboard('s1'));
    act(() => {
      emitServer('sessionState', snapshot({ proposals: [sticky('live')] }));
    });
    expect(result.current.board?.items.map((item) => item.id)).toEqual(['live']);

    await act(async () => {
      resolveBoard({ ...REST_BOARD, items: [sticky('stale')] });
    });
    expect(result.current.board?.items.map((item) => item.id)).toEqual(['live']);
  });

  it('ignores a sessionState snapshot for a different session', async () => {
    const { result } = renderHook(() => usePinboard('s1'));
    await waitFor(() => expect(result.current.board).not.toBeNull());

    act(() => {
      emitServer('sessionState', snapshot({ sessionId: 'other', proposals: [sticky('nope')] }));
    });
    expect(result.current.board?.items).toEqual([]);
    expect(result.current.viewerId).toBeNull();
  });

  it('upserts, highlights, updates, and deletes live proposals on this question', async () => {
    const { result } = renderHook(() => usePinboard('s1'));
    await waitFor(() => expect(result.current.board).not.toBeNull());
    vi.useFakeTimers();

    act(() => {
      emitServer('proposalCreated', { proposal: sticky('p2') });
    });
    expect(result.current.board?.items.map((item) => item.id)).toEqual(['p2']);
    expect(result.current.newItemIds.has('p2')).toBe(true);

    act(() => {
      emitServer('proposalUpdated', { proposal: sticky('p2', { x: 40 }) });
    });
    expect(result.current.board?.items[0]?.x).toBe(40);

    act(() => {
      emitServer('proposalDeleted', { proposalId: 'p2', questionId: 'q1' });
    });
    expect(result.current.board?.items).toEqual([]);

    act(() => {
      vi.advanceTimersByTime(2400);
    });
    expect(result.current.newItemIds.has('p2')).toBe(false);
  });

  it('ignores a proposal event for a different question than the one on screen', async () => {
    const { result } = renderHook(() => usePinboard('s1'));
    await waitFor(() => expect(result.current.board).not.toBeNull());

    act(() => {
      emitServer('proposalCreated', { proposal: sticky('other-q', { questionId: 'q9' }) });
    });
    expect(result.current.board?.items).toEqual([]);
  });

  it('reloads the board when this session’s agenda moves, not when another session’s does', async () => {
    const { result } = renderHook(() => usePinboard('s1'));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));

    act(() => {
      emitServer('sessionPhase', { sessionId: 'other' });
      emitServer('sessionFocus', { sessionId: 'other' });
    });
    expect(get).toHaveBeenCalledTimes(1);

    const nextBoard = { ...REST_BOARD, questionId: 'q2', items: [sticky('q2-item', { questionId: 'q2' })] };
    get.mockResolvedValue(nextBoard);

    act(() => {
      emitServer('sessionPhase', { sessionId: 's1' });
    });
    await waitFor(() => expect(result.current.board?.questionId).toBe('q2'));
    expect(get).toHaveBeenCalledTimes(2);

    get.mockResolvedValue({ ...nextBoard, questionText: 'Looked back' });
    act(() => {
      emitServer('sessionFocus', { sessionId: 's1' });
    });
    await waitFor(() => expect(result.current.board?.questionText).toBe('Looked back'));
  });

  it('marks the board offline on disconnect', async () => {
    const { result } = renderHook(() => usePinboard('s1'));
    await waitFor(() => expect(result.current.isLive).toBe(true));

    act(() => emitServer('disconnect', undefined));
    expect(result.current.isLive).toBe(false);
  });

  it('surfaces a REST load failure', async () => {
    get.mockRejectedValue(new Error('board unavailable'));
    const { result } = renderHook(() => usePinboard('s1'));
    await waitFor(() => expect(result.current.error).toBe('board unavailable'));
    expect(result.current.loading).toBe(false);
  });
});

describe('usePinboard write intents', () => {
  const createInput = {
    type: 'sticky' as const,
    artifactJson: { type: 'sticky' as const, text: 'hello', color: 'yellow' as const },
    x: 10,
    y: 20,
  };

  it('emits proposalCreate and resolves when the server acks ok', async () => {
    socket.emit.mockImplementation((_event: string, _payload: unknown, ack?: (res: { ok: boolean }) => void) => {
      ack?.({ ok: true });
    });
    const { result } = renderHook(() => usePinboard('s1'));

    await act(async () => {
      await result.current.propose(createInput);
    });
    expect(socket.emit).toHaveBeenCalledWith('proposalCreate', createInput, expect.any(Function));
  });

  it('rejects with the server’s code so the tools can branch on why a write failed', async () => {
    socket.emit.mockImplementation(
      (_event: string, _payload: unknown, ack?: (res: { ok: boolean; error?: string; code?: string }) => void) => {
        ack?.({ ok: false, error: 'This session has ended — the board is read-only', code: 'SESSION_NOT_ACTIVE' });
      },
    );
    const { result } = renderHook(() => usePinboard('s1'));

    await act(async () => {
      await expect(result.current.propose(createInput)).rejects.toMatchObject({
        message: 'This session has ended — the board is read-only',
        code: 'SESSION_NOT_ACTIVE',
      });
    });
  });

  it('gives up on a write that never acks rather than leaving a drag hanging', async () => {
    socket.emit.mockImplementation(() => undefined);
    const { result, unmount } = renderHook(() => usePinboard('s1'));
    await waitFor(() => expect(result.current.board).not.toBeNull());

    vi.useFakeTimers();
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.editProposal({ id: 'p1', x: 4, y: 8 });
    });
    // Attach before the timer fires — otherwise the rejection is unhandled
    // for a tick and Vitest treats the file as failed even though the
    // assertion would have caught it.
    const assertion = expect(pending).rejects.toThrow(/No response from the server/);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    await assertion;
    unmount();
  });

  it('emits proposalDelete for a card the viewer authored', async () => {
    socket.emit.mockImplementation((_event: string, _payload: unknown, ack?: (res: { ok: boolean }) => void) => {
      ack?.({ ok: true });
    });
    const { result } = renderHook(() => usePinboard('s1'));

    await act(async () => {
      await result.current.deleteProposal('p1');
    });
    expect(socket.emit).toHaveBeenCalledWith('proposalDelete', { id: 'p1' }, expect.any(Function));
  });
});
