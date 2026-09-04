import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@roundtable/shared/events';

import { getCurrentUserId } from './currentUser';

export type RoundTableSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: RoundTableSocket | null = null;

function handshakeAuth(): Record<string, string> {
  const auth: Record<string, string> = {};

  const token = localStorage.getItem('rt_token');
  if (token) auth.token = token;

  // Matching the stand-in gateway on the server: with no login yet there is no
  // JWT to identify anyone, so the current identity (see lib/currentUser.ts,
  // empty in production) lets two browser windows act as two seeded members.
  const userId = getCurrentUserId();
  if (userId) auth.devUserId = userId;

  return auth;
}

/**
 * Singleton socket connection. Socket.IO reconnects automatically with backoff;
 * callers must re-emit `memberJoin` on every `connect`, because a reconnected
 * socket is a new socket that belongs to no rooms.
 *
 * The handshake is read once, when the socket is first created. Logging in — or
 * changing `rt_dev_user_id` — after that needs `disconnectSocket()` (or a page
 * refresh) before the new identity is used. Re-authenticating a live socket is
 * the auth owner's call, so this deliberately does not guess at it.
 */
export function getSocket(): RoundTableSocket {
  if (!socket) {
    socket = io('/', { auth: handshakeAuth(), autoConnect: true });
  }
  return socket;
}

/** Drop the singleton (e.g. on logout). */
export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
