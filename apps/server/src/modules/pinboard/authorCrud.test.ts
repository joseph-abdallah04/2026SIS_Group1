import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuestionStatus } from '@roundtable/shared';

// F16 - who may edit, move or remove a proposal on the shared board. Prisma and
// the sessions adapter are stubbed so each rule stands on its own; the queries
// themselves are the integration smoke test's job.
vi.mock('../../db.js', () => {
  const prisma = {
    proposal: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      aggregate: vi.fn(),
    },
    $queryRaw: vi.fn(),
    // Runs the callback against the same stubs, so a transaction's queries
    // are observable exactly like any other.
    $transaction: vi.fn(async (run: (tx: unknown) => unknown) => run(prisma)),
  };
  return { prisma };
});

vi.mock('./sessionsAdapter.js', () => ({
  getQuestion: vi.fn(),
  getActiveQuestion: vi.fn(),
  getSession: vi.fn(),
  getDiscussionTimer: vi.fn(),
}));

const { prisma } = await import('../../db.js');
const { getQuestion, getSession } = await import('./sessionsAdapter.js');
const { arrangeProposal, deleteProposal, updateProposal } = await import('./service.js');
const { requireMutableProposal } = await import('./permissions.js');

const findUnique = vi.mocked(prisma.proposal.findUnique);
const update = vi.mocked(prisma.proposal.update);
const aggregate = vi.mocked(prisma.proposal.aggregate);
const findFirst = vi.mocked(prisma.proposal.findFirst);
const updateMany = vi.mocked(prisma.proposal.updateMany);
const queryRaw = vi.mocked(prisma.$queryRaw);
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
    z: 0,
    extendsProposalId: null,
    reactions: [],
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
  session.mockResolvedValue({
    id: 's1',
    title: 'Demo',
    status: 'active',
    leaderId: 'leader-1',
    discussionTimerSeconds: null,
    votingTimerSeconds: null,
  });
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
    expect(update.mock.calls[0]?.[0].data).toMatchObject({
      artifactJson: { type: 'sticky', text: 'Reworded', color: 'blue' },
    });
  });

  // The board shows "edited" from this column, so it has to mean the words
  // changed.
  it('stamps editedAt when the content changes', async () => {
    await updateProposal({ proposalId: 'p1', actor: AUTHOR, input: REWORD });
    expect(update.mock.calls[0]?.[0].data.editedAt).toBeInstanceOf(Date);
  });

  // Dragging a card is not editing it. Marking a move as an edit would put
  // "edited" on a card whose words nobody touched.
  it('leaves editedAt alone when only the position changes', async () => {
    await updateProposal({ proposalId: 'p1', actor: AUTHOR, input: { id: 'p1', x: 40, y: 60 } });
    expect(update.mock.calls[0]?.[0].data).not.toHaveProperty('editedAt');
  });

  // Reopening a proposal and saving it untouched sends back what is stored.
  // Nobody changed a word, so the card must not gain "Edited".
  it('writes nothing for an edit that sends back the stored artifact', async () => {
    const item = await updateProposal({
      proposalId: 'p1',
      actor: AUTHOR,
      // Keys in another order, as Postgres may hand them back.
      input: { id: 'p1', artifactJson: { color: 'yellow', text: 'Hello', type: 'sticky' } },
    });

    expect(update).not.toHaveBeenCalled();
    expect(item).toMatchObject({ id: 'p1', editedAt: null });
  });

  it('treats a missing formatting list and an empty one as the same note', async () => {
    await updateProposal({
      proposalId: 'p1',
      actor: AUTHOR,
      input: {
        id: 'p1',
        artifactJson: { type: 'sticky', text: 'Hello', color: 'yellow', marks: [] },
      },
    });

    expect(update).not.toHaveBeenCalled();
  });

  it('still moves a card whose artifact came back unchanged, without marking it edited', async () => {
    await updateProposal({
      proposalId: 'p1',
      actor: AUTHOR,
      input: {
        id: 'p1',
        x: 90,
        y: 40,
        artifactJson: { type: 'sticky', text: 'Hello', color: 'yellow' },
      },
    });

    expect(update.mock.calls[0]?.[0].data).toEqual({ x: 90, y: 40 });
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

describe('arranging the stack', () => {
  const q = questionRef();
  const someoneElses = { id: 'p1', authorId: 'u1', deletedAt: null };

  it('lets the leader restack any card, their own included', () => {
    const arrange = { mutation: 'arrange', isLeader: true } as const;
    expect(requireMutableProposal(someoneElses, q, LEADER, arrange)).toBe(someoneElses);
    expect(
      requireMutableProposal({ ...someoneElses, authorId: 'leader-1' }, q, LEADER, arrange),
    ).toBeTruthy();
  });

  // Stacking decides what covers what for the whole room, so authorship is not
  // enough: a participant cannot push their own card over everyone else's.
  it('refuses the author, who is not the leader', () => {
    let thrown: unknown;
    try {
      requireMutableProposal(someoneElses, q, AUTHOR, { mutation: 'arrange', isLeader: false });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toMatchObject({ status: 403, code: 'NOT_SESSION_LEADER' });
  });

  it('still hides another session’s proposal rather than confirming it exists', () => {
    expect(() =>
      requireMutableProposal(someoneElses, questionRef('discussion', 'other'), AUTHOR, {
        mutation: 'arrange',
        isLeader: false,
      }),
    ).toThrow(/not found/);
  });

  it('respects the phase lock', () => {
    expect(() =>
      requireMutableProposal(someoneElses, questionRef('voting'), LEADER, {
        mutation: 'arrange',
        isLeader: true,
      }),
    ).toThrow(/the board is closed/);
  });

  describe('arrangeProposal', () => {
    // The order the transaction does things in, so a test can say "locked,
    // then read" rather than only "both happened".
    let steps: string[];

    beforeEach(() => {
      steps = [];
      queryRaw.mockImplementation((async () => {
        steps.push('lock');
        return [{ locked: 1 }];
      }) as never);
      findFirst.mockImplementation((async (args: { include?: unknown }) => {
        steps.push(args.include ? 'read back' : 're-read');
        return row() as never;
      }) as never);
      updateMany.mockImplementation((async () => {
        steps.push('write');
        return { count: 1 };
      }) as never);
      aggregate.mockResolvedValue({ _max: { z: 7 }, _min: { z: -2 } } as never);
    });

    it('brings a card to one above the current top, under the lock', async () => {
      await arrangeProposal({ proposalId: 'p1', actor: LEADER, to: 'front' });

      expect(updateMany.mock.calls[0]?.[0]).toEqual({
        where: { id: 'p1', deletedAt: null },
        data: { z: 8 },
      });
      expect(steps).toEqual(['lock', 're-read', 'write', 'read back']);
      // Measured against the rest of the live board, not the card itself.
      expect(aggregate.mock.calls[0]?.[0]).toMatchObject({
        where: { questionId: 'q1', deletedAt: null, id: { not: 'p1' } },
      });
    });

    it('sends a card to one below the current bottom', async () => {
      await arrangeProposal({ proposalId: 'p1', actor: LEADER, to: 'back' });

      expect(updateMany.mock.calls[0]?.[0].data).toEqual({ z: -3 });
    });

    // The permission check reads the card before the transaction; another
    // leader's tab can move it in between. The decision has to come from the
    // card as it is under the lock.
    it('decides from the card as it is inside the transaction, not the copy read first', async () => {
      findUnique.mockResolvedValue(row({ z: 0 }) as never);
      findFirst.mockImplementation((async () => row({ z: 9 })) as never);

      await expect(
        arrangeProposal({ proposalId: 'p1', actor: LEADER, to: 'front' }),
      ).resolves.toBeNull();
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('returns nothing to announce for a card already alone at that end', async () => {
      findFirst.mockImplementation((async () => row({ z: 9 })) as never);

      await expect(
        arrangeProposal({ proposalId: 'p1', actor: LEADER, to: 'front' }),
      ).resolves.toBeNull();
      expect(updateMany).not.toHaveBeenCalled();
    });

    // A tie is not the top: creation order decides who paints above, so a card
    // sharing the highest value may still be underneath.
    it('still raises a card that only ties the top', async () => {
      findFirst.mockImplementation((async () => row({ z: 7 })) as never);

      await arrangeProposal({ proposalId: 'p1', actor: LEADER, to: 'front' });
      expect(updateMany.mock.calls[0]?.[0].data).toEqual({ z: 8 });
    });

    it('returns nothing to announce when the card is alone on the board', async () => {
      aggregate.mockResolvedValue({ _max: { z: null }, _min: { z: null } } as never);

      await expect(
        arrangeProposal({ proposalId: 'p1', actor: LEADER, to: 'back' }),
      ).resolves.toBeNull();
      expect(updateMany).not.toHaveBeenCalled();
    });

    // Removed between the permission check and the transaction: reporting it
    // as gone, and writing nothing, is what keeps it from coming back.
    it('refuses a card removed before the transaction, and writes nothing', async () => {
      findFirst.mockImplementation((async () => null) as never);

      await expect(
        arrangeProposal({ proposalId: 'p1', actor: LEADER, to: 'front' }),
      ).rejects.toMatchObject({ status: 404, code: 'PROPOSAL_NOT_FOUND' });
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('refuses a card removed between the read and the write', async () => {
      updateMany.mockImplementation((async () => ({ count: 0 })) as never);

      await expect(
        arrangeProposal({ proposalId: 'p1', actor: LEADER, to: 'front' }),
      ).rejects.toMatchObject({ status: 404, code: 'PROPOSAL_NOT_FOUND' });
    });

    it('returns the restacked card as it was written', async () => {
      findFirst.mockImplementation((async (args: { include?: unknown }) =>
        row({ z: args.include ? 8 : 0 })) as never);

      const item = await arrangeProposal({ proposalId: 'p1', actor: LEADER, to: 'front' });
      expect(item?.z).toBe(8);
    });
  });

  it('refuses the author before touching the stack', async () => {
    await expect(
      arrangeProposal({ proposalId: 'p1', actor: AUTHOR, to: 'front' }),
    ).rejects.toMatchObject({ status: 403, code: 'NOT_SESSION_LEADER' });
    expect(queryRaw).not.toHaveBeenCalled();
    expect(aggregate).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });
});
