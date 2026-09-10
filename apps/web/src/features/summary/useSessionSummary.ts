import { useEffect, useState } from 'react';
import type { SessionRecap } from '@roundtable/shared';

import { api } from '../../lib/api';

/**
 * F31 recap for an ended session. Assembled on the server from existing
 * session, pinboard, and voting rows — this hook only reads it.
 */
export function useSessionSummary(sessionId: string) {
  const [summary, setSummary] = useState<SessionRecap | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loading = summary === null && error === null;

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    async function load() {
      try {
        const data = await api.get<SessionRecap>(`/api/sessions/${sessionId}/summary`);
        if (!cancelled) {
          setError(null);
          setSummary(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load the summary');
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return { summary, loading, error };
}
