import { useCallback, useState } from 'react';

import { api, ApiClientError } from '../../lib/api';

/**
 * The leader rewording a question that has not started: a typo fixed rather
 * than the question removed.
 *
 * Nothing is applied locally on success: the new wording arrives on
 * `questionUpdated`, which the leader is also in the room for — the same rule
 * as the vote switch (`useSetQuestionVoting`).
 */
export function useSetQuestionText(sessionId: string) {
  const [busyQuestionId, setBusyQuestionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setText = useCallback(
    async (questionId: string, text: string): Promise<boolean> => {
      setBusyQuestionId(questionId);
      setError(null);
      try {
        await api.put(`/api/sessions/${sessionId}/questions/${questionId}/text`, { text });
        return true;
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : 'Failed to change the question');
        return false;
      } finally {
        setBusyQuestionId(null);
      }
    },
    [sessionId],
  );

  return { setText, busyQuestionId, error };
}
