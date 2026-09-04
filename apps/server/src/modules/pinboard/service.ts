import type { BoardItem, BoardResponse } from '@roundtable/shared';
import { artifactJsonSchema, type ProposalCreateInput } from '@roundtable/shared/schemas';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../db.js';
import { ApiError } from '../../middleware/error.js';
import { getActiveQuestion, getQuestion, getSession } from './sessionsAdapter.js';

// The pinboard's read side (F14: the board every participant loads, in one
// agreed order) and its create side (F15: proposals land for everyone at once).
// Edit/delete/reactions are F16–F18.

type ProposalRow = Prisma.ProposalGetPayload<{
  include: { author: { select: { displayName: true } } };
}>;

export function toBoardItem(row: ProposalRow): BoardItem {
  const parsed = artifactJsonSchema.safeParse(row.artifactJson);
  if (!parsed.success) {
    throw new ApiError(500, 'Invalid artifact data stored for proposal', 'INVALID_ARTIFACT');
  }

  return {
    id: row.id,
    questionId: row.questionId,
    authorId: row.authorId,
    authorName: row.author.displayName,
    type: row.type,
    artifactJson: parsed.data,
    x: row.x,
    y: row.y,
    createdAt: row.createdAt.toISOString(),
    extendsProposalId: row.extendsProposalId,
  };
}

export async function listProposals(questionId: string): Promise<BoardItem[]> {
  const rows = await prisma.proposal.findMany({
    where: { questionId, deletedAt: null },
    include: { author: { select: { displayName: true } } },
    // The total order every client agrees on: creation time, then id to break
    // same-millisecond ties (F14 — "identical boards in identical order").
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  return rows.map(toBoardItem);
}

export interface CreateProposalArgs {
  questionId: string;
  /** Resolved from the authenticated socket by the caller — never client-supplied. */
  authorId: string;
  input: ProposalCreateInput;
}

/**
 * Persist a proposal and return it in board shape.
 *
 * Deliberately knows nothing about sockets: the caller broadcasts. That keeps
 * this the single write path for every producer — the tool editors (F19–F21)
 * and propose-from-chat (F37) all land here, so validation and ownership work
 * the same way regardless of who proposed (docs/02 §8.8).
 *
 * Every rule that decides whether a write is *allowed* lives here rather than
 * in the socket handler, so a server-side caller (the assistant proposing on a
 * user's behalf) cannot bypass them by not going through a socket.
 */
export async function createProposal({
  questionId,
  authorId,
  input,
}: CreateProposalArgs): Promise<BoardItem> {
  const question = await getQuestion(questionId);
  if (!question) {
    throw new ApiError(404, 'Question not found', 'QUESTION_NOT_FOUND');
  }
  // The session gate, checked before the question's own: an ended session
  // (F32) leaves its questions' statuses untouched, so a question left in
  // `discussion` would otherwise keep accepting proposals after the leader
  // wrapped up. `active` is also the only status where a board is on screen —
  // a `lobby` session is still in the waiting room.
  const session = await getSession(question.sessionId);
  if (!session || session.status !== 'active') {
    throw new ApiError(
      409,
      session?.status === 'ended'
        ? 'This session has ended — the board is read-only'
        : 'This session is not live',
      'SESSION_NOT_ACTIVE',
    );
  }
  // Proposals belong to the ideation phase. Once a question moves to voting or
  // is answered the board is the thing being voted on, so it must stop moving.
  if (question.status !== 'discussion') {
    throw new ApiError(
      409,
      `This question is ${question.status} — proposals are closed`,
      'QUESTION_CLOSED',
    );
  }

  if (input.extendsProposalId) {
    const parent = await prisma.proposal.findFirst({
      where: { id: input.extendsProposalId, questionId, deletedAt: null },
      select: { id: true },
    });
    if (!parent) {
      throw new ApiError(400, 'Cannot extend a proposal that is not on this board', 'INVALID_EXTENDS');
    }
  }

  const row = await prisma.proposal.create({
    data: {
      questionId,
      authorId,
      type: input.type,
      artifactJson: input.artifactJson as unknown as Prisma.InputJsonValue,
      x: input.x,
      y: input.y,
      extendsProposalId: input.extendsProposalId ?? null,
    },
    include: { author: { select: { displayName: true } } },
  });

  return toBoardItem(row);
}

export async function getBoardForSession(sessionId: string): Promise<BoardResponse> {
  const session = await getSession(sessionId);
  if (!session) {
    throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');
  }

  const question = await getActiveQuestion(sessionId);
  if (!question) {
    return {
      sessionId,
      sessionTitle: session.title,
      questionId: null,
      questionText: null,
      questionPosition: null,
      questionStatus: null,
      items: [],
    };
  }

  return {
    sessionId,
    sessionTitle: session.title,
    questionId: question.id,
    questionText: question.text,
    questionPosition: question.position,
    questionStatus: question.status,
    items: await listProposals(question.id),
  };
}
