import { useCallback, useEffect, useState } from 'react';
import type { Question, Session } from '@roundtable/shared';

import { api } from '../../lib/api';

export type SessionDetail = Session & { questions: Question[] };

/** Backs `SessionRouter`: the one fetch every `/sessions/:id` render dispatches on `status` from. */
export function useSessionDetail(sessionId: string) {
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const loading = session === null && error === null;
  const reload = useCallback(() => {
    setError(null);
    setSession(null);
    setReloadToken((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    async function load() {
      try {
        const data = await api.get<SessionDetail>(`/api/sessions/${sessionId}`);
        if (!cancelled) setSession(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load session');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId, reloadToken]);

  return { session, loading, error, reload };
}
