import {
  SHORTLIST_MAX,
  SHORTLIST_MIN,
  emptyVotingState,
  orderByVoteOutcome,
  toPublicVotingState,
  voteOutcomeFromTallies,
  type VoteOutcome,
  type VotingPhase,
  type VotingPublicState,
  type VotingShortlist,
  type VotingTally,
  type VotingViewerState,
  type VotingVoterStatus,
} from '@roundtable/shared';

import { prisma } from '../../db.js';
import { ApiError } from '../../middleware/error.js';
import { listProposals } from '../pinboard/index.js';
import {
  getActiveQuestion,
  getQuestion,
  getSession,
  getSessionWithQuestions,
  listSessionMembers,
  setQuestionPhase,
  type QuestionRef,
} from './sessionsAdapter.js';

export type ShortlistState = VotingShortlist;

type RoundWithBallots = {
  id: string;
  status: 'shortlisting' | 'open' | 'closed';
  items: { proposalId: string }[];
  votes: { voterId: string; proposalId: string }[];
};

async function requireLiveLeader(sessionId: string, userId: string) {
  const session = await getSession(sessionId);
  if (!session) {
    throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');
  }
  if (session.status !== 'active') {
    throw new ApiError(
      409,
      session.status === 'ended'
        ? 'This session has ended — the board is read-only'
        : 'This session is not live',
      'SESSION_NOT_ACTIVE',
    );
  }
  if (session.leaderId !== userId) {
    throw new ApiError(403, 'Only the session leader can do that', 'NOT_SESSION_LEADER');
  }
  return session;
}

async function requireLiveMember(sessionId: string, userId: string) {
  const session = await getSession(sessionId);
  if (!session) {
    throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');
  }
  if (session.status !== 'active') {
    throw new ApiError(
      409,
      session.status === 'ended'
        ? 'This session has ended — the board is read-only'
        : 'This session is not live',
      'SESSION_NOT_ACTIVE',
    );
  }
  const members = await listSessionMembers(sessionId);
  if (!members.some((member) => member.userId === userId)) {
    throw new ApiError(403, 'You are not a member of this session', 'NOT_SESSION_MEMBER');
  }
  return session;
}

async function requireVotingQuestion(sessionId: string) {
  const question = await getActiveQuestion(sessionId);
  if (!question || question.status !== 'voting') {
    throw new ApiError(
      409,
      'Open voting on a question before choosing a shortlist',
      'QUESTION_NOT_VOTING',
    );
  }
  return question;
}

function toShortlist(
  questionId: string | null,
  proposalIds: string[],
  locked: boolean,
): ShortlistState {
  return { questionId, proposalIds, locked };
}

function computeTallies(
  proposalIds: string[],
  votes: { proposalId: string }[],
): { tallies: VotingTally[]; votedCount: number } {
  const counts = new Map(proposalIds.map((id) => [id, 0]));
  for (const vote of votes) {
    if (!counts.has(vote.proposalId)) continue;
    counts.set(vote.proposalId, (counts.get(vote.proposalId) ?? 0) + 1);
  }
  const votedCount = votes.length;
  const tallies = proposalIds.map((proposalId) => {
    const n = counts.get(proposalId) ?? 0;
    return {
      proposalId,
      votes: n,
      percent: votedCount === 0 ? 0 : Math.round((n / votedCount) * 100),
    };
  });
  return { tallies, votedCount };
}

const NO_OUTCOME: VoteOutcome = { winnerProposalId: null, tiedProposalIds: [] };

function orderProposalIds(proposalIds: string[], outcome: VoteOutcome): string[] {
  return orderByVoteOutcome(
    proposalIds.map((id) => ({ id })),
    outcome,
  ).map((item) => item.id);
}

/** Winner / tie from the ballots. Only declared once the round is closed. */
function closedOutcome(
  proposalIds: string[],
  votes: { proposalId: string }[],
  revealed: boolean,
): VoteOutcome {
  if (!revealed) return NO_OUTCOME;
  return voteOutcomeFromTallies(computeTallies(proposalIds, votes).tallies);
}

