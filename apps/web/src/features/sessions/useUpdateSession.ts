import { useCallback, useState } from 'react';
import type { Question, Session } from '@roundtable/shared';
import type { CreateSessionInput } from '@roundtable/shared/schemas';

import { api, ApiClientError } from '../../lib/api';

/** F05: PATCH a draft's title + question list. */
export function useUpdateSession(sessionId: string) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback(
    async (input: CreateSessionInput): Promise<(Session & { questions: Question[] }) | null> => {
      setSubmitting(true);
      setError(null);
      try {
        return await api.patch<Session & { questions: Question[] }>(
          `/api/sessions/${sessionId}`,
          input,
        );
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : 'Failed to update session');
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [sessionId],
  );

  return { update, submitting, error };
}
