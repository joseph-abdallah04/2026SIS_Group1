import { useCallback, useState } from 'react';

import { api, ApiClientError } from '../../lib/api';

/**
 * The leader moving a question that has not started: one place up or down
 * (the keyboard), or into another question's place (a drag).
 *
 * Nothing is applied locally on success: every question whose place changed
 * arrives on `questionUpdated`, which the leader is also in the room for — the
 * same rule as the vote switch (`useSetQuestionVoting`).
 */
export function useMoveQuestion(sessionId: string) {
  const [busyQuestionId, setBusyQuestionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (
      questionId: string,
      body: { direction: 'up' | 'down' } | { toQuestionId: string },
    ): Promise<boolean> => {
      setBusyQuestionId(questionId);
      setError(null);
      try {
        await api.post(`/api/sessions/${sessionId}/questions/${questionId}/move`, body);
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

  const move = useCallback(
    (questionId: string, direction: 'up' | 'down') => send(questionId, { direction }),
    [send],
  );
  const place = useCallback(
    (questionId: string, toQuestionId: string) => send(questionId, { toQuestionId }),
    [send],
  );

  return { move, place, busyQuestionId, error };
}
