import { useCallback, useState } from 'react';

import { api, ApiClientError } from '../../lib/api';

/**
 * F41: the leader turning one question's vote on or off mid-session.
 *
 * Nothing is applied locally on success: the change arrives on
 * `questionUpdated`, which the leader is also in the room for. Same rule as
 * `useSetQuestionPhase` — a toggle the server refused (voting already opened)
 * must not flash on in the leader's agenda first.
 */
export function useSetQuestionVoting(sessionId: string) {
  const [busyQuestionId, setBusyQuestionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setVoting = useCallback(
    async (questionId: string, votingEnabled: boolean): Promise<boolean> => {
      setBusyQuestionId(questionId);
      setError(null);
      try {
        await api.patch(`/api/sessions/${sessionId}/questions/${questionId}`, { votingEnabled });
        return true;
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : 'Failed to change the vote');
        return false;
      } finally {
        setBusyQuestionId(null);
      }
    },
    [sessionId],
  );

  return { setVoting, busyQuestionId, error };
}
