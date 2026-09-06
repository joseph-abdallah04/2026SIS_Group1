import { prisma } from '../../db.js';
import { ApiError } from '../../middleware/error.js';

export async function updateShortlist(sessionId: string, proposalIds: string[]) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true },
  });

  if (!session) {
    throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');
  }

  await prisma.sessionShortlist.deleteMany({
    where: { sessionId },
  });

  await prisma.sessionShortlist.createMany({
    data: proposalIds.map((proposalId) => ({
      sessionId,
      proposalId,
    })),
  });

  return { sessionId, proposalIds };
}