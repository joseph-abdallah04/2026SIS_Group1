// Who may change what on a board, kept pure and separate from the queries that
// fetch the rows. These are the rules a reviewer needs to read in one place,
// and the ones worth testing exhaustively — every mutation path runs through
// here, so a future caller cannot quietly acquire different rules.
import { ApiError } from '../../middleware/error.js';
import type { QuestionRef } from './sessionsAdapter.js';

/** The parts of a proposal that decide whether it may be changed. */
export interface MutableProposal {
  id: string;
  authorId: string;
  deletedAt: Date | null;
}

/** The parts of a question that decide whether its board is still open. */
export type QuestionScope = Pick<QuestionRef, 'sessionId' | 'status'>;

/** Who is asking, and which board they are currently on. */
export interface Actor {
  /** Resolved from the authenticated socket — never from an event payload. */
  id: string;
  sessionId: string;
}

/**
 * What is being attempted. The three differ in who may do them, so the rule
 * below cannot be stated without knowing which one this is.
 */
export type ProposalMutation = 'move' | 'edit' | 'delete';

export interface MutationIntent {
  mutation: ProposalMutation;
  /** Whether this actor leads the session the proposal belongs to. */
  isLeader: boolean;
}

/**
 * Return the proposal if this actor may perform this mutation on it, otherwise
 * throw.
 *
 * Authors control their own proposals: only the person who proposed something
 * may reword it or take it down.
 *
 * The leader may additionally *move* and *delete* anyone's card. The board is
 * shared, so arranging it and moderating what stays on it are both part of
 * running the session (F17). The leader may still not *edit* other people's
 * content: moving or removing a proposal is facilitation, but rewriting one
 * puts different words under its author's name.
 *
 * Check order is deliberate. A proposal on a session the actor has not joined
 * is reported as missing rather than forbidden: answering "403" would confirm
 * that an id exists to someone who should not be able to tell.
 */
export function requireMutableProposal<T extends MutableProposal>(
  proposal: T | null,
  question: QuestionScope | null,
  actor: Actor,
  intent: MutationIntent,
): T {
  // A soft-deleted proposal is gone as far as the board is concerned; treating
  // it as missing also makes a double delete idempotent from the client's side.
  if (!proposal || proposal.deletedAt !== null || !question) {
    throw new ApiError(404, 'Proposal not found', 'PROPOSAL_NOT_FOUND');
  }

  if (question.sessionId !== actor.sessionId) {
    throw new ApiError(404, 'Proposal not found', 'PROPOSAL_NOT_FOUND');
  }

  const isAuthor = proposal.authorId === actor.id;
  const leaderMay = intent.isLeader && (intent.mutation === 'move' || intent.mutation === 'delete');

  if (!isAuthor && !leaderMay) {
    throw new ApiError(
      403,
      intent.isLeader
        ? 'As leader you can move or remove this proposal, but only its author can edit it'
        : 'Only the author can change this proposal',
      'NOT_PROPOSAL_AUTHOR',
    );
  }

  // Same lock as creating: once a question leaves discussion the board is the
  // thing being voted on, so it must stop moving — including edits, moves and
  // deletions, which would change or remove a proposal mid-ballot.
  if (question.status !== 'discussion') {
    throw new ApiError(
      409,
      `This question is ${question.status} — the board is closed`,
      'QUESTION_CLOSED',
    );
  }

  return proposal;
}
