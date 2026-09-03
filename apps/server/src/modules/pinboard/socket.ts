// F15 — realtime pinboard sync.
//
// The write path is server-authoritative (docs/02 §4): a client sends the
// *intent* `proposalCreate`, this module validates and persists it, then
// broadcasts the resulting *fact* `proposalCreated` to `session:{id}`. Nobody
// renders a proposal the server has not accepted, so boards cannot diverge.
import type { BoardItem } from '@roundtable/shared';
import { proposalCreateSchema } from '@roundtable/shared/schemas';

import { sessionRoom, type RealtimeServer, type RealtimeSocket } from '../../realtime/types.js';
import { ApiError } from '../../middleware/error.js';
import { createProposal } from './service.js';
import { getActiveQuestion } from './sessionsAdapter.js';

/**
 * Announce a proposal to everyone on that session's board.
 *
 * Exported because a proposal can originate off-socket — the AI assistant's
 * one-click propose (F37) creates one server-side and needs the same fan-out.
 * The author's own socket is included on purpose: everybody, proposer included,
 * renders from the same broadcast row rather than from a local optimistic copy.
 */
export function emitProposalCreated(
  io: RealtimeServer,
  sessionId: string,
  proposal: BoardItem,
): void {
  io.to(sessionRoom(sessionId)).emit('proposalCreated', { proposal });
}

export function registerPinboardSocketHandlers(io: RealtimeServer, socket: RealtimeSocket): void {
  socket.on('proposalCreate', (payload, ack) => {
    void (async () => {
      try {
        // Both come from the gateway's authenticated view of this socket, so a
        // client can neither post to a board it has not joined nor set authorId.
        const { user, sessionId } = socket.data;
        if (!user || !sessionId) {
          ack?.({ ok: false, error: 'Join the session before proposing', code: 'NOT_IN_SESSION' });
          return;
        }

        const parsed = proposalCreateSchema.safeParse(payload);
        if (!parsed.success) {
          ack?.({
            ok: false,
            error: parsed.error.issues[0]?.message ?? 'Invalid proposal',
            code: 'INVALID_PROPOSAL',
          });
          return;
        }

        // Which board this lands on is a socket-level question; whether the
        // write is allowed at all is `createProposal`'s, so that a server-side
        // caller cannot skip the phase check by not using a socket.
        const question = await getActiveQuestion(sessionId);
        if (!question) {
          ack?.({ ok: false, error: 'No question is open yet', code: 'NO_ACTIVE_QUESTION' });
          return;
        }

        const proposal = await createProposal({
          questionId: question.id,
          authorId: user.id,
          input: parsed.data,
        });

        emitProposalCreated(io, sessionId, proposal);
        ack?.({ ok: true });
      } catch (err) {
        if (err instanceof ApiError) {
          ack?.({ ok: false, error: err.message, code: err.code });
          return;
        }
        console.error('[pinboard] proposalCreate failed:', err);
        ack?.({ ok: false, error: 'Could not save the proposal', code: 'PROPOSAL_CREATE_FAILED' });
      }
    })();
  });
}
