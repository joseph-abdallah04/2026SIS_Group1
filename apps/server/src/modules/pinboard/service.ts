import type { BoardItem, BoardResponse } from '@roundtable/shared';
import {
  artifactJsonSchema,
  type ProposalCreateInput,
  type ProposalUpdateInput,
} from '@roundtable/shared/schemas';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../db.js';
import { ApiError } from '../../middleware/error.js';
import { requireMutableProposal, type Actor, type ProposalMutation } from './permissions.js';
import { getActiveQuestion, getQuestion, getSession } from './sessionsAdapter.js';

// The pinboard's read side (F14: the board every participant loads, in one
// agreed order), its create side (F15: proposals land for everyone at once) and
// its author-edit side (F16: edit, move, delete your own). Reactions are F18.
//
// Every mutation here is deliberately socket-agnostic: the caller broadcasts.
// That keeps one write path per operation no matter who is calling — a tool
// editor over a socket, the assistant proposing server-side (F37), or the
// leader moderating (F17) — so the rules cannot be bypassed by arriving from a
// different direction.

type ProposalRow = Prisma.ProposalGetPayload<{
  include: { author: { select: { displayName: true } } };
}>;

export function toBoardItem(row: ProposalRow): BoardItem {
  const parsed = artifactJsonSchema.safeParse(row.artifactJson);
  if (!parsed.success || parsed.data.type !== row.type) {
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
      throw new ApiError(
        400,
        'Cannot extend a proposal that is not on this board',
        'INVALID_EXTENDS',
      );
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

/**
 * Load a proposal together with the board it sits on, and confirm this actor
 * may change it. Shared by edit and delete so the two can never drift apart on
 * who is allowed to do what.
 */
async function loadForMutation(proposalId: string, actor: Actor, mutation: ProposalMutation) {
  const row = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: { author: { select: { displayName: true } } },
  });

  // The question and the session both come from the sessions adapter, not a
  // Prisma `include`: the pinboard owns proposals, not questions or sessions,
  // and reading one through a relation is still reaching into another module's
  // table (docs/02 §2).
  const question = row ? await getQuestion(row.questionId) : null;
  const session = question ? await getSession(question.sessionId) : null;
  const isLeader = session?.leaderId === actor.id;

  return { row: requireMutableProposal(row, question, actor, { mutation, isLeader }), question };
}

/**
 * Edit a proposal's content, its position, or both (F16).
 *
 * A drag sends coordinates only and a text edit sends the artifact only, so
 * anything absent from the input is left exactly as it was rather than being
 * overwritten with a default.
 */
export async function updateProposal({
  proposalId,
  actor,
  input,
}: {
  proposalId: string;
  actor: Actor;
  input: ProposalUpdateInput;
}): Promise<BoardItem> {
  // Content and position carry different permissions — the leader may arrange
  // the shared board without being able to rewrite what anyone said — so which
  // one this is has to be decided before the check, not after. A payload
  // carrying both counts as an edit: the stricter rule wins, or a leader could
  // rewrite anything by attaching coordinates to it.
  const { row } = await loadForMutation(
    proposalId,
    actor,
    input.artifactJson === undefined ? 'move' : 'edit',
  );

  // An edit changes what a proposal says, never what kind of thing it is: the
  // `type` column and the artifact must keep agreeing, and turning a sticky
  // into a diagram is a new idea rather than an edit of this one.
  if (input.artifactJson && input.artifactJson.type !== row.type) {
    throw new ApiError(
      400,
      `A ${row.type} proposal cannot become a ${input.artifactJson.type}`,
      'ARTIFACT_TYPE_MISMATCH',
    );
  }

  const updated = await prisma.proposal.update({
    where: { id: proposalId },
    data: {
      ...(input.artifactJson
        ? { artifactJson: input.artifactJson as unknown as Prisma.InputJsonValue }
        : {}),
      ...(input.x === undefined ? {} : { x: input.x }),
      ...(input.y === undefined ? {} : { y: input.y }),
    },
    include: { author: { select: { displayName: true } } },
  });

  return toBoardItem(updated);
}

/**
 * Remove a proposal from the board (F16).
 *
 * Soft delete, per docs/02 §3: reactions, votes and extend-children all point
 * at this row, so the record stays and only its place on the board goes. The
 * returned questionId lets the caller address the broadcast at the right board.
 */
export async function deleteProposal({
  proposalId,
  actor,
}: {
  proposalId: string;
  actor: Actor;
}): Promise<{ proposalId: string; questionId: string }> {
  const { row } = await loadForMutation(proposalId, actor, 'delete');

  await prisma.proposal.update({
    where: { id: proposalId },
    data: { deletedAt: new Date() },
  });

  return { proposalId: row.id, questionId: row.questionId };
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
      leaderId: session.leaderId,
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
    leaderId: session.leaderId,
    questionId: question.id,
    questionText: question.text,
    questionPosition: question.position,
    questionStatus: question.status,
    items: await listProposals(question.id),
  };
}
