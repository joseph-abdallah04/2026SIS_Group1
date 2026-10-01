import { beforeEach, describe, expect, it, vi } from 'vitest';

// Ended-session board reads. Prisma and the sessions adapter are stubbed; the
// queries themselves are the integration smoke test's job.
vi.mock('../../db.js', () => ({
  prisma: {
    proposal: { findMany: vi.fn() },
  },
}));

vi.mock('./sessionsAdapter.js', () => ({
  getQuestion: vi.fn(),
  getQuestionInSession: vi.fn(),
  getActiveQuestion: vi.fn(),
  getSession: vi.fn(),
  getDiscussionTimer: vi.fn(),
}));

const { prisma } = await import('../../db.js');
const { getActiveQuestion, getDiscussionTimer, getQuestionInSession, getSession } =
  await import('./sessionsAdapter.js');
const { getBoardForSession } = await import('./service.js');

const findMany = vi.mocked(prisma.proposal.findMany);
const activeQuestion = vi.mocked(getActiveQuestion);
const questionInSession = vi.mocked(getQuestionInSession);
const session = vi.mocked(getSession);
const discussionTimer = vi.mocked(getDiscussionTimer);

function question(id: string, status: 'discussion' | 'answered' = 'answered') {
  return {
    id,
    sessionId: 's1',
    text: `Question ${id}`,
    position: id === 'q1' ? 0 : 1,
    status,
    boardLocked: true,
    votingEnabled: true,
  };
}

function row(id: string, text: string) {
  return {
    id,
    questionId: 'q2',
    authorId: 'u1',
    author: { displayName: 'Alice' },
    type: 'sticky',
    artifactJson: { type: 'sticky', text, color: 'yellow' },
    x: 12,
    y: 24,
    extendsProposalId: null,
    reactions: [],
    createdAt: new Date('2026-09-07T10:00:00.000Z'),
    z: 0,
    editedAt: null,
    deletedAt: null,
  };
}

const ENDED = {
  id: 's1',
  title: 'Roadmap',
  status: 'ended' as const,
  leaderId: 'leader-1',
  discussionTimerSeconds: null,
  votingTimerSeconds: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue(ENDED);
  discussionTimer.mockResolvedValue(null);
  activeQuestion.mockResolvedValue(question('q1', 'discussion'));
  questionInSession.mockResolvedValue(question('q2'));
  findMany.mockResolvedValue([row('p1', 'Ship it'), row('p2', 'Wait')] as never);
});

describe('getBoardForSession', () => {
  it('keeps the focused question when no question is named', async () => {
    session.mockResolvedValue({ ...ENDED, status: 'active' });

    const board = await getBoardForSession('s1');

    expect(board.questionId).toBe('q1');
    expect(activeQuestion).toHaveBeenCalledWith('s1');
    expect(questionInSession).not.toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { questionId: 'q1', deletedAt: null } }),
    );
  });

  it('returns every remaining proposal on an ended question, not only a shortlist', async () => {
    const board = await getBoardForSession('s1', 'q2');

    expect(questionInSession).toHaveBeenCalledWith('s1', 'q2');
    expect(activeQuestion).not.toHaveBeenCalled();
    expect(board.questionId).toBe('q2');
    expect(board.items.map((item) => item.id)).toEqual(['p1', 'p2']);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { questionId: 'q2', deletedAt: null } }),
    );
  });

  it('404s a question that is not in this session, and does not list its proposals', async () => {
    questionInSession.mockResolvedValue(null);

    await expect(getBoardForSession('s1', 'q-other')).rejects.toMatchObject({
      status: 404,
      code: 'QUESTION_NOT_FOUND',
    });
    expect(questionInSession).toHaveBeenCalledWith('s1', 'q-other');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('409s a named question while the session is still live', async () => {
    session.mockResolvedValue({ ...ENDED, status: 'active' });

    await expect(getBoardForSession('s1', 'q2')).rejects.toMatchObject({
      status: 409,
      code: 'SESSION_NOT_ENDED',
    });
    expect(questionInSession).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('404s a session that does not exist before looking up a question', async () => {
    session.mockResolvedValue(null);

    await expect(getBoardForSession('missing', 'q2')).rejects.toMatchObject({
      status: 404,
      code: 'SESSION_NOT_FOUND',
    });
    expect(questionInSession).not.toHaveBeenCalled();
  });
});