function phaseFor(
  questionStatus: QuestionRef['status'] | undefined,
  roundStatus: RoundWithBallots['status'] | undefined,
): VotingPhase {
  if (questionStatus === 'voting') {
    if (roundStatus === 'open') return 'open';
    // Round closed, question not yet advanced: the same overlay shows the result.
    if (roundStatus === 'closed') return 'closed';
    return 'shortlisting';
  }
  return 'idle';
}

async function loadRound(questionId: string): Promise<RoundWithBallots | null> {
  return prisma.votingRound.findUnique({
    where: { questionId },
    include: {
      items: { orderBy: { proposalId: 'asc' } },
      votes: true,
    },
  });
}

/**
 * Personalised voting state for one question. Broadcasts must run the result
 * through `toPublicVotingState` so `myVote` never leaves the room as a fact
 * about someone else.
 */
export async function getVotingState(
  questionId: string | null,
  viewerId?: string,
): Promise<VotingViewerState> {
  if (!questionId) return emptyVotingState(null);

  const question = await getQuestion(questionId);
  const round = await loadRound(questionId);
  const members = question ? await listSessionMembers(question.sessionId) : [];
  const proposalIds = round?.items.map((item) => item.proposalId) ?? [];
  const { tallies, votedCount } = computeTallies(proposalIds, round?.votes ?? []);
  const myVote =
    viewerId && round
      ? (round.votes.find((vote) => vote.voterId === viewerId)?.proposalId ?? null)
      : null;

  const phase = phaseFor(question?.status, round?.status);
  const outcome = closedOutcome(proposalIds, round?.votes ?? [], phase === 'closed');
  const session = question ? await getSession(question.sessionId) : null;
  const voterStatuses: VotingVoterStatus[] | null =
    viewerId && session && viewerId === session.leaderId && phase === 'open'
      ? members.map((member) => ({
          userId: member.userId,
          displayName: member.displayName,
          hasVoted: Boolean(round?.votes.some((vote) => vote.voterId === member.userId)),
        }))
      : null;

  return {
    questionId,
    phase,
    proposalIds: orderProposalIds(proposalIds, outcome),
    tallies,
    votedCount,
    voterCount: members.length,
    winnerProposalId: outcome.winnerProposalId,
    tiedProposalIds: outcome.tiedProposalIds,
    myVote,
    voterStatuses,
  };
}

export async function getVotingStateForSession(
  sessionId: string,
  viewerId?: string,
): Promise<VotingViewerState> {
  const question = await getActiveQuestion(sessionId);
  return getVotingState(question?.id ?? null, viewerId);
}

/**
 * The shortlist for one question, or an empty unlocked list if none exists
 * yet. Used by the join snapshot so a refresh sees the same ticks.
 */
export async function getShortlistState(questionId: string | null): Promise<ShortlistState> {
  const voting = await getVotingState(questionId);
  return toShortlist(
    voting.questionId,
    voting.proposalIds,
    voting.phase === 'open' || voting.phase === 'closed',
  );
}

/** Shortlist for whichever question the board is currently showing. */
export async function getShortlistForSession(sessionId: string): Promise<ShortlistState> {
  const question = await getActiveQuestion(sessionId);
  return getShortlistState(question?.id ?? null);
}

/**
 * Add or remove one proposal on the shortlist. The server decides the
 * direction from what is stored, so two rapid clicks cannot double-count.
 */
