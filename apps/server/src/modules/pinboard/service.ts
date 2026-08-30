import type {
  ArtifactJson,
  BoardItem,
  BoardResponse,
  ProposalType,
} from '@roundtable/shared';
import { artifactJsonSchema, proposalCreateSchema } from '@roundtable/shared/schemas';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../db.js';
import { ApiError } from '../../middleware/error.js';

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
    type: row.type as ProposalType,
    artifactJson: parsed.data,
    x: row.x,
    y: row.y,
    createdAt: row.createdAt.toISOString(),
    extendsProposalId: row.extendsProposalId,
  };
}

/** Active question for the board: discussion first, else first by position. */
export async function getActiveQuestionForSession(sessionId: string) {
  const questions = await prisma.question.findMany({
    where: { sessionId },
    orderBy: { position: 'asc' },
  });

  if (questions.length === 0) return null;

  return questions.find((q) => q.status === 'discussion') ?? questions[0] ?? null;
}

export async function listProposalsForQuestion(questionId: string): Promise<BoardItem[]> {
  const rows = await prisma.proposal.findMany({
    where: { questionId, deletedAt: null },
    include: { author: { select: { displayName: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  return rows.map(toBoardItem);
}

export async function getBoardForSession(sessionId: string): Promise<BoardResponse> {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) {
    throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');
  }

  const question = await getActiveQuestionForSession(sessionId);
  if (!question) {
    return {
      sessionId,
      questionId: null,
      questionText: null,
      items: [],
    };
  }

  const items = await listProposalsForQuestion(question.id);

  return {
    sessionId,
    questionId: question.id,
    questionText: question.text,
    items,
  };
}

export async function createProposal(input: {
  sessionId: string;
  authorId: string;
  type: ProposalType;
  artifactJson: ArtifactJson;
  x: number;
  y: number;
  extendsProposalId?: string;
}): Promise<BoardItem> {
  const parsed = proposalCreateSchema.safeParse({
    type: input.type,
    artifactJson: input.artifactJson,
    x: input.x,
    y: input.y,
    extendsProposalId: input.extendsProposalId,
  });
  if (!parsed.success) {
    throw new ApiError(400, 'Invalid proposal payload', 'INVALID_PROPOSAL');
  }

  const question = await getActiveQuestionForSession(input.sessionId);
  if (!question) {
    throw new ApiError(400, 'No active question for this session', 'NO_ACTIVE_QUESTION');
  }

  if (question.status !== 'discussion') {
    throw new ApiError(403, 'Proposals are only allowed during discussion', 'PHASE_LOCKED');
  }

  const row = await prisma.proposal.create({
    data: {
      questionId: question.id,
      authorId: input.authorId,
      type: input.type,
      artifactJson: input.artifactJson as unknown as Prisma.InputJsonValue,
      x: input.x,
      y: input.y,
      extendsProposalId: input.extendsProposalId,
    },
    include: { author: { select: { displayName: true } } },
  });

  return toBoardItem(row);
}
