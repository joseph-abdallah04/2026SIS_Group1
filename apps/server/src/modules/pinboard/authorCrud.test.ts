import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuestionStatus } from '@roundtable/shared';

// F16 - who may edit, move or remove a proposal on the shared board. Prisma and
// the sessions adapter are stubbed so each rule stands on its own; the queries
// themselves are the integration smoke test's job.
vi.mock('../../db.js', () => ({
  prisma: {
    proposal: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('./sessionsAdapter.js', () => ({
  getQuestion: vi.fn(),
  getActiveQuestion: vi.fn(),
  getSession: vi.fn(),
}));

const { prisma } = await import('../../db.js');
const { getQuestion, getSession } = await import('./sessionsAdapter.js');
const { deleteProposal, updateProposal } = await import('./service.js');
const { requireMutableProposal } = await import('./permissions.js');

const findUnique = vi.mocked(prisma.proposal.findUnique);
const update = vi.mocked(prisma.proposal.update);
const question = vi.mocked(getQuestion);
const session = vi.mocked(getSession);

const AUTHOR = { id: 'u1', sessionId: 's1' };
const LEADER = { id: 'leader-1', sessionId: 's1' };
const STRANGER = { id: 'u2', sessionId: 's1' };

const REWORD = {
  id: 'p1',
  artifactJson: { type: 'sticky', text: 'Reworded', color: 'blue' },
} as Parameters<typeof updateProposal>[0]['input'];

function questionRef(status: QuestionStatus = 'discussion', sessionId = 's1') {
  return { id: 'q1', sessionId, text: 'Q', position: 0, status };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    questionId: 'q1',
    authorId: 'u1',
    author: { displayName: 'Alice' },
    type: 'sticky',
    artifactJson: { type: 'sticky', text: 'Hello', color: 'yellow' },
    x: 10,
    y: 20,
    extendsProposalId: null,
    createdAt: new Date('2026-08-31T10:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findUnique.mockResolvedValue(row() as never);
  update.mockResolvedValue(row() as never);
  question.mockResolvedValue(questionRef());
  session.mockResolvedValue({ id: 's1', title: 'Demo', leaderId: 'leader-1' });
});

describe('requireMutableProposal', () => {
  const q = questionRef();
  const mine = { id: 'p1', authorId: 'u1', deletedAt: null };
  const asAuthor = { mutation: 'edit', isLeader: false } as const;

  it('returns the proposal to its own author on an open board', () => {
    expect(requireMutableProposal(mine, q, AUTHOR, asAuthor)).toBe(mine);
  });

  it('refuses a proposal someone else authored', () => {
    expect(() =>
      requireMutableProposal({ ...mine, authorId: 'someone' }, q, AUTHOR, asAuthor),
    ).toThrow(/Only the author/);
  });

  it('reports a missing proposal as not found', () => {
    expect(() => requireMutableProposal(null, q, AUTHOR, asAuthor)).toThrow(/not found/);
  });

  it('treats an already-deleted proposal as gone, so deleting twice is safe', () => {
    expect(() =>
      requireMutableProposal({ ...mine, deletedAt: new Date() }, q, AUTHOR, asAuthor),
    ).toThrow(/not found/);
  });

  // Knowing an id must not be enough to reach across sessions — and the answer
  // must not confirm the id exists either.
  it('hides a proposal belonging to a session the actor has not joined', () => {
    let thrown: unknown;
    try {
      requireMutableProposal(mine, questionRef('discussion', 'other'), AUTHOR, asAuthor);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toMatchObject({ status: 404, code: 'PROPOSAL_NOT_FOUND' });
  });

  it.each(['pending', 'voting', 'answered', 'skipped'] as const)(
    'locks the board while the question is %s',
    (status) => {
      expect(() => requireMutableProposal(mine, questionRef(status), AUTHOR, asAuthor)).toThrow(
        /the board is closed/,
      );
    },
  );
});

describe('leader moderation', () => {
  const q = questionRef();
  const someoneElses = { id: 'p1', authorId: 'u1', deletedAt: null };

  it('lets the leader move a proposal they did not author', () => {
    expect(
      requireMutableProposal(someoneElses, q, LEADER, { mutation: 'move', isLeader: true }),
    ).toBe(someoneElses);
  });

  it('lets the leader remove a proposal they did not author', () => {
    expect(
      requireMutableProposal(someoneElses, q, LEADER, { mutation: 'delete', isLeader: true }),
    ).toBe(someoneElses);
  });

  // Taking a proposal off the board is moderation; rewriting one puts different
  // words under its author's name.
  it('does not let the leader rewrite someone else’s content', () => {
    expect(() =>
      requireMutableProposal(someoneElses, q, LEADER, { mutation: 'edit', isLeader: true }),
    ).toThrow(/only its author can edit it/);
  });

  it('still refuses a plain member removing someone else’s proposal', () => {
    expect(() =>
      requireMutableProposal(someoneElses, q, STRANGER, { mutation: 'delete', isLeader: false }),
    ).toThrow(/Only the author/);
  });

  it('does not let the leader reach into a session they are not on', () => {
    expect(() =>
      requireMutableProposal(someoneElses, questionRef('discussion', 'other'), LEADER, {
        mutation: 'delete',
        isLeader: true,
      }),
    ).toThrow(/not found/);
  });

  it('still respects the phase lock for the leader', () => {
    expect(() =>
      requireMutableProposal(someoneElses, questionRef('voting'), LEADER, {
        mutation: 'delete',
        isLeader: true,
      }),
    ).toThrow(/the board is closed/);
  });
});

describe('updateProposal', () => {
  it('rewords a proposal for its author', async () => {
    await updateProposal({ proposalId: 'p1', actor: AUTHOR, input: REWORD });
    expect(update.mock.calls[0]?.[0].data).toEqual({
      artifactJson: { type: 'sticky', text: 'Reworded', color: 'blue' },
    });
  });

  it('leaves position alone when only content changes', async () => {
    await updateProposal({ proposalId: 'p1', actor: AUTHOR, input: REWORD });
    const data = update.mock.calls[0]?.[0].data;
    expect(data).not.toHaveProperty('x');
    expect(data).not.toHaveProperty('y');
  });

  it('refuses to turn one kind of artifact into another', async () => {
    await expect(
      updateProposal({
        proposalId: 'p1',
        actor: AUTHOR,
        input: { id: 'p1', artifactJson: { type: 'drawing', svg: '<svg />' } },
      }),
    ).rejects.toThrow(/cannot become a drawing/);
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses an edit by anyone but the author, leader included', async () => {
    for (const actor of [STRANGER, LEADER]) {
      await expect(
        updateProposal({ proposalId: 'p1', actor, input: REWORD }),
      ).rejects.toMatchObject({ status: 403, code: 'NOT_PROPOSAL_AUTHOR' });
    }
    expect(update).not.toHaveBeenCalled();
  });

  it('returns the saved row in board shape, not the client’s input', async () => {
    update.mockResolvedValue(
      row({ artifactJson: { type: 'sticky', text: 'Saved', color: 'blue' } }) as never,
    );
    const item = await updateProposal({ proposalId: 'p1', actor: AUTHOR, input: REWORD });
    expect(item).toMatchObject({ id: 'p1', authorName: 'Alice' });
    expect(item.artifactJson).toEqual({ type: 'sticky', text: 'Saved', color: 'blue' });
  });
});

describe('deleteProposal', () => {
  it('soft-deletes, so reactions, votes and extend-children keep their target', async () => {
    await deleteProposal({ proposalId: 'p1', actor: AUTHOR });
    const data = update.mock.calls[0]?.[0].data as { deletedAt: Date };
    expect(data.deletedAt).toBeInstanceOf(Date);
  });

  it('never issues a hard delete', async () => {
    await deleteProposal({ proposalId: 'p1', actor: AUTHOR });
    expect(prisma.proposal).not.toHaveProperty('delete');
  });

  it('returns the board to address the broadcast at', async () => {
    await expect(deleteProposal({ proposalId: 'p1', actor: AUTHOR })).resolves.toEqual({
      proposalId: 'p1',
      questionId: 'q1',
    });
  });

  it('lets the leader remove someone else’s proposal', async () => {
    await expect(deleteProposal({ proposalId: 'p1', actor: LEADER })).resolves.toEqual({
      proposalId: 'p1',
      questionId: 'q1',
    });
  });

  it('refuses a delete by a plain member who did not author it', async () => {
    await expect(deleteProposal({ proposalId: 'p1', actor: STRANGER })).rejects.toMatchObject({
      status: 403,
      code: 'NOT_PROPOSAL_AUTHOR',
    });
    expect(update).not.toHaveBeenCalled();
  });
});

describe('moving a proposal', () => {
  it('writes only the coordinates, leaving content alone', async () => {
    await updateProposal({ proposalId: 'p1', actor: AUTHOR, input: { id: 'p1', x: 120, y: 64 } });
    const data = update.mock.calls[0]?.[0].data;
    expect(data).toEqual({ x: 120, y: 64 });
    expect(data).not.toHaveProperty('artifactJson');
  });

  it('keeps a coordinate of 0 rather than reading it as "unset"', async () => {
    await updateProposal({ proposalId: 'p1', actor: AUTHOR, input: { id: 'p1', x: 0, y: 0 } });
    expect(update.mock.calls[0]?.[0].data).toEqual({ x: 0, y: 0 });
  });

  it('lets the leader arrange a proposal they did not author', async () => {
    await updateProposal({ proposalId: 'p1', actor: LEADER, input: { id: 'p1', x: 12, y: 34 } });
    expect(update.mock.calls[0]?.[0].data).toEqual({ x: 12, y: 34 });
  });

  it('refuses a plain member moving someone else’s proposal', async () => {
    await expect(
      updateProposal({ proposalId: 'p1', actor: STRANGER, input: { id: 'p1', x: 1, y: 1 } }),
    ).rejects.toMatchObject({ status: 403, code: 'NOT_PROPOSAL_AUTHOR' });
    expect(update).not.toHaveBeenCalled();
  });

  // The stricter rule wins, or a leader could rewrite anything by attaching
  // coordinates to it.
  it('treats a combined move-and-edit as an edit', async () => {
    await expect(
      updateProposal({
        proposalId: 'p1',
        actor: LEADER,
        input: {
          id: 'p1',
          x: 9,
          y: 9,
          artifactJson: { type: 'sticky', text: 'Sneaky', color: 'blue' },
        },
      }),
    ).rejects.toMatchObject({ code: 'NOT_PROPOSAL_AUTHOR' });
    expect(update).not.toHaveBeenCalled();
  });
});