export async function toggleShortlist({
  sessionId,
  actorId,
  proposalId,
}: {
  sessionId: string;
  actorId: string;
  proposalId: string;
}): Promise<ShortlistState> {
  await requireLiveLeader(sessionId, actorId);
  const question = await requireVotingQuestion(sessionId);

  const board = await listProposals(question.id);
  if (!board.some((item) => item.id === proposalId)) {
    throw new ApiError(
      400,
      'That proposal is not on this question’s board',
      'INVALID_SHORTLIST_ITEM',
    );
  }

  return prisma.$transaction(async (tx) => {
    let round = await tx.votingRound.findUnique({
      where: { questionId: question.id },
      include: { items: true },
    });

    if (round && round.status !== 'shortlisting') {
      throw new ApiError(409, 'The shortlist is locked — voting has started', 'SHORTLIST_LOCKED');
    }

    if (!round) {
      round = await tx.votingRound.create({
        data: {
          sessionId,
          questionId: question.id,
          status: 'shortlisting',
        },
        include: { items: true },
      });
    }

    const already = round.items.some((item) => item.proposalId === proposalId);
    if (already) {
      await tx.votingShortlistItem.deleteMany({
        where: { roundId: round.id, proposalId },
      });
    } else {
      if (round.items.length >= SHORTLIST_MAX) {
        throw new ApiError(409, `Pick at most ${SHORTLIST_MAX} proposals`, 'SHORTLIST_FULL');
      }
      await tx.votingShortlistItem.create({
        data: { roundId: round.id, proposalId },
      });
    }

    const items = await tx.votingShortlistItem.findMany({
      where: { roundId: round.id },
      orderBy: { proposalId: 'asc' },
    });
    return toShortlist(
      question.id,
      items.map((item) => item.proposalId),
      false,
    );
  });
}

/** F27 cancel: empty the shortlist without starting the vote. */
export async function clearShortlist({
  sessionId,
  actorId,
}: {
  sessionId: string;
  actorId: string;
}): Promise<ShortlistState> {
  await requireLiveLeader(sessionId, actorId);
  const question = await requireVotingQuestion(sessionId);

  const round = await prisma.votingRound.findUnique({
    where: { questionId: question.id },
  });
  if (!round) {
    return toShortlist(question.id, [], false);
  }
  if (round.status !== 'shortlisting') {
    throw new ApiError(409, 'The shortlist is locked — voting has started', 'SHORTLIST_LOCKED');
  }

  await prisma.votingShortlistItem.deleteMany({ where: { roundId: round.id } });
  return toShortlist(question.id, [], false);
}

/**
 * Lock the shortlist and open the round. Already-open is a no-op so a
 * double-click does not error.
 */
export async function startVotingRound({
  sessionId,
  actorId,
}: {
  sessionId: string;
  actorId: string;
}): Promise<ShortlistState> {
  await requireLiveLeader(sessionId, actorId);
  const question = await requireVotingQuestion(sessionId);

  const round = await prisma.votingRound.findUnique({
    where: { questionId: question.id },
    include: { items: { orderBy: { proposalId: 'asc' } } },
  });

  const proposalIds = round?.items.map((item) => item.proposalId) ?? [];
  if (proposalIds.length < SHORTLIST_MIN) {
    throw new ApiError(
      409,
      `Select at least ${SHORTLIST_MIN} proposals before starting the vote`,
      'SHORTLIST_TOO_SMALL',
    );
  }
  if (proposalIds.length > SHORTLIST_MAX) {
    throw new ApiError(409, `Pick at most ${SHORTLIST_MAX} proposals`, 'SHORTLIST_FULL');
  }

  if (!round) {
    throw new ApiError(409, 'Select proposals before starting the vote', 'SHORTLIST_TOO_SMALL');
  }

  if (round.status !== 'shortlisting') {
    return toShortlist(question.id, proposalIds, true);
  }

  await prisma.votingRound.update({
    where: { id: round.id },
    data: { status: 'open' },
  });

  return toShortlist(question.id, proposalIds, true);
}

/**
 * Cast or change this member's one vote. Unique on (round, voter), so a second
 * click replaces the first rather than counting twice.
 */
export async function castVote({
  sessionId,
  actorId,
  proposalId,
}: {
  sessionId: string;
  actorId: string;
  proposalId: string;
}): Promise<VotingPublicState> {
  await requireLiveMember(sessionId, actorId);
  const question = await requireVotingQuestion(sessionId);

  const round = await loadRound(question.id);
  if (!round || round.status !== 'open') {
    throw new ApiError(409, 'Voting has not started yet', 'VOTING_NOT_OPEN');
  }
  if (!round.items.some((item) => item.proposalId === proposalId)) {
    throw new ApiError(400, 'That proposal is not on the ballot', 'INVALID_VOTE');
  }

  await prisma.vote.upsert({
    where: { roundId_voterId: { roundId: round.id, voterId: actorId } },
    create: { roundId: round.id, voterId: actorId, proposalId },
    update: { proposalId },
  });

  return toPublicVotingState(await getVotingState(question.id, actorId));
}

