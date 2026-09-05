// Session Lifecycle's realtime gateway (F08): room membership, presence, and
// the join-time snapshot every module's socket handlers build on.
//
// Both halves of the join check are now real. The stand-in this file used to
// carry — trust a client-claimed `devUserId`, refuse outright in production —
// is gone, because the Auth module (F01/F02) landed the JWT verification it
// was waiting on. Nothing in `modules/pinboard/` had to change for that: it
// only ever relied on `socket.data.user` / `socket.data.sessionId` being
// trustworthy, which is now true in production too.
import type { SessionStatePayload } from '@roundtable/shared/events';

import { verifyToken } from '../modules/auth/index.js';
import { getBoardForSession, registerPinboardSocketHandlers } from '../modules/pinboard/index.js';
import { getSession, getSessionMemberIdentity } from '../modules/sessions/index.js';
import { sessionRoom, type RealtimeServer, type RealtimeSocket, type SocketUser } from './types.js';

/**
 * Decide who this socket is, and confirm they belong in this session.
 *
 * Two independent checks, and both must pass: the handshake token has to
 * verify (who you are), and that user has to be a member of this session
 * (whether you may be here). A valid token for a session you never joined is
 * refused — authentication is not authorisation.
 *
 * Returns the identity from `getSessionMemberIdentity` rather than anything the
 * client sent, so `socket.data.user` can never carry a display name or id the
 * client chose. There is deliberately no fallback: a socket with no usable
 * token does not join, because the alternatives (guess the leader, trust a
 * claimed id) both attribute one person's actions to another.
 */
async function authenticateJoin(
  socket: RealtimeSocket,
  sessionId: string,
): Promise<SocketUser | null> {
  // Same token the REST client sends as `Authorization: Bearer` — Socket.IO
  // has no headers on the handshake, so it travels in `auth` instead.
  const token = socket.handshake.auth?.token;
  if (typeof token !== 'string' || token.length === 0) {
    console.warn(`[realtime] rejected join for ${sessionId}: no handshake token`);
    return null;
  }

  const verified = verifyToken(token);
  if (!verified.ok) {
    console.warn(`[realtime] rejected join for ${sessionId}: ${verified.code}`);
    return null;
  }

  const identity = await getSessionMemberIdentity(sessionId, verified.userId);
  if (!identity) {
    console.warn(`[realtime] rejected join: ${verified.userId} is not a member of ${sessionId}`);
    return null;
  }
  return identity;
}

/** Every distinct user currently connected to this session's room. */
async function getRoomParticipants(io: RealtimeServer, sessionId: string): Promise<SocketUser[]> {
  const sockets = await io.in(sessionRoom(sessionId)).fetchSockets();
  const byUserId = new Map<string, SocketUser>();
  for (const s of sockets) {
    if (s.data.user) byUserId.set(s.data.user.id, s.data.user);
  }
  return [...byUserId.values()];
}

/** Whether any *other* socket for this user is still in the room. */
async function userHasAnotherSocketInRoom(
  io: RealtimeServer,
  sessionId: string,
  userId: string,
  excludeSocketId: string,
): Promise<boolean> {
  const sockets = await io.in(sessionRoom(sessionId)).fetchSockets();
  return sockets.some((s) => s.id !== excludeSocketId && s.data.user?.id === userId);
}

export function registerRealtimeGateway(io: RealtimeServer): void {
  io.on('connection', (socket) => {
    socket.data.user = null;
    socket.data.sessionId = null;

    socket.on('memberJoin', ({ sessionId }, ack) => {
      void (async () => {
        try {
          if (typeof sessionId !== 'string' || sessionId.length === 0) {
            ack?.({ ok: false, error: 'sessionId is required' });
            return;
          }

          const user = await authenticateJoin(socket, sessionId);
          if (!user) {
            ack?.({ ok: false, error: 'Not authorised to join this session' });
            return;
          }

          const session = await getSession(sessionId);
          if (!session) {
            ack?.({ ok: false, error: 'Session not found' });
            return;
          }

          // Moving between sessions on one socket must not leave it subscribed
          // to the old room, or it keeps receiving events for a session it no
          // longer shows. Only announce a leave if this was this user's last
          // socket in that room — a second tab closing is not the user leaving.
          const previous = socket.data.sessionId;
          if (previous && previous !== sessionId) {
            await socket.leave(sessionRoom(previous));
            const stillThere = await userHasAnotherSocketInRoom(io, previous, user.id, socket.id);
            if (!stillThere) {
              socket.to(sessionRoom(previous)).emit('memberLeft', { user });
            }
          }

          // Checked *before* this socket joins, so it reflects only other
          // sockets — the question is "was this user already present",  not
          // "is this socket in the room yet".
          const alreadyPresent = await userHasAnotherSocketInRoom(
            io,
            sessionId,
            user.id,
            socket.id,
          );

          socket.data.user = user;
          socket.data.sessionId = sessionId;
          await socket.join(sessionRoom(sessionId));

          // Snapshot on join (docs/02 §4). It carries the whole board plus the
          // sessions-owned fields the join screens need (status, leader,
          // who's here) — a reconnecting client resyncs from this alone, so
          // anything left out would render as a placeholder until some other
          // request happened to fill it in.
          const { items, ...meta } = await getBoardForSession(sessionId);
          const snapshot: SessionStatePayload = {
            ...meta,
            proposals: items,
            status: session.status,
            leaderId: session.leaderId,
            participants: await getRoomParticipants(io, sessionId),
            // `viewer` tells the client who the server thinks it is, so the
            // board can offer author-only controls (F16) against the same
            // identity the write path will check, rather than a locally
            // remembered guess. With `leaderId` beside it, one snapshot answers
            // both "is this mine" and "am I the leader".
            viewer: user,
          };
          socket.emit('sessionState', snapshot);

          if (!alreadyPresent) {
            socket.to(sessionRoom(sessionId)).emit('memberJoined', { user });
          }

          ack?.({ ok: true });
        } catch (err) {
          console.error('[realtime] memberJoin failed:', err);
          ack?.({ ok: false, error: 'Failed to join session' });
        }
      })();
    });

    registerPinboardSocketHandlers(io, socket);

    socket.on('disconnect', () => {
      const { user, sessionId } = socket.data;
      if (!user || !sessionId) return;

      void (async () => {
        // By the time `disconnect` fires the socket has already left every
        // room, so this reflects only sockets other than the one closing.
        const stillThere = await userHasAnotherSocketInRoom(io, sessionId, user.id, socket.id);
        if (!stillThere) {
          socket.to(sessionRoom(sessionId)).emit('memberLeft', { user });
        }
      })();
    });
  });
}
