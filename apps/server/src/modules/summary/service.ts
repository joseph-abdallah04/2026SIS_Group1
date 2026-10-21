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
      // F41: a brainstorm question has no vote to report, so its recap is
      // the ideas themselves — every one on its board, not a shortlist.
      // Only once it was actually discussed: a skipped or unreached
      // brainstorm reads the same as a skipped or unreached vote.
      if (!question.votingEnabled) {
        const discussed = question.status === 'answered' || question.status === 'discussion';
        return {
          id: question.id,
          position: question.position,
          text: question.text,
          status: question.status,
          skipReason: question.skipReason,
          votingEnabled: false,
          proposals: discussed ? await listProposals(question.id) : [],
          otherProposals: [],
          winnerProposalId: null,
          tiedProposalIds: [],
          tallies: [],
          votedCount: 0,
        };
      }

      const outcome = outcomeByQuestion.get(question.id);
      const shortlistedIds = (outcome?.proposalIds ?? []).slice(0, SHORTLIST_MAX);
      // The session ended on it before anything was shortlisted, mid-discussion
      // or with the leader still picking the shortlist (voting, nothing ticked
      // yet), so the vote never opened: its ideas are the record, as a
      // brainstorm's are. Otherwise they would fall to `otherProposals`, and
      // the recap say no ideas were added right above the ideas themselves.
      if (
        (question.status === 'discussion' || question.status === 'voting') &&
        shortlistedIds.length === 0
      ) {
        return {
          id: question.id,
          position: question.position,
          text: question.text,
          status: question.status,
          skipReason: question.skipReason,
          votingEnabled: true,
          proposals: await listProposals(question.id),
          otherProposals: [],
          winnerProposalId: null,
          tiedProposalIds: [],
          tallies: [],
          votedCount: 0,
        };
      }
      // Every card the question gathered, shortlisted or not, so the recap can
      // show what did not make the ballot too. A question never reached has
      // nothing on its board to read.
      const board = question.status === 'pending' ? [] : await listProposals(question.id);
      const byId = new Map(board.map((item) => [item.id, item]));
      const proposals = shortlistedIds.flatMap((id) => {
        const item = byId.get(id);
        return item ? [item] : [];
      });
      const shortlisted = new Set(shortlistedIds);
      return {
        id: question.id,
        position: question.position,
        text: question.text,
        status: question.status,
        skipReason: question.skipReason,
        votingEnabled: true,
        proposals,
        otherProposals: board.filter((item) => !shortlisted.has(item.id)),
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
      // Both are null once their accounts are deleted, and two deleted
      // accounts are not the same person.
      isLeader: session.leaderId !== null && member.userId === session.leaderId,
    })),
    questions,
  };
}

/**
 * S04: same recap as JSON, laid out as a PDF the client can download. Times
 * are written in the viewer's zone when they send one, so the file says what
 * the page said; UTC otherwise.
 */
export async function getSessionSummaryPdf(
  sessionId: string,
  viewerId: string,
  options: { timeZone?: string } = {},
): Promise<{ pdf: Buffer; filename: string }> {
  const summary = await getSessionSummary(sessionId, viewerId);
  return {
    pdf: await renderSessionRecapPdf(summary, options),
    filename: recapPdfFilename(summary.title),
  };
}
