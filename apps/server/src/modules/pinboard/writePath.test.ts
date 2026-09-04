import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuestionStatus } from '@roundtable/shared';

// The write path's rules are the interesting part, not Prisma. Both the
// database and the sessions adapter are stubbed so each rule can be exercised
// on its own; the queries themselves are covered by the integration smoke test.
vi.mock('../../db.js', () => ({
  prisma: {
    proposal: { create: vi.fn(), findFirst: vi.fn() },
  },
}));

vi.mock('./sessionsAdapter.js', () => ({
  getQuestion: vi.fn(),
  getActiveQuestion: vi.fn(),
  getSession: vi.fn(),
}));

const { prisma } = await import('../../db.js');
const { getActiveQuestion, getQuestion } = await import('./sessionsAdapter.js');
const { createProposal } = await import('./service.js');
const { registerPinboardSocketHandlers } = await import('./socket.js');

const create = vi.mocked(prisma.proposal.create);
const findFirst = vi.mocked(prisma.proposal.findFirst);
const question = vi.mocked(getQuestion);
const activeQuestion = vi.mocked(getActiveQuestion);

const STICKY = {
  type: 'sticky',
  artifactJson: { type: 'sticky', text: 'Hello', color: 'yellow' },
  x: 0,
  y: 0,
} as Parameters<typeof createProposal>[0]['input'];

function questionRef(status: QuestionStatus = 'discussion') {
  return { id: 'q1', sessionId: 's1', text: 'Q', position: 0, status };
}

function createdRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p-new',
    questionId: 'q1',
    authorId: 'u1',
    author: { displayName: 'Alice' },
    type: 'sticky',
    artifactJson: { type: 'sticky', text: 'Hello', color: 'yellow' },
    x: 0,
    y: 0,
    extendsProposalId: null,
    createdAt: new Date('2026-08-31T10:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  question.mockResolvedValue(questionRef('discussion'));
  create.mockResolvedValue(createdRow() as never);
});

describe('createProposal', () => {
  it('writes the proposal and returns it in board shape', async () => {
    const proposal = await createProposal({ questionId: 'q1', authorId: 'u1', input: STICKY });
    expect(proposal.id).toBe('p-new');
    expect(proposal.authorName).toBe('Alice');
  });

  it('takes the author from its argument, never from the input', async () => {
    await createProposal({ questionId: 'q1', authorId: 'u1', input: STICKY });
    expect(create.mock.calls[0]?.[0].data).toMatchObject({ authorId: 'u1', questionId: 'q1' });
  });

  it('rejects a write to a question that does not exist', async () => {
    question.mockResolvedValue(null);
    await expect(
      createProposal({ questionId: 'gone', authorId: 'u1', input: STICKY }),
    ).rejects.toThrow(/Question not found/);
    expect(create).not.toHaveBeenCalled();
  });

  // The phase lock lives here rather than in the socket handler so a server-side
  // caller — the assistant proposing on a user's behalf (F37) — cannot skip it.
  it.each(['pending', 'voting', 'answered', 'skipped'] as const)(
    'refuses to write while the question is %s',
    async (status) => {
      question.mockResolvedValue(questionRef(status));
      await expect(
        createProposal({ questionId: 'q1', authorId: 'u1', input: STICKY }),
      ).rejects.toThrow(/proposals are closed/);
      expect(create).not.toHaveBeenCalled();
    },
  );

  it('allows a write while the question is in discussion', async () => {
    await expect(
      createProposal({ questionId: 'q1', authorId: 'u1', input: STICKY }),
    ).resolves.toBeDefined();
  });

  describe('extends', () => {
    const extending = { ...STICKY, extendsProposalId: 'parent-1' };

    it('accepts a parent that is on the same board', async () => {
      findFirst.mockResolvedValue({ id: 'parent-1' } as never);
      create.mockResolvedValue(createdRow({ extendsProposalId: 'parent-1' }) as never);

      const proposal = await createProposal({
        questionId: 'q1',
        authorId: 'u1',
        input: extending,
      });
      expect(proposal.extendsProposalId).toBe('parent-1');
    });

    it('rejects a parent on another board or already deleted', async () => {
      findFirst.mockResolvedValue(null);
      await expect(
        createProposal({ questionId: 'q1', authorId: 'u1', input: extending }),
      ).rejects.toThrow(/not on this board/);
      expect(create).not.toHaveBeenCalled();
    });

    it('scopes the parent lookup to this question and non-deleted rows', async () => {
      findFirst.mockResolvedValue({ id: 'parent-1' } as never);
      await createProposal({ questionId: 'q1', authorId: 'u1', input: extending });
      expect(findFirst.mock.calls[0]?.[0]?.where).toMatchObject({
        id: 'parent-1',
        questionId: 'q1',
        deletedAt: null,
      });
    });
  });
});

