import { useCallback, useState } from 'react';

import { api, ApiClientError } from '../../lib/api';

/** F07: explicit "Leave session" — distinct from just navigating away, which is not a leave. */
export function useLeaveSession() {
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leave = useCallback(async (sessionId: string): Promise<boolean> => {
    setLeaving(true);
    setError(null);
    try {
      await api.post(`/api/sessions/${sessionId}/leave`, {});
      return true;
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to leave session');
      return false;
    } finally {
      setLeaving(false);
    }
  }, []);

  return { leave, leaving, error };
}
