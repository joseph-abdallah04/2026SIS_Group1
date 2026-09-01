// ⚠️ STAND-IN — this file belongs to the Session Lifecycle track.
//
// docs/06 ("Session Lifecycle Owner → Also owns (deferred from setup)") assigns
// socket authentication, room management and `memberJoin` routing to that
// owner. None of it exists yet, and F15 cannot broadcast into a room nobody has
// joined — so this is the smallest gateway that unblocks the pinboard, kept in
// ONE file so the real one replaces it wholesale:
//
//   1. `authenticateJoin` becomes "verify handshake JWT + check membership".
//   2. Everything else (rooms, snapshot, presence) is already the shape docs/06
//      describes and should survive largely as-is.
//
// Nothing in `modules/pinboard/` depends on the stand-in behaviour: it only
// relies on `socket.data.user` / `socket.data.sessionId` being trustworthy.
import type { SessionStatePayload } from '@roundtable/shared/events';

import { prisma } from '../db.js';
import { env } from '../env.js';
import { getBoardForSession, registerPinboardSocketHandlers } from '../modules/pinboard/index.js';
import { sessionRoom, type RealtimeServer, type RealtimeSocket, type SocketUser } from './types.js';

const IS_PRODUCTION = env.NODE_ENV === 'production';

/**
 * Decide who this socket is, for this session.
 *
 * TODO(auth/sessions): replace the whole body with
 *   `verifyJwt(socket.handshake.auth.token)` → membership lookup → user.
 */
async function authenticateJoin(
  socket: RealtimeSocket,
  sessionId: string,
): Promise<SocketUser | null> {
  if (IS_PRODUCTION) {
    // A real identity can only come from a verified JWT, and JWT verification
    // is the auth owner's ticket. Refuse rather than trust a client-sent id.
    return null;
  }

  const claimedId = socket.handshake.auth?.devUserId;

  // A claimed id is checked, never trusted-then-downgraded: an id that is not a
  // member of this session is refused outright. Silently substituting the
  // leader would attribute one member's proposals to another, and would hide a
  // typo'd `rt_dev_user_id` behind a board that looks like it works.
  if (typeof claimedId === 'string' && claimedId.length > 0) {
    const membership = await prisma.sessionMember.findUnique({
      where: { sessionId_userId: { sessionId, userId: claimedId } },
      select: { user: { select: { id: true, displayName: true } } },
    });
    if (!membership) {
      console.warn(`[realtime] rejected join: ${claimedId} is not a member of ${sessionId}`);
      return null;
    }
    return membership.user;
  }

  // No id at all: fall back to the leader so a single-window demo just works.
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { leader: { select: { id: true, displayName: true } } },
  });
  if (!session) return null;

  console.warn(
    `[realtime] socket joined ${sessionId} as the leader; set localStorage.rt_dev_user_id to act as another member`,
  );
  return session.leader;
}

export function registerRealtimeGateway(io: RealtimeServer): void {
  if (!IS_PRODUCTION) {
    console.warn(
      '[realtime] stand-in gateway active: sockets are NOT JWT-authenticated (development only)',
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

          // Moving between sessions on one socket must not leave it subscribed
          // to the old room, or it keeps receiving a board it no longer shows.
          const previous = socket.data.sessionId;
          if (previous && previous !== sessionId) {
            await socket.leave(sessionRoom(previous));
            socket.to(sessionRoom(previous)).emit('memberLeft', { user });
          }

          socket.data.user = user;
          socket.data.sessionId = sessionId;
          await socket.join(sessionRoom(sessionId));

          // Snapshot on join (docs/02 §4). It carries the whole board, not just
          // the proposals: a reconnecting client resyncs from this alone, so
          // anything left out would render as a placeholder until some other
          // request happened to fill it in.
          const { items, ...meta } = await getBoardForSession(sessionId);
          const snapshot: SessionStatePayload = { ...meta, proposals: items };
          socket.emit('sessionState', snapshot);
          socket.to(sessionRoom(sessionId)).emit('memberJoined', { user });

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
      // Presence is per-socket here, so a second tab closing reads as a leave.
      // Real presence (distinct connected users) is the sessions owner's to get
      // right; docs/02 §4 keeps it in memory, never in `SessionMember`.
      if (user && sessionId) {
        socket.to(sessionRoom(sessionId)).emit('memberLeft', { user });
      }
    });
  });
}