describe('proposalCreate handler', () => {
  // Just enough of a socket to capture the handler and inspect what it acks.
  function fakeSocket(data: { user: { id: string } | null; sessionId: string | null }) {
    const handlers = new Map<string, (payload: unknown, ack: unknown) => void>();
    const socket = {
      data,
      on: (event: string, fn: (payload: unknown, ack: unknown) => void) => {
        handlers.set(event, fn);
      },
    };
    return {
      socket,
      propose: (payload: unknown) =>
        new Promise<{ ok: boolean; code?: string }>((resolve) => {
          handlers.get('proposalCreate')?.(payload, resolve);
        }),
    };
  }

  const io = { to: () => ({ emit: vi.fn() }) };

  function register(data: { user: { id: string } | null; sessionId: string | null }) {
    const harness = fakeSocket(data);
    registerPinboardSocketHandlers(io as never, harness.socket as never);
    return harness;
  }

  it('refuses a socket that has not joined a session', async () => {
    const { propose } = register({ user: null, sessionId: null });
    expect(await propose(STICKY)).toMatchObject({ ok: false, code: 'NOT_IN_SESSION' });
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a socket with a session but no resolved user', async () => {
    const { propose } = register({ user: null, sessionId: 's1' });
    expect(await propose(STICKY)).toMatchObject({ ok: false, code: 'NOT_IN_SESSION' });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a payload whose type contradicts its artifact', async () => {
    activeQuestion.mockResolvedValue(questionRef('discussion'));
    const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
    expect(await propose({ ...STICKY, type: 'drawing' })).toMatchObject({
      ok: false,
      code: 'INVALID_PROPOSAL',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a diagram whose arrow references a missing node', async () => {
    activeQuestion.mockResolvedValue(questionRef('discussion'));
    const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
    expect(
      await propose({
        type: 'diagram',
        artifactJson: {
          type: 'diagram',
          nodes: [{ id: 'n1', label: 'Client', x: 24, y: 24, shape: 'box' }],
          edges: [{ from: 'n1', to: 'missing' }],
        },
        x: 0,
        y: 0,
      }),
    ).toMatchObject({ ok: false, code: 'INVALID_PROPOSAL' });
    expect(create).not.toHaveBeenCalled();
  });

  it('reports a closed board rather than failing silently', async () => {
    activeQuestion.mockResolvedValue(questionRef('voting'));
    question.mockResolvedValue(questionRef('voting'));
    const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
    expect(await propose(STICKY)).toMatchObject({ ok: false, code: 'QUESTION_CLOSED' });
  });

  it('reports a session with no open question', async () => {
    activeQuestion.mockResolvedValue(null);
    const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
    expect(await propose(STICKY)).toMatchObject({ ok: false, code: 'NO_ACTIVE_QUESTION' });
  });

  it('writes with the socket\u2019s user, ignoring any author in the payload', async () => {
    activeQuestion.mockResolvedValue(questionRef('discussion'));
    const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });

    expect(await propose({ ...STICKY, authorId: 'someone-else' })).toMatchObject({ ok: true });
    expect(create.mock.calls[0]?.[0].data).toMatchObject({ authorId: 'u1' });
  });
});
