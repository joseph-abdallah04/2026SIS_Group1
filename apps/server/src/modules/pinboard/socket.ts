import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@roundtable/shared/events';

import { createProposal } from './service.js';

type IoServer = Server<ClientToServerEvents, ServerToClientEvents>;

/** Pinboard socket handlers — F15 builds on these broadcasts. */
export function registerPinboardHandlers(io: IoServer): void {
  io.on('connection', (socket) => {
    socket.on('proposalCreate', async (payload, ack) => {
      try {
        // TODO(auth): resolve authorId from JWT on socket handshake once auth module lands.
        const authorId = (socket.handshake.auth as { userId?: string }).userId;
        if (!authorId) {
          ack?.({ ok: false, error: 'Authentication required' });
          return;
        }

        const proposal = await createProposal({
          sessionId: payload.sessionId,
          authorId,
          type: payload.type,
          artifactJson: payload.artifactJson,
          x: payload.x,
          y: payload.y,
          extendsProposalId: payload.extendsProposalId,
        });

        io.to(`session:${payload.sessionId}`).emit('proposalCreated', { proposal });
        ack?.({ ok: true, proposal });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create proposal';
        ack?.({ ok: false, error: message });
      }
    });
  });
}

/** Emit pinboard events to a session room (used by other pinboard operations later). */
export function emitProposalCreated(
  io: IoServer,
  sessionId: string,
  proposal: Parameters<ServerToClientEvents['proposalCreated']>[0]['proposal'],
): void {
  io.to(`session:${sessionId}`).emit('proposalCreated', { proposal });
}
