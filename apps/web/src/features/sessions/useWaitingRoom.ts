import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionStatePayload, SessionUserPayload } from '@roundtable/shared/events';

import { api } from '../../lib/api';
import { getSocket, joinSessionRoom, scheduleLeaveSessionRoom } from '../../lib/socket';

interface SessionMemberRow {
  userId: string;
  displayName: string;
  joinedAt: string;
}

/**
 * How long someone who drops out stays seated before they are drawn leaving.
 * A refresh is a disconnect and a reconnect a moment later; held this long,
 * it reads as nothing happening rather than as a leave and a join. The same
 * window `SessionJoinNotices` uses on the board.
 */
export const LEAVE_HOLD_MS = 1500;

/** Why the lobby is over: the Start everyone heard, or news of it on a rejoin. */
export type LobbyExit = 'started' | 'moved-on';

/**
 * Who is in the waiting room right now (F08), live: the join snapshot's
 * `participants` (docs/02 §4 — presence is in-memory), kept current by
 * `memberJoined`/`memberLeft`. Null until that first snapshot.
 *
 * Persisted membership (`GET /:id/members`) is read too, but only for names
 * (`memberNames`): it lists everyone who has joined and not left, including
 * people who closed their tab days ago, so seating it first put strangers at
 * the table who then had to leave again once the snapshot arrived. What it is
 * good for is naming the leader while they are away.
 *
 * Follows the reconnect pattern in `features/pinboard/usePinboard.ts`: every
 * `connect` re-emits `memberJoin`, because a reconnected socket belongs to no
 * rooms yet. Cleanup asks the server to leave the room
 * (`scheduleLeaveSessionRoom`): a client cannot `socket.leave()` a server
 * room, and the singleton stays connected on the dashboard. The leave is
 * deferred one tick so lobby → pinboard (and Strict Mode remounts) can rejoin
 * the same session without a presence flicker.
 *
 * `onLeftLobby` fires once the session is no longer waiting, saying why:
 * `started` on the `sessionStarted` broadcast (F09), the moment everyone shares;
 * `moved-on` on a join snapshot that says the session is already `active` or
 * `ended`. The second covers a socket that was down for the broadcast: it
 * rejoins on reconnect, and the snapshot is the only word it gets that the
 * room moved on, with no moment left to share. The caller (`WaitingRoom`, for
 * `SessionRouter`) re-reads the session, which switches the page to the board
 * or the ended page, without a poll or a manual refresh.
 */
export function useWaitingRoom(sessionId: string, onLeftLobby?: (why: LobbyExit) => void) {
  const [participants, setParticipants] = useState<SessionUserPayload[] | null>(null);
  const [memberNames, setMemberNames] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  /** The server refused this socket's join; it will not retry on its own. */
  const [joinFailed, setJoinFailed] = useState(false);
  const rejoinRef = useRef<(() => void) | null>(null);

  // Read through a ref, so the room effect below does not depend on it: a
  // caller passing a fresh callback each render would otherwise leave and
  // rejoin the room every render, and each rejoin's snapshot re-renders.
  const onLeftLobbyRef = useRef(onLeftLobby);
  useEffect(() => {
    onLeftLobbyRef.current = onLeftLobby;
  });

  const loading = participants === null && !joinFailed;

  const rememberNames = useCallback((people: readonly SessionUserPayload[]) => {
    setMemberNames((prev) => {
      if (people.every((person) => prev.get(person.id) === person.displayName)) return prev;
      const next = new Map(prev);
      for (const person of people) next.set(person.id, person.displayName);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    async function load() {
      try {
        const members = await api.get<SessionMemberRow[]>(`/api/sessions/${sessionId}/members`);
        if (!cancelled) {
          rememberNames(members.map((m) => ({ id: m.userId, displayName: m.displayName })));
        }
      } catch {
        // Names only. Without them an absent leader is "the leader".
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId, rememberNames]);

  useEffect(() => {
    if (!sessionId) return;
    const socket = getSocket();
    let cancelled = false;
    const heldLeaves = new Map<string, ReturnType<typeof setTimeout>>();

    const releaseLeave = (id: string) => {
      const held = heldLeaves.get(id);
      if (held === undefined) return false;
      clearTimeout(held);
      heldLeaves.delete(id);
      return true;
    };

    const join = () => {
      joinSessionRoom(sessionId, (res) => {
        if (cancelled) return;
        setIsLive(res.ok);
        setJoinFailed(!res.ok);
        if (!res.ok) {
          console.error(
            `[waiting-room] could not join the session room: ${res.error ?? 'unknown'}`,
          );
        }
      });
    };
    rejoinRef.current = join;

    const onConnect = () => join();
    const onDisconnect = () => setIsLive(false);

    const onSessionState = (snapshot: SessionStatePayload) => {
      if (cancelled || snapshot.sessionId !== sessionId) return;
      // The snapshot is the whole truth: nothing held from before it stands.
      for (const id of [...heldLeaves.keys()]) releaseLeave(id);
      setJoinFailed(false);
      setParticipants(snapshot.participants);
      rememberNames(snapshot.participants);
      setViewerId(snapshot.viewer.id);
      // Named rather than "not lobby", so a snapshot without a status (an
      // older server, a test fixture) is not read as the session moving on.
      if (snapshot.status === 'active' || snapshot.status === 'ended') {
        onLeftLobbyRef.current?.('moved-on');
      }
    };

    const onJoined = ({ user }: { user: SessionUserPayload }) => {
      if (cancelled) return;
      // Back within the hold: they never left, as far as anyone can see.
      releaseLeave(user.id);
      rememberNames([user]);
      setParticipants((prev) => {
        const base = prev ?? [];
        return base.some((p) => p.id === user.id) ? base : [...base, user];
      });
    };

    const onLeft = ({ user }: { user: SessionUserPayload }) => {
      if (cancelled) return;
      releaseLeave(user.id);
      heldLeaves.set(
        user.id,
        setTimeout(() => {
          heldLeaves.delete(user.id);
          if (cancelled) return;
          setParticipants((prev) => (prev ? prev.filter((p) => p.id !== user.id) : prev));
        }, LEAVE_HOLD_MS),
      );
    };

    const onStartedEvent = (payload: { sessionId: string; startedAt: string }) => {
      if (cancelled || payload.sessionId !== sessionId) return;
      onLeftLobbyRef.current?.('started');
    };

    if (socket.connected) onConnect();
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('sessionState', onSessionState);
    socket.on('memberJoined', onJoined);
    socket.on('memberLeft', onLeft);
    socket.on('sessionStarted', onStartedEvent);

    return () => {
      cancelled = true;
      rejoinRef.current = null;
      for (const held of heldLeaves.values()) clearTimeout(held);
      scheduleLeaveSessionRoom(sessionId);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('sessionState', onSessionState);
      socket.off('memberJoined', onJoined);
      socket.off('memberLeft', onLeft);
      socket.off('sessionStarted', onStartedEvent);
    };
  }, [sessionId, rememberNames]);

  /** Ask to join again, after the server refused. */
  const retryJoin = useCallback(() => rejoinRef.current?.(), []);

  return { participants, memberNames, viewerId, loading, isLive, joinFailed, retryJoin };
}
