import type { BoardItem, BoardResponse } from '@roundtable/shared';
import { artifactJsonSchema } from '@roundtable/shared/schemas';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../db.js';
import { ApiError } from '../../middleware/error.js';
import { getActiveQuestion, getSession } from './sessionsAdapter.js';

// F14 is the read side of the pinboard: the board every participant loads, in
// one agreed order. Writes (proposal:create/update/delete, reactions) are F15+
// and land once the sessions socket gateway can authenticate a socket.

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
