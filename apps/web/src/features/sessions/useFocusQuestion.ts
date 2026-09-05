import { useCallback, useState } from 'react';

import { api, ApiClientError } from '../../lib/api';

/**
 * The leader pointing the board at a question without changing its status
 * (looking back at an answered pinboard). Same "wait for the broadcast"
 * rule as phase changes — the REST call only decides whether it is legal.
 */
export function useFocusQuestion(sessionId: string) {
  const [busyQuestionId, setBusyQuestionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const focus = useCallback(
    async (questionId: string): Promise<boolean> => {
      setBusyQuestionId(questionId);
      setError(null);
      try {
        await api.post(`/api/sessions/${sessionId}/focus`, { questionId });
        return true;
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : 'Failed to show that question');
        return false;
      } finally {
        setBusyQuestionId(null);
      }
    },
    [sessionId],
  );

  return { focus, busyQuestionId, error };
}
