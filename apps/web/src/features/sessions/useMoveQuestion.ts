import { useCallback, useState } from 'react';

import { api, ApiClientError } from '../../lib/api';

/**
 * The leader moving a question that has not started one place up or down.
 *
 * Nothing is applied locally on success: both questions that swap places
 * arrive on `questionUpdated`, which the leader is also in the room for — the
 * same rule as the vote switch (`useSetQuestionVoting`).
 */
export function useMoveQuestion(sessionId: string) {
  const [busyQuestionId, setBusyQuestionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const move = useCallback(
    async (questionId: string, direction: 'up' | 'down'): Promise<boolean> => {
      setBusyQuestionId(questionId);
      setError(null);
      try {
        await api.post(`/api/sessions/${sessionId}/questions/${questionId}/move`, { direction });
        return true;
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : 'Failed to move the question');
        return false;
      } finally {
        setBusyQuestionId(null);
      }
    },
    [sessionId],
  );

  return { move, busyQuestionId, error };
}
