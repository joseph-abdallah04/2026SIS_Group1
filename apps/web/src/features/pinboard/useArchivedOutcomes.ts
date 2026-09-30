import { useEffect, useState } from 'react';

import { api } from '../../lib/api';

export interface ArchivedVoteOutcome {
  questionId: string;
  proposalIds: string[];
  winnerProposalId: string | null;
  tiedProposalIds: string[];
}

function isAbort(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'name' in err && err.name === 'AbortError';
}

function isOutcomeList(value: unknown): value is ArchivedVoteOutcome[] {
  return Array.isArray(value);
}

/**
 * Shortlists and closed results for an ended session, once.
 *
 * Ids only. A failure leaves the board unmarked rather than blocking it:
 * the cards are the review, and the marks are extra.
 */
export function useArchivedOutcomes(sessionId: string) {
  const [outcomes, setOutcomes] = useState<ArchivedVoteOutcome[] | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setOutcomes(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setOutcomes(null);

    api
      .get<unknown>(`/api/sessions/${encodeURIComponent(sessionId)}/outcomes`, {
        signal: controller.signal,
      })
      .then((data) => {
        if (cancelled) return;
        setOutcomes(isOutcomeList(data) ? data : []);
      })
      .catch((err: unknown) => {
        if (cancelled || isAbort(err)) return;
        setOutcomes([]);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [sessionId]);

  return outcomes;
}
