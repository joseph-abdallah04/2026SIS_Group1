// Session Lifecycle's realtime gateway (F08): room membership, presence, and
// the join-time snapshot every module's socket handlers build on.
//
// JWT handshake auth is still a stand-in — `authenticateJoin` trusts a
// client-claimed `devUserId`, checked against real membership, and refuses
// outright in production. That half becomes real once the Auth owner lands
// JWT verification; nothing else here (rooms, snapshot, presence) changes
// when it does, and nothing in `modules/pinboard/` depends on the stand-in
// behaviour — it only relies on `socket.data.user` / `socket.data.sessionId`
// being trustworthy.
import type { SessionStatePayload } from '@roundtable/shared/events';

import { env } from '../env.js';
import { getBoardForSession, registerPinboardSocketHandlers } from '../modules/pinboard/index.js';
import { getSession, getSessionMemberIdentity } from '../modules/sessions/index.js';
import { sessionRoom, type RealtimeServer, type RealtimeSocket, type SocketUser } from './types.js';

const IS_PRODUCTION = env.NODE_ENV === 'production';

/**
 * Decide who this socket is for this session, and confirm they belong here.
 *
 * TODO(auth): replace the `devUserId` branch with verifying
 * `socket.handshake.auth.token` and taking the id from that instead of the
 * client's claim. The membership check itself — `getSessionMemberIdentity`,
 * via the sessions module's public surface — is already the real thing;
 * only the *identity* half is a stand-in.
 */
async function authenticateJoin(
  socket: RealtimeSocket,
  sessionId: string,
): Promise<SocketUser | null> {
  if (IS_PRODUCTION) {
    return null;
  }

  const claimedId = socket.handshake.auth?.devUserId;

  // A claimed id is checked, never trusted-then-downgraded: an id that is not a
  // member of this session is refused outright. Silently substituting the
  // leader would attribute one member's actions to another, and would hide a
  // typo'd `rt_dev_user_id` behind a room that looks like it worked.
  if (typeof claimedId === 'string' && claimedId.length > 0) {
    const identity = await getSessionMemberIdentity(sessionId, claimedId);
    if (!identity) {
      console.warn(`[realtime] rejected join: ${claimedId} is not a member of ${sessionId}`);
      return null;
    }
    return identity;
  }

  // No id at all: fall back to the leader so a single-window demo just works.
  const session = await getSession(sessionId);
  if (!session) return null;
  const identity = await getSessionMemberIdentity(sessionId, session.leaderId);
  if (!identity) return null; // leader is always a member — see createSession (F04)

  console.warn(
    `[realtime] socket joined ${sessionId} as the leader; set localStorage.rt_dev_user_id to act as another member`,
  );
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
  if (!IS_PRODUCTION) {
    console.warn(
      '[realtime] devUserId identity is NOT JWT-verified (development only) — membership is still checked for real',
    );
  }

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
