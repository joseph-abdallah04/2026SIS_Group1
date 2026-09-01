// Socket.IO wiring types (docs/02 §6 — `realtime/` is the composition layer
// that module handlers plug into, not a module itself).
//
// Kept in its own file so `modules/pinboard/socket.ts` and `realtime/gateway.ts`
// can both be typed without importing each other.
import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@roundtable/shared/events';

/** Who the server believes this socket is. Set by the gateway, never by the client. */
export interface SocketUser {
  id: string;
  displayName: string;
}

/**
 * Per-socket server state. Handlers read the session and author from here
 * rather than from event payloads, so a client cannot address a room it has
 * not joined or claim to be someone else (docs/02 §8.2).
 */
export interface RealtimeSocketData {
  user: SocketUser | null;
  sessionId: string | null;
}

type NoInterServerEvents = Record<string, never>;

export type RealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  NoInterServerEvents,
  RealtimeSocketData
>;

export type RealtimeSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  NoInterServerEvents,
  RealtimeSocketData
>;

/** The room every event for a session is scoped to (docs/02 §4). */
export function sessionRoom(sessionId: string): string {
  return `session:${sessionId}`;
}
