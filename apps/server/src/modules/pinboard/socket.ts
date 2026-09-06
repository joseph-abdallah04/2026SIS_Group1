// Realtime pinboard sync — F15 (create) and F16 (author edit/move/delete).
//
// The write path is server-authoritative (docs/02 §4): a client sends the
// *intent* (`proposalCreate`, `proposalUpdate`, `proposalDelete`), this module
// validates and persists it, then broadcasts the resulting *fact* to
// `session:{id}`. Nobody renders a change the server has not accepted, so
// boards cannot diverge.
import type { BoardItem } from '@roundtable/shared';
import type { ClientToServerEvents, WriteAck } from '@roundtable/shared/events';
import {
  proposalCreateSchema,
  proposalDeleteSchema,
  proposalUpdateSchema,
} from '@roundtable/shared/schemas';
import type { ZodType } from 'zod';

import { sessionRoom, type RealtimeServer, type RealtimeSocket } from '../../realtime/types.js';
import { ApiError } from '../../middleware/error.js';
import type { Actor } from './permissions.js';
import { createProposal, deleteProposal, updateProposal } from './service.js';
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

/** Announce an edit or a move (F16). Carries the whole row, like `created`. */
export function emitProposalUpdated(
  io: RealtimeServer,
  sessionId: string,
  proposal: BoardItem,
): void {
  io.to(sessionRoom(sessionId)).emit('proposalUpdated', { proposal });
}

/** Announce a removal (F16 author, F17 leader). */
export function emitProposalDeleted(
  io: RealtimeServer,
  sessionId: string,
  removed: { proposalId: string; questionId: string },
): void {
  io.to(sessionRoom(sessionId)).emit('proposalDeleted', removed);
}

/**
 * The session and author for a write, taken from the server's view of the
 * socket. A client can therefore neither address a board it has not joined nor
 * claim to be someone else, whatever the payload says (docs/02 §8.2).
 */
function actorFor(socket: RealtimeSocket): Actor | null {
  const { user, sessionId } = socket.data;
  return user && sessionId ? { id: user.id, sessionId } : null;
}

/** Turn whatever a write threw into an ack the client can act on. */
function ackFailure(
  ack: ((res: WriteAck) => void) | undefined,
  err: unknown,
  intent: string,
): void {
  if (err instanceof ApiError) {
    // Refusals are expected (wrong author, closed board), but silent on the
    // server they make "my change did not stick" impossible to diagnose.
    console.warn(`[pinboard] ${intent} refused: ${err.code ?? err.status} — ${err.message}`);
    ack?.({ ok: false, error: err.message, code: err.code });
    return;
  }
  // An unexpected failure is a bug here, not something the client did wrong:
  // log the detail server-side and hand back something safe to display.
  console.error(`[pinboard] ${intent} failed:`, err);
  ack?.({ ok: false, error: 'Could not save that change', code: 'PINBOARD_WRITE_FAILED' });
}

/**
 * Shared shape of every write intent: must have joined, must parse, and any
 * failure comes back on the ack rather than as an unhandled rejection. Handlers
 * below supply only what is actually different between the three.
 */
function onWriteIntent<TPayload>(
  socket: RealtimeSocket,
  intent: keyof Pick<ClientToServerEvents, 'proposalCreate' | 'proposalUpdate' | 'proposalDelete'>,
  schema: ZodType<TPayload>,
  run: (input: TPayload, actor: Actor) => Promise<void>,
): void {
  socket.on(intent, (payload: unknown, ack?: (res: WriteAck) => void) => {
    void (async () => {
      const actor = actorFor(socket);
      if (!actor) {
        ack?.({ ok: false, error: 'Join the session first', code: 'NOT_IN_SESSION' });
        return;
      }

      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        ack?.({
          ok: false,
          error: parsed.error.issues[0]?.message ?? 'Invalid request',
          code: 'INVALID_PROPOSAL',
        });
        return;
      }

      try {
        await run(parsed.data, actor);
        ack?.({ ok: true });
      } catch (err) {
        ackFailure(ack, err, intent);
      }
    })();
  });
}

export function registerPinboardSocketHandlers(io: RealtimeServer, socket: RealtimeSocket): void {
  onWriteIntent(socket, 'proposalCreate', proposalCreateSchema, async (input, actor) => {
    // Which board this lands on is a socket-level question; whether the write is
    // allowed at all is the service's, so that a server-side caller cannot skip
    // the phase check by not using a socket.
    const question = await getActiveQuestion(actor.sessionId);
    if (!question) {
      throw new ApiError(409, 'No question is open yet', 'NO_ACTIVE_QUESTION');
    }

    const proposal = await createProposal({
      questionId: question.id,
      authorId: actor.id,
      input,
    });
    emitProposalCreated(io, actor.sessionId, proposal);
  });

  onWriteIntent(socket, 'proposalUpdate', proposalUpdateSchema, async (input, actor) => {
    const proposal = await updateProposal({ proposalId: input.id, actor, input });
    emitProposalUpdated(io, actor.sessionId, proposal);
  });

  onWriteIntent(socket, 'proposalDelete', proposalDeleteSchema, async (input, actor) => {
    const removed = await deleteProposal({ proposalId: input.id, actor });
    emitProposalDeleted(io, actor.sessionId, removed);
  });
}
