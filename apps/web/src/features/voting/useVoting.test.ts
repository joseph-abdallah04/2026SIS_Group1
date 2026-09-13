import { emptyVotingState, type VotingViewerState } from '@roundtable/shared';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();

type Handler = (payload: unknown) => void;
const listeners = new Map<string, Set<Handler>>();

const socket = {
  emit: vi.fn((_event: string, _payload: unknown, ack?: (res: unknown) => void) => {
    ack?.({ ok: true });
  }),
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
vi.mock('../../lib/socket', () => ({ getSocket: () => socket }));

const { useVoting } = await import('./useVoting');

const OPEN_ROUND: VotingViewerState = {
  ...emptyVotingState('q1'),
  phase: 'open',
  proposalIds: ['p1', 'p2'],
  tallies: [
    { proposalId: 'p1', votes: 0, percent: 0 },
    { proposalId: 'p2', votes: 0, percent: 0 },
  ],
  voterCount: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  listeners.clear();
  get.mockResolvedValue(OPEN_ROUND);
});

async function mounted() {
  const hook = renderHook(() => useVoting('s1', 'q1'));
  await waitFor(() => expect(hook.result.current.phase).toBe('open'));
  return hook;
}

describe('useVoting', () => {
  it('shows the ballot the server reports, not the one that was clicked', async () => {
    const { result } = await mounted();

    await act(async () => {
      await result.current.castVote('p1');
    });
    // The ack only says the write was accepted, so nothing is ticked yet.
    expect(socket.emit).toHaveBeenCalledWith('voteCast', { proposalId: 'p1' }, expect.any(Function));
    expect(result.current.myVote).toBeNull();

    act(() => {
      emitServer('votingUpdated', {
        ...OPEN_ROUND,
        votedCount: 1,
        tallies: [
          { proposalId: 'p1', votes: 1, percent: 100 },
          { proposalId: 'p2', votes: 0, percent: 0 },
        ],
        myVote: 'p1',
      });
    });
    expect(result.current.myVote).toBe('p1');
  });

  it('clears the tick when the server says this viewer has no ballot', async () => {
    const { result } = await mounted();

    act(() => {
      emitServer('votingUpdated', { ...OPEN_ROUND, myVote: 'p2' });
    });
    expect(result.current.myVote).toBe('p2');

    act(() => {
      emitServer('votingUpdated', { ...OPEN_ROUND, myVote: null });
    });
    expect(result.current.myVote).toBeNull();
  });

  it('keeps the known ballot when a payload carries no myVote at all', async () => {
    const { result } = await mounted();

    act(() => {
      emitServer('votingUpdated', { ...OPEN_ROUND, myVote: 'p1' });
    });
    act(() => {
      const withoutMyVote: Record<string, unknown> = { ...OPEN_ROUND, votedCount: 2 };
      delete withoutMyVote.myVote;
      emitServer('votingUpdated', withoutMyVote);
    });

    expect(result.current.myVote).toBe('p1');
    expect(result.current.votedCount).toBe(2);
  });

  it('locks the shortlist from the phase the server reported', async () => {
    const { result } = await mounted();
    expect(result.current.locked).toBe(true);

    act(() => {
      emitServer('votingUpdated', { ...OPEN_ROUND, phase: 'shortlisting' });
    });
    expect(result.current.locked).toBe(false);
  });
});
