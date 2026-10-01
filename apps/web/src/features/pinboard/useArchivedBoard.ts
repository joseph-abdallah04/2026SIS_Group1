import { useCallback, useEffect, useState } from 'react';
import type { BoardResponse } from '@roundtable/shared';

import { api } from '../../lib/api';

function isAbort(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'name' in err && err.name === 'AbortError';
}

/**
 * One ended question's board, over HTTP only.
 *
 * Nothing here joins the live room. A later question cancels the request
 * already in flight, and a response is applied only when it is still the
 * question on screen — a slow board must not paint over the one chosen after it.
 */
export function useArchivedBoard(sessionId: string, questionId: string | null) {
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [loading, setLoading] = useState(questionId !== null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    if (!sessionId || !questionId) {
      setBoard(null);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(null);
    setBoard(null);

    const path = `/api/sessions/${encodeURIComponent(sessionId)}/proposals?questionId=${encodeURIComponent(questionId)}`;
    api
      .get<BoardResponse>(path, { signal: controller.signal })
      .then((data) => {
        if (cancelled) return;
        // This request is still the current one, but it named a different
        // question. Leaving loading set would spin forever.
        if (data.questionId !== questionId) {
          setBoard(null);
          setError('Could not load this board');
          setLoading(false);
          return;
        }
        setBoard(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled || isAbort(err)) return;
        setBoard(null);
        setError(err instanceof Error ? err.message : 'Could not load this board');
        setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [sessionId, questionId, reloadToken]);

  return { board, loading, error, reload };
}
