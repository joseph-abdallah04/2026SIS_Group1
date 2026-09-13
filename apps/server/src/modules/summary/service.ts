import { SHORTLIST_MAX, type SessionRecap, type SessionRecapQuestion } from '@roundtable/shared';

import { ApiError } from '../../middleware/error.js';
import { listProposals } from './pinboardAdapter.js';
import { recapPdfFilename, renderSessionRecapPdf } from './pdf.js';
import {
  assertSessionMember,
  getSessionWithQuestions,
  listSessionParticipants,
} from './sessionsAdapter.js';
import { getSessionVoteOutcomes } from './votingAdapter.js';

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * F31: assemble the recap from session, pinboard, and voting reads.
 * Nothing is stored — ending the session is enough for this to exist.
 */
export async function getSessionSummary(
  sessionId: string,
  viewerId: string,
): Promise<SessionRecap> {
  await assertSessionMember(sessionId, viewerId);

  const session = await getSessionWithQuestions(sessionId);
  if (!session) {
    throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');
  }
  if (session.status !== 'ended') {
    throw new ApiError(
      409,
      'The summary is available once the session has ended',
      'SESSION_NOT_ENDED',
    );
  }

  const [members, outcomes] = await Promise.all([
    listSessionParticipants(sessionId),
    getSessionVoteOutcomes(sessionId),
  ]);
  const outcomeByQuestion = new Map(outcomes.map((row) => [row.questionId, row]));

  const questions: SessionRecapQuestion[] = await Promise.all(
    session.questions.map(async (question) => {
      const outcome = outcomeByQuestion.get(question.id);
      const shortlistedIds = (outcome?.proposalIds ?? []).slice(0, SHORTLIST_MAX);
      const board = shortlistedIds.length > 0 ? await listProposals(question.id) : [];
      const byId = new Map(board.map((item) => [item.id, item]));
      const proposals = shortlistedIds.flatMap((id) => {
        const item = byId.get(id);
        return item ? [item] : [];
      });
      return {
        id: question.id,
        position: question.position,
        text: question.text,
        status: question.status,
        proposals,
        winnerProposalId: outcome?.winnerProposalId ?? null,
        tiedProposalIds: outcome?.tiedProposalIds ?? [],
        tallies: outcome?.tallies ?? [],
        votedCount: outcome?.votedCount ?? 0,
      };
    }),
  );

  return {
    sessionId: session.id,
    title: session.title,
    createdAt: iso(session.createdAt) ?? new Date(0).toISOString(),
    startedAt: iso(session.startedAt),
    endedAt: iso(session.endedAt),
    leaderId: session.leaderId,
    participants: members.map((member) => ({
      userId: member.userId,
      displayName: member.displayName,
      isLeader: member.userId === session.leaderId,
    })),
    questions,
  };
}

/** S04: same recap as JSON, laid out as a PDF the client can download. */
export async function getSessionSummaryPdf(
  sessionId: string,
  viewerId: string,
): Promise<{ pdf: Buffer; filename: string }> {
  const summary = await getSessionSummary(sessionId, viewerId);
  return {
    pdf: await renderSessionRecapPdf(summary),
    filename: recapPdfFilename(summary.title),
  };
}
