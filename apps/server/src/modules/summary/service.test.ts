import { beforeEach, describe, expect, it, vi } from 'vitest';

const assertSessionMember = vi.fn();
const getSessionWithQuestions = vi.fn();
const listSessionParticipants = vi.fn();
const listProposals = vi.fn();
const getSessionVoteOutcomes = vi.fn();

vi.mock('./sessionsAdapter.js', () => ({
  assertSessionMember,
  getSessionWithQuestions,
  listSessionParticipants,
}));
vi.mock('./pinboardAdapter.js', () => ({ listProposals }));
vi.mock('./votingAdapter.js', () => ({ getSessionVoteOutcomes }));

const { getSessionSummary } = await import('./service.js');

const ENDED = {
  id: 's1',
  title: 'Roadmap',
  status: 'ended' as const,
  leaderId: 'leader-1',
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  startedAt: new Date('2026-09-01T01:00:00.000Z'),
  endedAt: new Date('2026-09-01T02:00:00.000Z'),
  questions: [
    {
      id: 'q1',
      sessionId: 's1',
      text: 'What ships first?',
      position: 0,
      status: 'answered' as const,
    },
    {
      id: 'q2',
      sessionId: 's1',
      text: 'What can wait?',
      position: 1,
      status: 'skipped' as const,
    },
  ],
};

function sticky(id: string, text: string) {
  return {
    id,
    questionId: 'q1',
    authorId: 'u2',
    authorName: 'Ada',
    type: 'sticky' as const,
    artifactJson: { type: 'sticky' as const, text, color: 'yellow' as const },
    x: 0,
    y: 0,
    createdAt: '2026-09-01T01:10:00.000Z',
    extendsProposalId: null,
    reactions: [],
  };
}

const WINNER = sticky('p1', 'The API');
const RUNNER_UP = sticky('p2', 'The UI');
const LEFT_OFF = sticky('p3', 'A leftover sticky');

beforeEach(() => {
  vi.clearAllMocks();
  assertSessionMember.mockResolvedValue(undefined);
  getSessionWithQuestions.mockResolvedValue(ENDED);
  listSessionParticipants.mockResolvedValue([
    { userId: 'leader-1', displayName: 'Leader', joinedAt: new Date() },
    { userId: 'u2', displayName: 'Ada', joinedAt: new Date() },
  ]);
  listProposals.mockImplementation(async (questionId: string) =>
    questionId === 'q1' ? [WINNER, RUNNER_UP, LEFT_OFF] : [],
  );
  getSessionVoteOutcomes.mockResolvedValue([
    {
      questionId: 'q1',
      proposalIds: ['p1', 'p2'],
      winnerProposalId: 'p1',
      tallies: [
        { proposalId: 'p1', votes: 2, percent: 67 },
        { proposalId: 'p2', votes: 1, percent: 33 },
      ],
      votedCount: 3,
    },
  ]);
});

describe('getSessionSummary', () => {
  it('refuses a stranger', async () => {
    assertSessionMember.mockRejectedValueOnce(
      Object.assign(new Error('no'), { code: 'NOT_SESSION_MEMBER' }),
    );
    await expect(getSessionSummary('s1', 'outsider')).rejects.toMatchObject({
      code: 'NOT_SESSION_MEMBER',
    });
  });

  it('refuses while the session is still live', async () => {
    getSessionWithQuestions.mockResolvedValue({ ...ENDED, status: 'active' });
    await expect(getSessionSummary('s1', 'u2')).rejects.toMatchObject({
      code: 'SESSION_NOT_ENDED',
    });
  });

  it('keeps only the shortlist and names the winner', async () => {
    const summary = await getSessionSummary('s1', 'u2');
    expect(summary.title).toBe('Roadmap');
    expect(summary.endedAt).toBe('2026-09-01T02:00:00.000Z');
    expect(summary.participants).toEqual([
      { userId: 'leader-1', displayName: 'Leader', isLeader: true },
      { userId: 'u2', displayName: 'Ada', isLeader: false },
    ]);
    expect(summary.questions[0]).toMatchObject({
      id: 'q1',
      status: 'answered',
      winnerProposalId: 'p1',
      votedCount: 3,
    });
    expect(summary.questions[0]?.proposals).toEqual([WINNER, RUNNER_UP]);
    expect(listProposals).toHaveBeenCalledTimes(1);
    expect(summary.questions[1]).toMatchObject({
      id: 'q2',
      status: 'skipped',
      winnerProposalId: null,
      proposals: [],
    });
  });
});
