import type { SessionStatePayload } from '@roundtable/shared/events';
import { verifyToken } from '../modules/auth/index.js';
import { getBoardForSession, registerPinboardSocketHandlers } from '../modules/pinboard/index.js';
import { getSession, getSessionMemberIdentity } from '../modules/sessions/index.js';
import { sessionRoom, type RealtimeServer, type RealtimeSocket, type SocketUser } from './types.js';

async function authenticateJoin(socket: RealtimeSocket, sessionId: string): Promise<SocketUser | null> {
  const token = socket.handshake.auth?.token;
  if (!token) return null;

  const verified = verifyToken(token);
  if (!verified.ok) return null;

  const identity = await getSessionMemberIdentity(sessionId, verified.userId);
  return identity ?? null;
}

async function getRoomParticipants(io: RealtimeServer, sessionId: string): Promise<SocketUser[]> {
  const sockets = await io.in(sessionRoom(sessionId)).fetchSockets();
  const users = new Map<string, SocketUser>();
  for (const s of sockets) {
    if (s.data.user) users.set(s.data.user.id, s.data.user);
  }
  return [...users.values()];
}

export function registerRealtimeGateway(io: RealtimeServer): void {
  io.on("connection", (socket) => {
    socket.data.user = null;
    socket.data.sessionId = null;

    //
    // MEMBER JOIN
    //
    socket.on("memberJoin", ({ sessionId }, ack) => {
      void (async () => {
        const user = await authenticateJoin(socket, sessionId);
        if (!user) return ack?.({ ok: false, error: 'Not authorised' });

        const session = await getSession(sessionId);
        if (!session) return ack?.({ ok: false, error: 'Session not found' });

        socket.data.user = user;
        socket.data.sessionId = sessionId;
        await socket.join(sessionRoom(sessionId));

        const { items, ...meta } = await getBoardForSession(sessionId);

        const snapshot: SessionStatePayload = {
          ...meta,
          proposals: items,
          status: session.status,
          leaderId: session.leaderId,
          participants: await getRoomParticipants(io, sessionId),
          viewer: user,
          sessionId,
        };

        socket.emit('sessionState', snapshot);
        ack?.({ ok: true });
      })();
    });

    //
    // IMPORTANT: register pinboard handlers FIRST
    //
    registerPinboardSocketHandlers(io, socket);

    //
    // SHORTLIST UPDATED — LIVE BROADCAST
    //
    socket.on("shortlist_updated", ({ sessionId, shortlist }) => {
      io.to(sessionRoom(sessionId)).emit("shortlist_updated", shortlist);
    });

    //
    // SHORTLIST LOCKED
    //
    socket.on("shortlist_locked", ({ sessionId }) => {
      io.to(sessionRoom(sessionId)).emit("shortlist_locked");
    });

    //
    // VOTING STARTED
    //
    socket.on("voting_started", ({ sessionId }) => {
      io.to(sessionRoom(sessionId)).emit("voting_started");
    });
  });
}