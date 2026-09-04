import { useCallback, useState } from 'react';
import type { Session } from '@roundtable/shared';

import { api, ApiClientError } from '../../lib/api';

/**
 * F32: leader-only lobby/active -> ended. Like `useStartSession`, the returned
 * session is not what moves anyone to the final screen — the server's
 * `sessionEnded` broadcast is (see `useSessionEndedListener`), so the leader
 * and every participant transition off the same event rather than the leader
 * navigating locally and everyone else finding out separately.
 */
export function useEndSession(sessionId: string) {
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const end = useCallback(async (): Promise<Session | null> => {
    setEnding(true);
    setError(null);
    try {
      return await api.post<Session>(`/api/sessions/${sessionId}/end`, {});
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to end session');
      return null;
    } finally {
      setEnding(false);
    }
  }, [sessionId]);

  return { end, ending, error };
}
