import { useCallback, useEffect, useState } from 'react';
import type { SessionSummary } from '@roundtable/shared';

import { api } from '../../lib/api';

/** The dashboard's list of sessions the current dev-identity leads or has joined. */
export function useSessions() {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const loading = sessions === null && error === null;
  const reload = useCallback(() => {
    setError(null);
    setSessions(null);
    setReloadToken((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await api.get<SessionSummary[]>('/api/sessions');
        if (!cancelled) setSessions(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load sessions');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  return { sessions, loading, error, reload };
}
