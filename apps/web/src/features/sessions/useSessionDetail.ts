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
   * Re-read the session without blanking it. What the page shows stays up
   * until the new copy arrives, so a status change swaps one view for the other
   * in a single render: lobby → board on Start, either → the ended page on End.
   * That matters beyond looks. The two views join the same socket and voice
   * rooms, and a swap in one commit lets the board's join cancel the lobby's
   * deferred leave, where a "Loading session…" gap in between used to drop
   * everyone out of the room and back in. Overlapping calls collapse: the
   * effect below abandons the older fetch.
   *
   * A failed refresh still lands on the error page (`error` wins in the
   * router), the same as a failed `reload`.
   */
  const refresh = useCallback(() => {
    setReloadToken((n) => n + 1);
  }, []);

  /**
   * Patch one question's status in place (F25) — deliberately not a `reload`.
   * `reload` blanks the session while it refetches, which on a phase change
   * would drop the whole live view behind "Loading session…" every time the
   * leader advanced the agenda. The `sessionPhase` broadcast carries the new
   * status, so the refetch has nothing to add.
   */
  const applyQuestionPhase = useCallback(
    (questionId: string, status: QuestionStatus, skipReason?: string | null) => {
      setSession((prev) =>
        prev
          ? {
              ...prev,
              questions: prev.questions.map((question) =>
                question.id === questionId
                  ? {
                      ...question,
                      status,
                      // Why it was skipped travels with the skip.
                      ...(status === 'skipped' ? { skipReason: skipReason ?? null } : {}),
                    }
                  : question,
              ),
            }
          : prev,
      );
    },
    [],
  );

  const applyAddedQuestion = useCallback((question: Question) => {
    setSession((prev) => {
      if (!prev) return prev;
      if (prev.questions.some((row) => row.id === question.id)) return prev;
      return {
        ...prev,
        questions: [...prev.questions, question].sort((a, b) => a.position - b.position),
      };
    });
  }, []);

  /**
   * Take a question's vote choice (F41), wording and place in the agenda from
   * `questionUpdated`. Only those fields — status belongs to `sessionPhase`,
   * and an older copy of the row arriving after a phase change must not put
   * the question back a step.
   */
  const applyUpdatedQuestion = useCallback((question: Question) => {
    setSession((prev) =>
      prev
        ? {
            ...prev,
            questions: prev.questions
              .map((row) =>
                row.id === question.id
                  ? {
                      ...row,
                      votingEnabled: question.votingEnabled,
                      text: question.text,
                      position: question.position,
                    }
                  : row,
              )
              .sort((a, b) => a.position - b.position),
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

  return {
    session,
    loading,
    error,
    reload,
    refresh,
    applyQuestionPhase,
    applyAddedQuestion,
    applyUpdatedQuestion,
  };
}
