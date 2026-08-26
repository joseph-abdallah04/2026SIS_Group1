import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@roundtable/shared/events';

export type RoundTableSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: RoundTableSocket | null = null;

/**
 * Singleton socket connection. Pass the JWT after login so it rides the
 * handshake (`auth.token`) — the server rejects unauthenticated sockets.
 * Socket.IO reconnects automatically with backoff.
 */
export function getSocket(token?: string): RoundTableSocket {
  if (!socket) {
    socket = io('/', { auth: token ? { token } : {}, autoConnect: true });
  } else if (token && !socket.auth) {
    socket.auth = { token };
  }
  return socket;
}

/** Drop the singleton (e.g. on logout). */
export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
