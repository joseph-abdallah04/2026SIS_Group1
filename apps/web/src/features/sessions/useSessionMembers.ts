import { useEffect, useState } from 'react';

import { api } from '../../lib/api';

export interface SessionMemberRow {
  userId: string;
  displayName: string;
  joinedAt: string;
}

/**
 * Persisted membership, with no live presence attached.
 *
 * `useWaitingRoom` reads the same endpoint but only as a first paint before
 * the socket tells it who is *connected*; this is for F32's final screen,
 * where presence is meaningless — the session is over and the useful answer is
 * who took part. The server returns members who had not left when it ended
 * (`leftAt IS NULL`), so this is that list.
 */
export function useSessionMembers(sessionId: string) {
  const [members, setMembers] = useState<SessionMemberRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loading = members === null && error === null;

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    async function load() {
      try {
        const rows = await api.get<SessionMemberRow[]>(`/api/sessions/${sessionId}/members`);
        if (!cancelled) setMembers(rows);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load members');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return { members, loading, error };
}
