import { useCallback, useState } from 'react';
import type { Session } from '@roundtable/shared';

import { api, ApiClientError } from '../../lib/api';

/**
 * F09: leader-only lobby -> active. Every waiting client, the leader's
 * included, moves over on the `sessionStarted` broadcast the server sends
 * alongside this response (see `useWaitingRoom`'s `onLeftLobby`). The caller
 * also re-reads the session when this resolves, for a leader whose socket was
 * down when the broadcast went out.
 *
 * `starting` stays true once the start has gone through: the lobby is on its
 * way out, and a second press would only start it again (the server answers
 * an already-active session with another broadcast, which sends everyone
 * through the switch twice). Only a failure hands the button back.
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
      setStarting(false);
      return null;
    }
  }, [sessionId]);

  return { start, starting, error };
}
