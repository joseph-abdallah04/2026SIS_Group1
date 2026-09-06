import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@roundtable/shared/events';

import { getToken } from './auth';

export type RoundTableSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: RoundTableSocket | null = null;

const pendingLeaves = new Map<string, ReturnType<typeof setTimeout>>();

function handshakeAuth(): Record<string, string> {
  const auth: Record<string, string> = {};
  const token = getToken();
  if (token) auth.token = token;
  return auth;
}

export function getSocket(): RoundTableSocket {
  if (!socket) {
    socket = io('/', { auth: handshakeAuth(), autoConnect: true });

    window.socket = socket;
  }
  return socket;
}

export function disconnectSocket(): void {
  for (const timer of pendingLeaves.values()) clearTimeout(timer);
  pendingLeaves.clear();
  socket?.disconnect();
  socket = null;
}

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
