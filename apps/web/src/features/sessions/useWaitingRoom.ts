import { useEffect, useState } from 'react';
import type { SessionStatePayload, SessionUserPayload } from '@roundtable/shared/events';

import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';

interface SessionMemberRow {
  userId: string;
  displayName: string;
  joinedAt: string;
}

/**
 * Live participant list for the waiting room (F08). First paint comes from
 * persisted membership (`GET /:id/members`) since it answers instantly and
 * without a socket; the join snapshot's `participants` then replaces it with
 * who is actually connected right now (docs/02 §4 — presence is in-memory,
 * membership history is persisted), and `memberJoined`/`memberLeft` keep it
 * live from there. Follows the reconnect pattern in
 * `features/pinboard/usePinboard.ts`: every `connect` re-emits `memberJoin`,
 * because a reconnected socket belongs to no rooms yet.
 */
export function useWaitingRoom(sessionId: string) {
  const [participants, setParticipants] = useState<SessionUserPayload[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);

  const loading = participants === null && error === null;

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    async function load() {
      try {
        const members = await api.get<SessionMemberRow[]>(`/api/sessions/${sessionId}/members`);
        if (!cancelled) {
          // Never overwrites a live snapshot that already arrived — this is
          // strictly the placeholder before the socket confirms who's really here.
          setParticipants(
            (prev) => prev ?? members.map((m) => ({ id: m.userId, displayName: m.displayName })),
          );
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load members');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const socket = getSocket();
    let cancelled = false;

    const join = () => {
      socket.emit('memberJoin', { sessionId }, (res) => {
        if (cancelled) return;
        setIsLive(res.ok);
        if (!res.ok) {
          console.error(`[waiting-room] could not join the session room: ${res.error ?? 'unknown'}`);
        }
      });
    };

    const onConnect = () => join();
    const onDisconnect = () => setIsLive(false);

    const onSessionState = (snapshot: SessionStatePayload) => {
      if (cancelled || snapshot.sessionId !== sessionId) return;
      setError(null);
      setParticipants(snapshot.participants);
    };

    const onJoined = ({ user }: { user: SessionUserPayload }) => {
      setParticipants((prev) => {
        const base = prev ?? [];
        return base.some((p) => p.id === user.id) ? base : [...base, user];
      });
    };

    const onLeft = ({ user }: { user: SessionUserPayload }) => {
      setParticipants((prev) => (prev ? prev.filter((p) => p.id !== user.id) : prev));
    };

    if (socket.connected) onConnect();
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('sessionState', onSessionState);
    socket.on('memberJoined', onJoined);
    socket.on('memberLeft', onLeft);

    return () => {
      cancelled = true;
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('sessionState', onSessionState);
      socket.off('memberJoined', onJoined);
      socket.off('memberLeft', onLeft);
    };
  }, [sessionId]);

  return { participants, loading, error, isLive };
}
