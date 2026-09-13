import { useCallback, useState } from 'react';

import { api, ApiClientError } from '../../lib/api';

/**
 * Leader appending a question to a live agenda.
 *
 * Nothing is applied locally on success: the new row arrives on
 * `questionAdded`, which the leader is also in the room for. Same rule as
 * `useSetQuestionPhase`.
 */
export function useAddSessionQuestion(sessionId: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addQuestion = useCallback(
    async (text: string): Promise<boolean> => {
      const trimmed = text.trim();
      if (!trimmed) return false;
      setBusy(true);
      setError(null);
      try {
        await api.post(`/api/sessions/${sessionId}/questions`, { text: trimmed });
        return true;
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : 'Failed to add the question');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [sessionId],
  );

  return { addQuestion, busy, error };
}
