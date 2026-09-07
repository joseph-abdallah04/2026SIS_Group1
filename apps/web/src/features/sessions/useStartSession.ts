import { useCallback, useState } from 'react';
import type { Session } from '@roundtable/shared';

import { api, ApiClientError } from '../../lib/api';

/**
 * F09: leader-only lobby -> active. The REST call itself only flips this
 * caller's view — every *other* waiting client moves over on receipt of the
 * `sessionStarted` broadcast the server sends alongside this response (see
 * `useWaitingRoom`'s `onStarted`), not from this hook's return value.
 */
export function useStartSession(sessionId: string) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async (): Promise<Session | null> => {
    setStarting(true);
    setError(null);
    try {
      return await api.post<Session>(`/api/sessions/${sessionId}/start`, {});
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to start session');
      return null;
    } finally {
      setStarting(false);
    }
  }, [sessionId]);

  return { start, starting, error };
}
