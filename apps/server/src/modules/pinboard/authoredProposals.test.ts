import { beforeEach, describe, expect, it, vi } from 'vitest';

// F38 - a member's own proposals across a whole session, so an earlier one can
// be reused on the question now in front of them. Prisma and the sessions
// adapter are stubbed; the queries themselves are the smoke test's job.
vi.mock('../../db.js', () => ({
  prisma: {
    proposal: { findMany: vi.fn() },
  },
}));

vi.mock('./sessionsAdapter.js', () => ({
  getQuestion: vi.fn(),
  getActiveQuestion: vi.fn(),
  getSession: vi.fn(),
  getSessionWithQuestions: vi.fn(),
}));

const { prisma } = await import('../../db.js');
const { getActiveQuestion, getSessionWithQuestions } = await import('./sessionsAdapter.js');
const { listAuthoredProposals } = await import('./service.js');

const findMany = vi.mocked(prisma.proposal.findMany);
const sessionWithQuestions = vi.mocked(getSessionWithQuestions);
const activeQuestion = vi.mocked(getActiveQuestion);

const MINE = { sessionId: 's1', authorId: 'u1' };

function question(id: string, position: number, text = `Question ${position}`) {
  return { id, sessionId: 's1', text, position, status: 'answered' as const };
}

function row(id: string, questionId: string, text = 'Hello') {
  return {
    id,
    questionId,
    authorId: 'u1',
    author: { displayName: 'Alice' },
    type: 'sticky',
    artifactJson: { type: 'sticky', text, color: 'yellow' },
    x: 0,
    y: 0,
    extendsProposalId: null,
    reactions: [],
    createdAt: new Date('2026-09-07T10:00:00.000Z'),
    editedAt: null,
    deletedAt: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionWithQuestions.mockResolvedValue({
    id: 's1',
    questions: [question('q1', 0), question('q2', 1), question('q3', 2)],
  } as never);
  activeQuestion.mockResolvedValue(question('q3', 2) as never);
  findMany.mockResolvedValue([] as never);
});

describe('listAuthoredProposals', () => {
  it('reports a session that does not exist rather than an empty history', async () => {
    sessionWithQuestions.mockResolvedValue(null);

    await expect(listAuthoredProposals(MINE)).rejects.toMatchObject({
      status: 404,
      code: 'SESSION_NOT_FOUND',
    });
  });

  // The author comes from the caller, which takes it from the authenticated
  // request. A client cannot ask for somebody else's history by naming them.
  it('asks only for this author, and only for questions in this session', async () => {
    await listAuthoredProposals(MINE);

    expect(findMany.mock.calls[0]?.[0]?.where).toEqual({
      questionId: { in: ['q1', 'q2', 'q3'] },
      authorId: 'u1',
      deletedAt: null,
    });
  });

  // Newest first: what you proposed a minute ago is far likelier to be worth
  // reusing than something from the top of the agenda.
  it('groups by question, most recent question first', async () => {
    findMany.mockResolvedValue([
      row('p1', 'q1', 'Oldest'),
      row('p2', 'q2', 'Middle'),
      row('p3', 'q3', 'Newest'),
    ] as never);

    const result = await listAuthoredProposals(MINE);

    expect(result.groups.map((group) => group.questionId)).toEqual(['q3', 'q2', 'q1']);
    expect(result.groups[0]?.items.map((item) => item.id)).toEqual(['p3']);
  });

  // A heading with nothing under it is noise in a list whose whole purpose is
  // finding something.
  it('leaves out questions this member proposed nothing to', async () => {
    findMany.mockResolvedValue([row('p1', 'q1')] as never);

    const result = await listAuthoredProposals(MINE);

    expect(result.groups.map((group) => group.questionId)).toEqual(['q1']);
  });

  // Proposals on the current question are already on the board, so the client
  // lists them for context but cannot reuse them onto it.
  it('marks which group is the question the board is showing', async () => {
    findMany.mockResolvedValue([row('p1', 'q1'), row('p3', 'q3')] as never);

    const result = await listAuthoredProposals(MINE);

    expect(result.currentQuestionId).toBe('q3');
    expect(result.groups.find((group) => group.questionId === 'q3')?.isCurrent).toBe(true);
    expect(result.groups.find((group) => group.questionId === 'q1')?.isCurrent).toBe(false);
  });

  it('carries the question text, so a proposal is read beside what it answered', async () => {
    findMany.mockResolvedValue([row('p1', 'q1')] as never);

    const result = await listAuthoredProposals(MINE);

    expect(result.groups[0]).toMatchObject({
      questionText: 'Question 0',
      questionPosition: 0,
      questionStatus: 'answered',
    });
  });

  // Between questions there is nothing on the board to reuse onto, and the
  // client needs to know that rather than infer it.
  it('reports no current question when none is open', async () => {
    activeQuestion.mockResolvedValue(null);
    findMany.mockResolvedValue([row('p1', 'q1')] as never);

    const result = await listAuthoredProposals(MINE);

    expect(result.currentQuestionId).toBeNull();
    expect(result.groups.every((group) => !group.isCurrent)).toBe(true);
  });

  it('does not query at all for a session with no questions yet', async () => {
    sessionWithQuestions.mockResolvedValue({ id: 's1', questions: [] } as never);

    const result = await listAuthoredProposals(MINE);

    expect(findMany).not.toHaveBeenCalled();
    expect(result.groups).toEqual([]);
  });
});
