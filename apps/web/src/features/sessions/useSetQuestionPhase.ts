import { useCallback, useState } from 'react';
import type { SetQuestionPhaseInput } from '@roundtable/shared/schemas';

import { api, ApiClientError } from '../../lib/api';

export type QuestionPhaseTarget = SetQuestionPhaseInput['status'];

/**
 * The leader's agenda control (F25, and F26 via `'skipped'`).
 *
 * Nothing is applied locally on success: the change arrives on the
 * `sessionPhase` broadcast, which the leader is also in the room for. Same
 * rule as proposing (`usePinboard.propose`) — the leader's own view is built
 * from the same events as everyone else's, so it cannot drift ahead of the
 * room by optimistically rendering a transition the server then rejected.
 */
export function useSetQuestionPhase(sessionId: string) {
  const [busyQuestionId, setBusyQuestionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setPhase = useCallback(
    async (questionId: string, status: QuestionPhaseTarget): Promise<boolean> => {
      setBusyQuestionId(questionId);
      setError(null);
      try {
        await api.post(`/api/sessions/${sessionId}/phase`, { questionId, status });
        return true;
      } catch (err) {
        // The server's message is the useful one here — "Question 2 is still
        // open", "a question that is skipped cannot become discussion" — so it
        // is shown as-is rather than replaced with a generic failure.
        setError(err instanceof ApiClientError ? err.message : 'Failed to move the agenda');
        return false;
      } finally {
        setBusyQuestionId(null);
      }
    },
    [sessionId],
  );

  return { setPhase, busyQuestionId, error };
}
