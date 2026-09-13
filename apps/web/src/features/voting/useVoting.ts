import { useCallback, useEffect, useState } from 'react';
import {
  emptyVotingState,
  isShortlistLocked,
  type VotingPublicState,
  type VotingViewerState,
  type VotingVoterStatus,
} from '@roundtable/shared';
import type { SessionStatePayload, WriteAck } from '@roundtable/shared/events';

import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';

type VotingUpdatedPayload = VotingPublicState & {
  voterStatuses?: VotingVoterStatus[];
  myVote?: string | null;
};

const WRITE_TIMEOUT_MS = 8000;

function writeIntent(
  send: (ack: (res: WriteAck) => void) => void,
  rejectionFallback: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('No response from the server — check your connection'));
    }, WRITE_TIMEOUT_MS);

    send((res) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (res.ok) {
        resolve();
        return;
      }
      const error = new Error(res.error ?? rejectionFallback);
      reject(res.code ? Object.assign(error, { code: res.code }) : error);
    });
  });
}

/**
 * F27–F30 voting for the question currently on the board.
 *
 * Writes go through the socket and stick only when the broadcast comes back,
 * same as pinboard. `myVote` is personal: the public `votingUpdated` event
 * never carries it, so a successful ack is what records this viewer's choice
 * until the next join snapshot.
 */
export function useVoting(sessionId: string, questionId: string | null) {
  const [voting, setVoting] = useState<VotingViewerState>(emptyVotingState(questionId));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const applyViewer = useCallback(
    (next: VotingViewerState) => {
      if (next.questionId && questionId && next.questionId !== questionId) return;
      setVoting(next);
    },
    [questionId],
  );

  const applyPublic = useCallback(
    (next: VotingUpdatedPayload) => {
      if (next.questionId && questionId && next.questionId !== questionId) return;
      setVoting((prev) => ({
        ...next,
        // `myVote` and `voterStatuses` are attached per socket, so this
        // viewer's own ballot arrives here when the server has one for us.
        // Falling back to the previous value covers a payload from a build
        // that predates the field; a question change resets both.
        myVote:
          next.myVote !== undefined
            ? next.myVote
            : prev.questionId === next.questionId
              ? prev.myVote
              : null,
        voterStatuses:
          next.voterStatuses !== undefined
            ? next.voterStatuses
            : prev.questionId === next.questionId
              ? prev.voterStatuses
              : null,
      }));
    },
    [questionId],
  );

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;

    async function load() {
      try {
        const data = await api.get<VotingViewerState>(`/api/sessions/${sessionId}/voting`);
        if (!cancelled) {
          setError(null);
          applyViewer(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load voting');
        }
      }
    }

    void load();
    const socket = getSocket();
    const onPhase = (payload: { sessionId: string }) => {
      if (payload.sessionId === sessionId) void load();
    };
    socket.on('sessionPhase', onPhase);
    return () => {
      cancelled = true;
      socket.off('sessionPhase', onPhase);
    };
  }, [sessionId, questionId, applyViewer]);

  useEffect(() => {
    if (!sessionId) return;
    const socket = getSocket();

    const onSnapshot = (snapshot: SessionStatePayload) => {
      if (snapshot.sessionId !== sessionId) return;
      applyViewer(snapshot.voting);
    };

    const onUpdated = (payload: VotingUpdatedPayload) => {
      applyPublic(payload);
    };

    socket.on('sessionState', onSnapshot);
    socket.on('votingUpdated', onUpdated);
    return () => {
      socket.off('sessionState', onSnapshot);
      socket.off('votingUpdated', onUpdated);
    };
  }, [sessionId, applyPublic, applyViewer]);

  const run = useCallback(async (work: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }, []);

  // Ticking a card is a board write, not a bar action — do not flip `busy` or
  // the proceed control flashes "Working…" on every select.
  const runQuiet = useCallback(async (work: () => Promise<void>, fallback: string) => {
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    }
  }, []);

  const toggle = useCallback(
    (proposalId: string) => {
      if (busy) return Promise.resolve();
      return runQuiet(
        () =>
          writeIntent(
            (ack) => getSocket().emit('shortlistToggle', { proposalId }, ack),
            'Could not update the shortlist',
          ),
        'Could not update the shortlist',
      );
    },
    [busy, runQuiet],
  );

  const clear = useCallback(
    () =>
      run(
        () =>
          writeIntent(
            (ack) => getSocket().emit('shortlistClear', {}, ack),
            'Could not clear the shortlist',
          ),
        'Could not clear the shortlist',
      ),
    [run],
  );

  const startVote = useCallback(
    () =>
      run(
        () =>
          writeIntent(
            (ack) => getSocket().emit('votingStart', {}, ack),
            'Could not start the vote',
          ),
        'Could not start the vote',
      ),
    [run],
  );

  const castVote = useCallback(
    (proposalId: string) => {
      if (busy) return Promise.resolve();
      // Nothing is applied locally on success: the ballot the server stored
      // comes back on `votingUpdated` as this socket's own `myVote`, so the
      // tick follows what was written rather than what was asked for.
      return run(
        () =>
          writeIntent(
            (ack) => getSocket().emit('voteCast', { proposalId }, ack),
            'Could not submit your vote',
          ),
        'Could not submit your vote',
      );
    },
    [busy, run],
  );

  const closeVote = useCallback(
    () =>
      run(
        () =>
          writeIntent((ack) => getSocket().emit('votingClose', {}, ack), 'Could not end the vote'),
        'Could not end the vote',
      ),
    [run],
  );

  const continueVote = useCallback(
    () =>
      run(
        () =>
          writeIntent(
            (ack) => getSocket().emit('votingContinue', {}, ack),
            'Could not continue',
          ),
        'Could not continue',
      ),
    [run],
  );

  return {
    phase: voting.phase,
    proposalIds: voting.proposalIds,
    locked: isShortlistLocked(voting.phase),
    tallies: voting.tallies,
    votedCount: voting.votedCount,
    voterCount: voting.voterCount,
    myVote: voting.myVote,
    voterStatuses: voting.voterStatuses,
    winnerProposalId: voting.winnerProposalId,
    tiedProposalIds: voting.tiedProposalIds,
    votingEndsAt: voting.votingEndsAt,
    error,
    busy,
    toggle,
    clear,
    startVote,
    castVote,
    closeVote,
    continueVote,
  };
}
