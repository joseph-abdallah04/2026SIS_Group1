import { prisma } from '../../db.js';

export async function updateShortlist(sessionId: string, proposalIds: string[]) {
  // Clear existing shortlist
  await prisma.sessionShortlist.deleteMany({
    where: { sessionId },
  });

  // Insert new shortlist rows
  const rows = proposalIds.map((proposalId) => ({
    sessionId,
    proposalId,
  }));

  await prisma.sessionShortlist.createMany({ data: rows });

  return { sessionId, proposalIds };
}