import { useCallback, useState } from 'react';

import { api, ApiClientError } from '../../lib/api';

/** F05: DELETE a draft. The confirmation step lives in the calling component. */
export function useDeleteSession() {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = useCallback(async (sessionId: string): Promise<boolean> => {
    setDeleting(true);
    setError(null);
    try {
      await api.delete(`/api/sessions/${sessionId}`);
      return true;
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to delete session');
      return false;
    } finally {
      setDeleting(false);
    }
  }, []);

  return { remove, deleting, error };
}
