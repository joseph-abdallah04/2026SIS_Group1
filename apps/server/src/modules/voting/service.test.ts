import { SHORTLIST_MAX, SHORTLIST_MIN } from '@roundtable/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const getActiveQuestion = vi.fn();
const getQuestion = vi.fn();
const listSessionMembers = vi.fn();
const setQuestionPhase = vi.fn();
const getSessionWithQuestions = vi.fn();
const listProposals = vi.fn();
const roundFindUnique = vi.fn();
const roundCreate = vi.fn();
const roundUpdate = vi.fn();
const itemDeleteMany = vi.fn();
const itemCreate = vi.fn();
const itemFindMany = vi.fn();
const voteUpsert = vi.fn();
const answerUpsert = vi.fn();
const roundFindMany = vi.fn();

const tx = {
  votingRound: { findUnique: roundFindUnique, create: roundCreate, update: roundUpdate },
  votingShortlistItem: {
    deleteMany: itemDeleteMany,
    create: itemCreate,
    findMany: itemFindMany,
  },
  vote: { upsert: voteUpsert },
  answer: { upsert: answerUpsert },
};

vi.mock('../../db.js', () => ({
  prisma: {
    votingRound: { findUnique: roundFindUnique, update: roundUpdate, findMany: roundFindMany },
    votingShortlistItem: { deleteMany: itemDeleteMany },
    vote: { upsert: voteUpsert },
    answer: { upsert: answerUpsert },
    $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

vi.mock('./sessionsAdapter.js', () => ({
  getSession,
  getActiveQuestion,
  getQuestion,
  listSessionMembers,
  setQuestionPhase,
  getSessionWithQuestions,
}));
vi.mock('../pinboard/index.js', () => ({ listProposals }));

const {
  toggleShortlist,
  startVotingRound,
  clearShortlist,
  getShortlistState,
  getVotingState,
  castVote,
  closeVotingRound,
  continueAfterVote,
  pickWinningProposalId,
  getSessionVoteOutcomes,
} = await import('./service.js');

const LEADER = 'leader-1';
const SESSION = {
  id: 's1',
  title: 'Roadmap',
  status: 'active' as const,
  leaderId: LEADER,
};
const VOTING_QUESTION = {
  id: 'q1',
  sessionId: 's1',
  text: 'What ships first?',
  position: 0,
  status: 'voting' as const,
};
const MEMBERS = [
  { userId: LEADER, displayName: 'Leader', joinedAt: new Date() },
  { userId: 'u2', displayName: 'Ada', joinedAt: new Date() },
];

function proposal(id: string, createdAt = '2026-09-01T00:00:00.000Z') {
  return { id, questionId: 'q1', createdAt };
}

function openRound(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    status: 'open' as const,
    items: [{ proposalId: 'p1' }, { proposalId: 'p2' }],
    votes: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue(SESSION);
  getActiveQuestion.mockResolvedValue(VOTING_QUESTION);
  getQuestion.mockResolvedValue(VOTING_QUESTION);
  listSessionMembers.mockResolvedValue(MEMBERS);
  listProposals.mockResolvedValue([proposal('p1'), proposal('p2'), proposal('p3')]);
  setQuestionPhase.mockImplementation(
    async ({ questionId, status }: { questionId: string; status: string }) => ({
      ...VOTING_QUESTION,
      id: questionId,
      status,
    }),
  );
  getSessionWithQuestions.mockResolvedValue({
    ...SESSION,
    questions: [VOTING_QUESTION, { id: 'q2', status: 'pending' }],
  });
});

describe('toggleShortlist', () => {
  it('refuses a participant who is not the leader', async () => {
    await expect(
      toggleShortlist({ sessionId: 's1', actorId: 'u2', proposalId: 'p1' }),
    ).rejects.toMatchObject({ code: 'NOT_SESSION_LEADER' });
    expect(roundFindUnique).not.toHaveBeenCalled();
  });

  it('refuses when the question on screen is not in voting', async () => {
    getActiveQuestion.mockResolvedValue({ ...VOTING_QUESTION, status: 'discussion' });
    await expect(
      toggleShortlist({ sessionId: 's1', actorId: LEADER, proposalId: 'p1' }),
    ).rejects.toMatchObject({ code: 'QUESTION_NOT_VOTING' });
  });

  it('refuses a proposal that is not on this question', async () => {
    await expect(
      toggleShortlist({ sessionId: 's1', actorId: LEADER, proposalId: 'other' }),
    ).rejects.toMatchObject({ code: 'INVALID_SHORTLIST_ITEM' });
  });

  it('creates a round and adds the first proposal', async () => {
    roundFindUnique.mockResolvedValueOnce(null);
    roundCreate.mockResolvedValue({ id: 'r1', status: 'shortlisting', items: [] });
    itemFindMany.mockResolvedValue([{ proposalId: 'p1' }]);

    await expect(
      toggleShortlist({ sessionId: 's1', actorId: LEADER, proposalId: 'p1' }),
    ).resolves.toEqual({
      questionId: 'q1',
      proposalIds: ['p1'],
      locked: false,
    });
    expect(itemCreate).toHaveBeenCalledWith({ data: { roundId: 'r1', proposalId: 'p1' } });
  });

  it('removes a proposal that is already on the list', async () => {
    roundFindUnique.mockResolvedValue({
      id: 'r1',
      status: 'shortlisting',
      items: [{ proposalId: 'p1' }],
    });
    itemFindMany.mockResolvedValue([]);

    await expect(
      toggleShortlist({ sessionId: 's1', actorId: LEADER, proposalId: 'p1' }),
    ).resolves.toEqual({
      questionId: 'q1',
      proposalIds: [],
      locked: false,
    });
    expect(itemDeleteMany).toHaveBeenCalledWith({ where: { roundId: 'r1', proposalId: 'p1' } });
    expect(itemCreate).not.toHaveBeenCalled();
  });

  it('refuses a seventh proposal', async () => {
    const items = Array.from({ length: SHORTLIST_MAX }, (_, i) => ({ proposalId: `x${i}` }));
    listProposals.mockResolvedValue([
      ...items.map((item) => proposal(item.proposalId)),
      proposal('p1'),
    ]);
    roundFindUnique.mockResolvedValue({ id: 'r1', status: 'shortlisting', items });

    await expect(
      toggleShortlist({ sessionId: 's1', actorId: LEADER, proposalId: 'p1' }),
    ).rejects.toMatchObject({ code: 'SHORTLIST_FULL' });
  });

  it('refuses once the round is locked', async () => {
    roundFindUnique.mockResolvedValue({ id: 'r1', status: 'open', items: [{ proposalId: 'p1' }] });
    await expect(
      toggleShortlist({ sessionId: 's1', actorId: LEADER, proposalId: 'p2' }),
    ).rejects.toMatchObject({ code: 'SHORTLIST_LOCKED' });
  });
});

describe('startVotingRound', () => {
  it(`refuses a shortlist smaller than ${SHORTLIST_MIN}`, async () => {
    roundFindUnique.mockResolvedValue({
      id: 'r1',
      status: 'shortlisting',
      items: [{ proposalId: 'p1' }],
    });
    await expect(startVotingRound({ sessionId: 's1', actorId: LEADER })).rejects.toMatchObject({
      code: 'SHORTLIST_TOO_SMALL',
    });
  });

  it('locks a valid shortlist', async () => {
    roundFindUnique.mockResolvedValue({
      id: 'r1',
      status: 'shortlisting',
      items: [{ proposalId: 'p1' }, { proposalId: 'p2' }],
    });
    await expect(startVotingRound({ sessionId: 's1', actorId: LEADER })).resolves.toEqual({
      questionId: 'q1',
      proposalIds: ['p1', 'p2'],
      locked: true,
    });
    expect(roundUpdate).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { status: 'open' },
    });
  });

  it('is a no-op if the round is already open', async () => {
    roundFindUnique.mockResolvedValue({
      id: 'r1',
      status: 'open',
      items: [{ proposalId: 'p1' }, { proposalId: 'p2' }],
    });
    await expect(startVotingRound({ sessionId: 's1', actorId: LEADER })).resolves.toMatchObject({
      locked: true,
    });
    expect(roundUpdate).not.toHaveBeenCalled();
  });
});

describe('clearShortlist', () => {
  it('empties an open shortlist', async () => {
    roundFindUnique.mockResolvedValue({ id: 'r1', status: 'shortlisting' });
    await expect(clearShortlist({ sessionId: 's1', actorId: LEADER })).resolves.toEqual({
      questionId: 'q1',
      proposalIds: [],
      locked: false,
    });
    expect(itemDeleteMany).toHaveBeenCalledWith({ where: { roundId: 'r1' } });
  });
});

describe('getShortlistState / getVotingState', () => {
  it('returns empty and unlocked when there is no round', async () => {
    roundFindUnique.mockResolvedValue(null);
    await expect(getShortlistState('q1')).resolves.toEqual({
      questionId: 'q1',
      proposalIds: [],
      locked: false,
    });
  });

  it('reports shortlisting while the leader is still picking', async () => {
    roundFindUnique.mockResolvedValue({
      id: 'r1',
      status: 'shortlisting',
      items: [{ proposalId: 'p1' }],
      votes: [],
    });
    await expect(getVotingState('q1', LEADER)).resolves.toMatchObject({
      phase: 'shortlisting',
      proposalIds: ['p1'],
      myVote: null,
      voterCount: 2,
    });
  });

  it('includes this viewer’s ballot without naming anyone else', async () => {
    roundFindUnique.mockResolvedValue({
      id: 'r1',
      status: 'open',
      items: [{ proposalId: 'p1' }, { proposalId: 'p2' }],
      votes: [
        { voterId: LEADER, proposalId: 'p1' },
        { voterId: 'u2', proposalId: 'p2' },
      ],
    });
    await expect(getVotingState('q1', LEADER)).resolves.toMatchObject({
      phase: 'open',
      myVote: 'p1',
      votedCount: 2,
      winnerProposalId: null,
      tiedProposalIds: [],
      tallies: [
        { proposalId: 'p1', votes: 1, percent: 50 },
        { proposalId: 'p2', votes: 1, percent: 50 },
      ],
    });
  });

  it('declares the winner and puts them first only after the round is closed', async () => {
    getQuestion.mockResolvedValue({ ...VOTING_QUESTION, status: 'voting' });
    roundFindUnique.mockResolvedValue({
      id: 'r1',
      status: 'closed',
      items: [{ proposalId: 'p2' }, { proposalId: 'p1' }],
      votes: [
        { voterId: LEADER, proposalId: 'p1' },
        { voterId: 'u2', proposalId: 'p1' },
      ],
    });

    await expect(getVotingState('q1', LEADER)).resolves.toMatchObject({
      phase: 'closed',
      proposalIds: ['p1', 'p2'],
      winnerProposalId: 'p1',
      tiedProposalIds: [],
    });
  });

  it('declares a tie on the closed round instead of picking a winner', async () => {
    getQuestion.mockResolvedValue({ ...VOTING_QUESTION, status: 'voting' });
    roundFindUnique.mockResolvedValue({
      id: 'r1',
      status: 'closed',
      items: [{ proposalId: 'p1' }, { proposalId: 'p2' }],
      votes: [
        { voterId: LEADER, proposalId: 'p1' },
        { voterId: 'u2', proposalId: 'p2' },
      ],
    });

    await expect(getVotingState('q1', LEADER)).resolves.toMatchObject({
      phase: 'closed',
      winnerProposalId: null,
      tiedProposalIds: ['p1', 'p2'],
    });
  });

  it('gives the leader voted/not-yet names, and a participant nothing', async () => {
    roundFindUnique.mockResolvedValue(
      openRound({ votes: [{ voterId: 'u2', proposalId: 'p1' }] }),
    );

    await expect(getVotingState('q1', 'u2')).resolves.toMatchObject({ voterStatuses: null });
    await expect(getVotingState('q1', LEADER)).resolves.toMatchObject({
      voterStatuses: [
        { userId: LEADER, displayName: 'Leader', hasVoted: false },
        { userId: 'u2', displayName: 'Ada', hasVoted: true },
      ],
    });
  });
});

describe('castVote', () => {
  it('refuses a vote before the round is open', async () => {
    roundFindUnique.mockResolvedValue({
      id: 'r1',
      status: 'shortlisting',
      items: [{ proposalId: 'p1' }, { proposalId: 'p2' }],
      votes: [],
    });
    await expect(
      castVote({ sessionId: 's1', actorId: 'u2', proposalId: 'p1' }),
    ).rejects.toMatchObject({ code: 'VOTING_NOT_OPEN' });
  });

  it('refuses a proposal that is not on the ballot', async () => {
    roundFindUnique.mockResolvedValue(openRound());
    await expect(
      castVote({ sessionId: 's1', actorId: 'u2', proposalId: 'p3' }),
    ).rejects.toMatchObject({ code: 'INVALID_VOTE' });
  });

  it('refuses someone who has left the session', async () => {
    listSessionMembers.mockResolvedValue([MEMBERS[0]]);
    await expect(
      castVote({ sessionId: 's1', actorId: 'u2', proposalId: 'p1' }),
    ).rejects.toMatchObject({ code: 'NOT_SESSION_MEMBER' });
    expect(voteUpsert).not.toHaveBeenCalled();
  });

  it('upserts the member’s one vote and returns anonymous tallies', async () => {
    roundFindUnique.mockResolvedValueOnce(openRound()).mockResolvedValueOnce(
      openRound({
        votes: [{ voterId: 'u2', proposalId: 'p1' }],
      }),
    );
    voteUpsert.mockResolvedValue({});

    await expect(
      castVote({ sessionId: 's1', actorId: 'u2', proposalId: 'p1' }),
    ).resolves.toMatchObject({
      phase: 'open',
      votedCount: 1,
      tallies: [
        { proposalId: 'p1', votes: 1, percent: 100 },
        { proposalId: 'p2', votes: 0, percent: 0 },
      ],
    });
    expect(voteUpsert).toHaveBeenCalledWith({
      where: { roundId_voterId: { roundId: 'r1', voterId: 'u2' } },
      create: { roundId: 'r1', voterId: 'u2', proposalId: 'p1' },
      update: { proposalId: 'p1' },
    });
  });
});

describe('pickWinningProposalId', () => {
  it('returns the proposal with the most votes', () => {
    expect(
      pickWinningProposalId(
        ['p1', 'p2'],
        [{ proposalId: 'p1' }, { proposalId: 'p1' }, { proposalId: 'p2' }],
      ),
    ).toBe('p1');
  });

  it('leaves a tie unbroken', () => {
    expect(
      pickWinningProposalId(['p1', 'p2'], [{ proposalId: 'p1' }, { proposalId: 'p2' }]),
    ).toBeNull();
  });

  it('returns null when nobody voted', () => {
    expect(pickWinningProposalId(['p1', 'p2'], [])).toBeNull();
  });
});

describe('closeVotingRound', () => {
  it('refuses a participant who is not the leader', async () => {
    await expect(closeVotingRound({ sessionId: 's1', actorId: 'u2' })).rejects.toMatchObject({
      code: 'NOT_SESSION_LEADER',
    });
  });

  it('refuses while the leader is still shortlisting', async () => {
    roundFindUnique.mockResolvedValue({
      id: 'r1',
      status: 'shortlisting',
      items: [{ proposalId: 'p1' }, { proposalId: 'p2' }],
      votes: [],
    });
    await expect(closeVotingRound({ sessionId: 's1', actorId: LEADER })).rejects.toMatchObject({
      code: 'VOTING_NOT_OPEN',
    });
  });

  it('writes the winner and keeps the question in voting so the overlay can show it', async () => {
    roundFindUnique
      .mockResolvedValueOnce(
        openRound({
          votes: [
            { voterId: LEADER, proposalId: 'p1' },
            { voterId: 'u2', proposalId: 'p1' },
          ],
        }),
      )
      .mockResolvedValueOnce({
        id: 'r1',
        status: 'closed',
        items: [{ proposalId: 'p1' }, { proposalId: 'p2' }],
        votes: [
          { voterId: LEADER, proposalId: 'p1' },
          { voterId: 'u2', proposalId: 'p1' },
        ],
      });

    const result = await closeVotingRound({ sessionId: 's1', actorId: LEADER });

    expect(answerUpsert).toHaveBeenCalledWith({
      where: { questionId: 'q1' },
      create: { questionId: 'q1', winningProposalId: 'p1' },
      update: { winningProposalId: 'p1' },
    });
    expect(setQuestionPhase).not.toHaveBeenCalled();
    expect(result.voting.phase).toBe('closed');
  });

  it('stores no winner when the top score is shared', async () => {
    roundFindUnique
      .mockResolvedValueOnce(
        openRound({
          votes: [
            { voterId: LEADER, proposalId: 'p1' },
            { voterId: 'u2', proposalId: 'p2' },
          ],
        }),
      )
      .mockResolvedValueOnce({
        id: 'r1',
        status: 'closed',
        items: [{ proposalId: 'p1' }, { proposalId: 'p2' }],
        votes: [
          { voterId: LEADER, proposalId: 'p1' },
          { voterId: 'u2', proposalId: 'p2' },
        ],
      });

    await closeVotingRound({ sessionId: 's1', actorId: LEADER });

    expect(answerUpsert).toHaveBeenCalledWith({
      where: { questionId: 'q1' },
      create: { questionId: 'q1', winningProposalId: null },
      update: { winningProposalId: null },
    });
  });
});

describe('continueAfterVote', () => {
  it('refuses before the round is closed', async () => {
    roundFindUnique.mockResolvedValue(openRound());
    await expect(continueAfterVote({ sessionId: 's1', actorId: LEADER })).rejects.toMatchObject({
      code: 'VOTING_NOT_CLOSED',
    });
  });

  it('marks the question answered and opens the next one', async () => {
    roundFindUnique.mockResolvedValue({
      id: 'r1',
      status: 'closed',
      items: [{ proposalId: 'p1' }],
      votes: [{ voterId: LEADER, proposalId: 'p1' }],
    });
    getActiveQuestion.mockResolvedValueOnce(VOTING_QUESTION).mockResolvedValueOnce({
      id: 'q2',
      sessionId: 's1',
      text: 'Next',
      position: 1,
      status: 'discussion' as const,
    });

    const result = await continueAfterVote({ sessionId: 's1', actorId: LEADER });

    expect(setQuestionPhase).toHaveBeenNthCalledWith(1, {
      sessionId: 's1',
      questionId: 'q1',
      leaderId: LEADER,
      status: 'answered',
    });
    expect(setQuestionPhase).toHaveBeenNthCalledWith(2, {
      sessionId: 's1',
      questionId: 'q2',
      leaderId: LEADER,
      status: 'discussion',
    });
    expect(result.opened?.id).toBe('q2');
  });
});

describe('getSessionVoteOutcomes', () => {
  it('returns anonymous tallies and the declared outcome, never voter ids', async () => {
    roundFindMany.mockResolvedValue([
      {
        questionId: 'q1',
        status: 'closed',
        items: [{ proposalId: 'p2' }, { proposalId: 'p1' }],
        votes: [
          { voterId: LEADER, proposalId: 'p1' },
          { voterId: 'u2', proposalId: 'p1' },
        ],
      },
    ]);

    await expect(getSessionVoteOutcomes('s1')).resolves.toEqual([
      {
        questionId: 'q1',
        proposalIds: ['p1', 'p2'],
        winnerProposalId: 'p1',
        tiedProposalIds: [],
        tallies: [
          { proposalId: 'p2', votes: 0, percent: 0 },
          { proposalId: 'p1', votes: 2, percent: 100 },
        ],
        votedCount: 2,
      },
    ]);
  });

  it('declares a tie on a closed round instead of reading a stored winner', async () => {
    roundFindMany.mockResolvedValue([
      {
        questionId: 'q1',
        status: 'closed',
        items: [{ proposalId: 'p1' }, { proposalId: 'p2' }],
        votes: [
          { voterId: LEADER, proposalId: 'p1' },
          { voterId: 'u2', proposalId: 'p2' },
        ],
      },
    ]);

    await expect(getSessionVoteOutcomes('s1')).resolves.toMatchObject([
      {
        questionId: 'q1',
        winnerProposalId: null,
        tiedProposalIds: ['p1', 'p2'],
      },
    ]);
  });
});
