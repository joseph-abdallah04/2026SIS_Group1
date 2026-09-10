import { toPublicVotingState, type VotingPublicState } from '@roundtable/shared';
import type { ClientToServerEvents, WriteAck } from '@roundtable/shared/events';
import {
  emptyVotingIntentSchema,
  shortlistToggleSchema,
  voteCastSchema,
} from '@roundtable/shared/schemas';
import type { ZodType } from 'zod';

import { ApiError } from '../../middleware/error.js';
import { sessionRoom, type RealtimeServer, type RealtimeSocket } from '../../realtime/types.js';
import { emitQuestionPhase } from './sessionsAdapter.js';
import {
  castVote,
  clearShortlist,
  closeVotingRound,
  getVotingStateForSession,
  startVotingRound,
  toggleShortlist,
  type ShortlistState,
} from './service.js';

type Actor = { id: string; sessionId: string };

type VotingIntent = keyof Pick<
  ClientToServerEvents,
  'shortlistToggle' | 'shortlistClear' | 'votingStart' | 'voteCast' | 'votingClose'
>;

function actorFor(socket: RealtimeSocket): Actor | null {
  const { user, sessionId } = socket.data;
  return user && sessionId ? { id: user.id, sessionId } : null;
}

function emitShortlistUpdated(io: RealtimeServer, sessionId: string, state: ShortlistState): void {
  if (!state.questionId) return;
  io.to(sessionRoom(sessionId)).emit('shortlistUpdated', {
    questionId: state.questionId,
    proposalIds: state.proposalIds,
    locked: state.locked,
  });
}

function emitVotingUpdated(io: RealtimeServer, sessionId: string, state: VotingPublicState): void {
  io.to(sessionRoom(sessionId)).emit('votingUpdated', state);
}

async function broadcastVoting(io: RealtimeServer, sessionId: string, shortlist?: ShortlistState) {
  if (shortlist) emitShortlistUpdated(io, sessionId, shortlist);
  const voting = await getVotingStateForSession(sessionId);
  emitVotingUpdated(io, sessionId, toPublicVotingState(voting));
}

function ackFailure(
  ack: ((res: WriteAck) => void) | undefined,
  err: unknown,
  intent: string,
): void {
  if (err instanceof ApiError) {
    console.warn(`[voting] ${intent} refused: ${err.code ?? err.status} — ${err.message}`);
    ack?.({ ok: false, error: err.message, code: err.code });
    return;
  }
  console.error(`[voting] ${intent} failed:`, err);
  ack?.({ ok: false, error: 'Could not save that change', code: 'VOTING_WRITE_FAILED' });
}

function onWriteIntent<TPayload>(
  socket: RealtimeSocket,
  intent: VotingIntent,
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

      const parsed = schema.safeParse(payload ?? {});
      if (!parsed.success) {
        ack?.({
          ok: false,
          error: parsed.error.issues[0]?.message ?? 'Invalid request',
          code: 'INVALID_VOTING',
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

export function registerVotingSocketHandlers(io: RealtimeServer, socket: RealtimeSocket): void {
  onWriteIntent(socket, 'shortlistToggle', shortlistToggleSchema, async (input, actor) => {
    const state = await toggleShortlist({
      sessionId: actor.sessionId,
      actorId: actor.id,
      proposalId: input.proposalId,
    });
    await broadcastVoting(io, actor.sessionId, state);
  });

  onWriteIntent(socket, 'shortlistClear', emptyVotingIntentSchema, async (_input, actor) => {
    const state = await clearShortlist({ sessionId: actor.sessionId, actorId: actor.id });
    await broadcastVoting(io, actor.sessionId, state);
  });

  onWriteIntent(socket, 'votingStart', emptyVotingIntentSchema, async (_input, actor) => {
    const state = await startVotingRound({ sessionId: actor.sessionId, actorId: actor.id });
    await broadcastVoting(io, actor.sessionId, state);
  });

  onWriteIntent(socket, 'voteCast', voteCastSchema, async (input, actor) => {
    const state = await castVote({
      sessionId: actor.sessionId,
      actorId: actor.id,
      proposalId: input.proposalId,
    });
    emitVotingUpdated(io, actor.sessionId, state);
  });

  onWriteIntent(socket, 'votingClose', emptyVotingIntentSchema, async (_input, actor) => {
    const result = await closeVotingRound({ sessionId: actor.sessionId, actorId: actor.id });
    emitVotingUpdated(io, actor.sessionId, result.voting);
    emitQuestionPhase(io, actor.sessionId, result.answered);
    if (result.opened) {
      emitQuestionPhase(io, actor.sessionId, result.opened);
    }
  });
}
