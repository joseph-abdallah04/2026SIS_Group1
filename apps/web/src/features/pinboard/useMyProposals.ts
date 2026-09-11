import { useCallback, useEffect, useState } from 'react';
import type { AuthoredProposalsResponse } from '@roundtable/shared';

import { api } from '../../lib/api';

/**
 * Everything this member has proposed in the session (F38).
 *
 * A plain read rather than socket state. The board is live because everyone is
 * looking at the same thing at the same time; this list is one person's own
 * history, nobody else can change it, and the only events that alter it are
 * ones this client caused. So it is fetched, and refetched on the two things
 * that can make it stale: proposing something, and the board moving to a
 * different question.
 *
 * `revision` is whatever the caller has that changes when the board does. It is
 * deliberately opaque here, because what counts as a change belongs to the
 * board, not to this hook.
 */
export function useMyProposals(sessionId: string, revision: string) {
  const [data, setData] = useState<AuthoredProposalsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    api
      .get<AuthoredProposalsResponse>(`/api/sessions/${sessionId}/proposals/mine`)
      .then((next) => {
        if (cancelled) return;
        setError(null);
        setData(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // The board itself is unaffected, so this reports quietly and leaves
        // whatever was already listed on screen rather than blanking it.
        setError(err instanceof Error ? err.message : 'Could not load your proposals');
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, revision, reloadToken]);

  return { data, error, reload };
}
