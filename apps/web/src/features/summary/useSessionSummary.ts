import { useCallback, useEffect, useState } from 'react';
import type { SessionRecap } from '@roundtable/shared';

import { api } from '../../lib/api';

interface Loaded {
  /** Whose summary this is, so another session's is never shown as this one's. */
  sessionId: string;
  summary: SessionRecap | null;
  error: string | null;
}

/**
 * F31 recap for an ended session. Assembled on the server from existing
 * session, pinboard, and voting reads — this hook only reads it.
 *
 * `reload` asks again after a failure, back to loading in the meantime.
 */
export function useSessionSummary(sessionId: string) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    async function load() {
      try {
        const data = await api.get<SessionRecap>(
          `/api/sessions/${encodeURIComponent(sessionId)}/summary`,
        );
        if (!cancelled) setLoaded({ sessionId, summary: data, error: null });
      } catch (err) {
        if (!cancelled) {
          setLoaded({
            sessionId,
            summary: null,
            error: err instanceof Error ? err.message : 'Could not load the summary',
          });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId, attempt]);

  const reload = useCallback(() => {
    setLoaded(null);
    setAttempt((count) => count + 1);
  }, []);

  // What was loaded for another session (the id in the URL changed) is not
  // this one's: it reads as loading until this one's arrives.
  const current = loaded?.sessionId === sessionId ? loaded : null;
  const summary = current?.summary ?? null;
  const error = current?.error ?? null;
  return { summary, loading: summary === null && error === null, error, reload };
}
