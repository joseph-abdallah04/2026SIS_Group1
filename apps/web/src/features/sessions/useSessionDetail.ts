import { useCallback, useEffect, useState } from 'react';
import type { Question, QuestionStatus, Session } from '@roundtable/shared';

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

  /**
   * Patch one question's status in place (F25) — deliberately not a `reload`.
   * `reload` blanks the session while it refetches, which on a phase change
   * would drop the whole live view behind "Loading session…" every time the
   * leader advanced the agenda. The `sessionPhase` broadcast carries the new
   * status, so the refetch has nothing to add.
   */
  const applyQuestionPhase = useCallback((questionId: string, status: QuestionStatus) => {
    setSession((prev) =>
      prev
        ? {
            ...prev,
            questions: prev.questions.map((question) =>
              question.id === questionId ? { ...question, status } : question,
            ),
          }
        : prev,
    );
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

  return { session, loading, error, reload, applyQuestionPhase };
}