/**
 * Most votes wins. A tie is a tie — no recency fallback. No votes means
 * there is no winner.
 */
export function pickWinningProposalId(
  proposalIds: string[],
  votes: { proposalId: string }[],
): string | null {
  const { tallies } = computeTallies(proposalIds, votes);
  return voteOutcomeFromTallies(tallies).winnerProposalId;
}

export interface CloseVotingResult {
  voting: VotingPublicState;
}

/**
 * Leader ends the round: persist the winner or a tie, and leave the question
 * in `voting` so the same overlay can show the result. Advancing is
 * `continueAfterVote`.
 */
export async function closeVotingRound({
  sessionId,
  actorId,
}: {
  sessionId: string;
  actorId: string;
}): Promise<CloseVotingResult> {
  await requireLiveLeader(sessionId, actorId);
  const question = await requireVotingQuestion(sessionId);

  const round = await loadRound(question.id);
  if (!round || round.status === 'shortlisting') {
    throw new ApiError(409, 'Start the vote before ending it', 'VOTING_NOT_OPEN');
  }

  if (round.status === 'open') {
    const winningProposalId = pickWinningProposalId(
      round.items.map((item) => item.proposalId),
      round.votes,
    );

    await prisma.$transaction(async (tx) => {
      await tx.votingRound.update({
        where: { id: round.id },
        data: { status: 'closed', closedAt: new Date() },
      });
      await tx.answer.upsert({
        where: { questionId: question.id },
        create: { questionId: question.id, winningProposalId },
        update: { winningProposalId },
      });
    });
  }

  return {
    voting: toPublicVotingState(await getVotingState(question.id)),
  };
}

export interface ContinueVotingResult {
  voting: VotingPublicState;
  answered: QuestionRef;
  opened: QuestionRef | null;
}

/**
 * Leader leaves the result overlay: mark the question answered and open the
 * next pending one, if any.
 */
export async function continueAfterVote({
  sessionId,
  actorId,
}: {
  sessionId: string;
  actorId: string;
}): Promise<ContinueVotingResult> {
  await requireLiveLeader(sessionId, actorId);
  const question = await requireVotingQuestion(sessionId);

  const round = await loadRound(question.id);
  if (!round || round.status !== 'closed') {
    throw new ApiError(409, 'End the vote before continuing', 'VOTING_NOT_CLOSED');
  }

  const answered = await setQuestionPhase({
    sessionId,
    questionId: question.id,
    leaderId: actorId,
    status: 'answered',
  });

  const session = await getSessionWithQuestions(sessionId);
  const nextPending = session?.questions.find((item) => item.status === 'pending');
  const opened = nextPending
    ? await setQuestionPhase({
        sessionId,
        questionId: nextPending.id,
        leaderId: actorId,
        status: 'discussion',
      })
    : null;

  return {
    voting: toPublicVotingState(await getVotingStateForSession(sessionId)),
    answered,
    opened,
  };
}

/** Closed-round results for F31. No voter identities — only counts and the declared outcome. */
export interface QuestionVoteOutcome {
  questionId: string;
  /** Shortlist in display order: winner (or ties) first. */
  proposalIds: string[];
  winnerProposalId: string | null;
  tiedProposalIds: string[];
  tallies: VotingTally[];
  votedCount: number;
}

export async function getSessionVoteOutcomes(sessionId: string): Promise<QuestionVoteOutcome[]> {
  const rounds = await prisma.votingRound.findMany({
    where: { sessionId },
    include: {
      items: { orderBy: { proposalId: 'asc' } },
      votes: true,
    },
  });

  return rounds.map((round) => {
    const rawIds = round.items.map((item) => item.proposalId);
    const { tallies, votedCount } = computeTallies(rawIds, round.votes);
    const outcome = closedOutcome(rawIds, round.votes, round.status === 'closed');
    return {
      questionId: round.questionId,
      proposalIds: orderProposalIds(rawIds, outcome),
      winnerProposalId: outcome.winnerProposalId,
      tiedProposalIds: outcome.tiedProposalIds,
      tallies,
      votedCount,
    };
  });
}
