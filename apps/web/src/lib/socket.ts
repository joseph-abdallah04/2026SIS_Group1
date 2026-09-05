import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@roundtable/shared/events';

import { getToken } from './auth';

export type RoundTableSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: RoundTableSocket | null = null;

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
  socket?.disconnect();
  socket = null;
}
