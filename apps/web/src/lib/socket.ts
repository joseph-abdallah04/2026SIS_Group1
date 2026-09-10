import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@roundtable/shared/events';

import { getToken } from './auth';

export type RoundTableSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: RoundTableSocket | null = null;

/**
 * Pending `memberLeave` timers, keyed by session id.
 *
 * The waiting room unmounts when the session starts and the pinboard mounts
 * for the *same* room. React Strict Mode also remounts. A leave that fired
 * on every unmount would drop presence for a user who never left; joining
 * the same session cancels the deferred leave first.
 */
const pendingLeaves = new Map<string, ReturnType<typeof setTimeout>>();

function handshakeAuth(): Record<string, string> {
  const auth: Record<string, string> = {};

  // The same token `lib/api.ts` sends as `Authorization: Bearer`. A handshake
  // has no headers, so it travels here instead; the gateway verifies it and
  // then checks membership (apps/server/src/realtime/gateway.ts).
  const token = getToken();
  if (token) auth.token = token;

  return auth;
}

/**
 * Singleton socket connection. Socket.IO reconnects automatically with backoff;
 * callers must re-emit `memberJoin` on every `connect`, because a reconnected
 * socket is a new socket that belongs to no rooms.
 *
 * The handshake is read once, when the socket is first created, so logging in
 * or out after that needs `disconnectSocket()` (or a page refresh) before the
 * new identity is used. Re-authenticating a live socket is the auth owner's
 * call, so this deliberately does not guess at it.
 */
export function getSocket(): RoundTableSocket {
  if (!socket) {
    socket = io('/', { auth: handshakeAuth(), autoConnect: true });
  }
  return socket;
}

/** Drop the singleton (e.g. on logout). */
export function disconnectSocket(): void {
  for (const timer of pendingLeaves.values()) clearTimeout(timer);
  pendingLeaves.clear();
  socket?.disconnect();
  socket = null;
}

/**
 * Join (or rejoin) a session room. Cancels a pending leave for this session
 * so lobby → pinboard, and Strict Mode remounts, stay in the room.
 */
export function joinSessionRoom(
  sessionId: string,
  ack?: (res: { ok: boolean; error?: string }) => void,
): void {
  const pending = pendingLeaves.get(sessionId);
  if (pending !== undefined) {
    clearTimeout(pending);
    pendingLeaves.delete(sessionId);
  }
  getSocket().emit('memberJoin', { sessionId }, ack);
}

/**
 * Leave a session room on the next macrotask. Call from hook cleanup.
 * Cancelled if `joinSessionRoom` runs for the same id before it fires.
 */
export function scheduleLeaveSessionRoom(sessionId: string): void {
  const existing = pendingLeaves.get(sessionId);
  if (existing !== undefined) clearTimeout(existing);
  pendingLeaves.set(
    sessionId,
    setTimeout(() => {
      pendingLeaves.delete(sessionId);
      getSocket().emit('memberLeave', { sessionId });
    }, 0),
  );
}
