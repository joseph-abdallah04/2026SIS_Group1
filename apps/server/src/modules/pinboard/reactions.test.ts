import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QUICK_REACTIONS, type QuestionStatus } from '@roundtable/shared';

// F18 - emoji reactions. Prisma and the sessions adapter are stubbed so each
// rule stands on its own; that a real unique index refuses a second identical
// row is the database's job and the integration smoke test's.
vi.mock('../../db.js', () => ({
  prisma: {
    proposal: { findUnique: vi.fn() },
    proposalReaction: {
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock('./sessionsAdapter.js', () => ({
  getQuestion: vi.fn(),
  getActiveQuestion: vi.fn(),
  getSession: vi.fn(),
}));

const { prisma } = await import('../../db.js');
const { getQuestion, getSession } = await import('./sessionsAdapter.js');
const { toBoardItem, toggleReaction } = await import('./service.js');
const { requireMutableProposal } = await import('./permissions.js');
const { registerPinboardSocketHandlers } = await import('./socket.js');

const findUnique = vi.mocked(prisma.proposal.findUnique);
const deleteMany = vi.mocked(prisma.proposalReaction.deleteMany);
const findMine = vi.mocked(prisma.proposalReaction.findUnique);
const upsert = vi.mocked(prisma.proposalReaction.upsert);
const findMany = vi.mocked(prisma.proposalReaction.findMany);
const question = vi.mocked(getQuestion);
const session = vi.mocked(getSession);

const [THUMB, HEART, BULB] = QUICK_REACTIONS;
/** Something only the picker offers, to prove the quick set is not the limit. */
const PARTY = '🎉';

const AUTHOR = { id: 'u1', sessionId: 's1' };
const OTHER = { id: 'u2', sessionId: 's1' };

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
    reactions: [],
    createdAt: new Date('2026-08-31T10:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

/** A rejection shaped like Prisma's "that row already exists". */
function uniqueViolation() {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

beforeEach(() => {
  vi.clearAllMocks();
  findUnique.mockResolvedValue(row() as never);
  deleteMany.mockResolvedValue({ count: 0 } as never);
  findMine.mockResolvedValue(null as never);
  upsert.mockResolvedValue({} as never);
  findMany.mockResolvedValue([] as never);
  question.mockResolvedValue(questionRef());
  session.mockResolvedValue({ id: 's1', title: 'Demo', status: 'active', leaderId: 'leader-1' });
});

describe('who may react', () => {
  const proposal = { id: 'p1', authorId: 'u1', deletedAt: null };
  const react = { mutation: 'react', isLeader: false } as const;

  // The whole point of reactions: they are how the room answers an idea, so
  // the one person who cannot leave one must not be everybody but its author.
  it('lets anyone react to a proposal they did not write', () => {
    expect(requireMutableProposal(proposal, questionRef(), OTHER, react)).toBe(proposal);
  });

  it('lets an author react to their own', () => {
    expect(requireMutableProposal(proposal, questionRef(), AUTHOR, react)).toBe(proposal);
  });

  it('still hides a proposal from a session the actor has not joined', () => {
    let thrown: unknown;
    try {
      requireMutableProposal(proposal, questionRef('discussion', 'other'), OTHER, react);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toMatchObject({ status: 404, code: 'PROPOSAL_NOT_FOUND' });
  });

  it('treats a removed proposal as gone', () => {
    expect(() =>
      requireMutableProposal({ ...proposal, deletedAt: new Date() }, questionRef(), OTHER, react),
    ).toThrow(/not found/);
  });

  // Reactions are not votes, and a tally moving beside a live ballot reads as
  // one.
  it.each(['pending', 'voting', 'answered', 'skipped'] as const)(
    'refuses a reaction while the question is %s',
    (status) => {
      expect(() => requireMutableProposal(proposal, questionRef(status), OTHER, react)).toThrow(
        /the board is closed/,
      );
    },
  );
});

describe('toggleReaction', () => {
  it('leaves a reaction when this person has none', async () => {
    findMany.mockResolvedValue([{ emoji: THUMB, userId: 'u2' }] as never);

    const result = await toggleReaction({ proposalId: 'p1', actor: OTHER, emoji: THUMB });

    expect(upsert).toHaveBeenCalledWith({
      where: { proposalId_userId: { proposalId: 'p1', userId: 'u2' } },
      create: { proposalId: 'p1', userId: 'u2', emoji: THUMB },
      update: { emoji: THUMB },
    });
    expect(deleteMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      proposalId: 'p1',
      questionId: 'q1',
      reactions: [{ emoji: THUMB, userIds: ['u2'] }],
    });
  });

  // Pressing what you already left takes it back, and nothing replaces it.
  it('takes back the reaction they already left', async () => {
    findMine.mockResolvedValue({ emoji: THUMB } as never);

    const result = await toggleReaction({ proposalId: 'p1', actor: OTHER, emoji: THUMB });

    expect(deleteMany).toHaveBeenCalledWith({ where: { proposalId: 'p1', userId: 'u2' } });
    expect(upsert).not.toHaveBeenCalled();
    expect(result.reactions).toEqual([]);
  });

  // One reaction per person per proposal: a second emoji moves yours rather
  // than joining it, because you do not feel two ways about one idea.
  it('moves the reaction when they press a different emoji', async () => {
    findMine.mockResolvedValue({ emoji: THUMB } as never);
    findMany.mockResolvedValue([{ emoji: HEART, userId: 'u2' }] as never);

    const result = await toggleReaction({ proposalId: 'p1', actor: OTHER, emoji: HEART });

    expect(deleteMany).not.toHaveBeenCalled();
    expect(upsert.mock.calls[0]?.[0]).toMatchObject({ update: { emoji: HEART } });
    expect(result.reactions).toEqual([{ emoji: HEART, userIds: ['u2'] }]);
  });

  // Pressing a chip ten times must not count ten: each press either removes
  // the row or puts it back, so the count only ever moves between 0 and 1.
  it('lands on after an odd number of presses and off after an even one', async () => {
    let stored: string | null = null;
    findMine.mockImplementation((async () => (stored ? { emoji: stored } : null)) as never);
    deleteMany.mockImplementation((async () => {
      stored = null;
      return { count: 1 };
    }) as never);
    upsert.mockImplementation((async () => {
      stored = HEART ?? null;
      return {};
    }) as never);
    findMany.mockImplementation((async () =>
      stored ? [{ emoji: stored, userId: 'u2' }] : []) as never);

    for (let press = 1; press <= 5; press += 1) {
      const result = await toggleReaction({ proposalId: 'p1', actor: OTHER, emoji: HEART });
      expect(result.reactions).toEqual(press % 2 === 1 ? [{ emoji: HEART, userIds: ['u2'] }] : []);
    }
  });

  // Two of this person's own tabs pressing at once: the index refuses the
  // second write, and they have a reaction, which is what both presses asked
  // for.
  it('accepts a write that lost a race with an identical one', async () => {
    upsert.mockRejectedValue(uniqueViolation());
    findMany.mockResolvedValue([{ emoji: THUMB, userId: 'u2' }] as never);

    await expect(
      toggleReaction({ proposalId: 'p1', actor: OTHER, emoji: THUMB }),
    ).resolves.toMatchObject({ reactions: [{ emoji: THUMB, userIds: ['u2'] }] });
  });

  it('still reports a write that failed for any other reason', async () => {
    upsert.mockRejectedValue(new Error('connection lost'));

    await expect(toggleReaction({ proposalId: 'p1', actor: OTHER, emoji: THUMB })).rejects.toThrow(
      /connection lost/,
    );
  });

  it('refuses to react on a closed board, touching nothing', async () => {
    question.mockResolvedValue(questionRef('voting'));

    await expect(toggleReaction({ proposalId: 'p1', actor: OTHER, emoji: THUMB })).rejects.toThrow(
      /the board is closed/,
    );
    expect(upsert).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

describe('reactions on a board item', () => {
  it('groups the rows by emoji, keeping everyone who reacted', () => {
    const item = toBoardItem(
      row({
        reactions: [
          { emoji: THUMB, userId: 'u1' },
          { emoji: HEART, userId: 'u2' },
          { emoji: THUMB, userId: 'u3' },
        ],
      }) as never,
    );

    expect(item.reactions).toEqual([
      { emoji: THUMB, userIds: ['u1', 'u3'] },
      { emoji: HEART, userIds: ['u2'] },
    ]);
  });

  // Rows arrive oldest first, so the emoji somebody reached for first comes
  // first. The order is the server's so that an unfamiliar reaction lands in
  // the same place on every board rather than each client inventing one.
  it('emits the groups in the order the emoji first appeared', () => {
    const item = toBoardItem(
      row({
        reactions: [
          { emoji: BULB, userId: 'u1' },
          { emoji: THUMB, userId: 'u1' },
        ],
      }) as never,
    );

    expect(item.reactions.map((group) => group.emoji)).toEqual([BULB, THUMB]);
  });

  // The picker offers hundreds of emoji, and none of them are second-class.
  it('keeps an emoji the card does not offer as a chip', () => {
    const item = toBoardItem(row({ reactions: [{ emoji: PARTY, userId: 'u1' }] }) as never);

    expect(item.reactions).toEqual([{ emoji: PARTY, userIds: ['u1'] }]);
  });

  // Defensive: the write path admits nothing else, and loose text among the
  // chips would be somewhere nobody agreed could be written to.
  it('drops a stored row that is not an emoji at all', () => {
    const item = toBoardItem(
      row({
        reactions: [
          { emoji: 'not an emoji', userId: 'u1' },
          { emoji: THUMB, userId: 'u2' },
        ],
      }) as never,
    );

    expect(item.reactions).toEqual([{ emoji: THUMB, userIds: ['u2'] }]);
  });

  it('leaves a proposal nobody reacted to with an empty list', () => {
    expect(toBoardItem(row() as never).reactions).toEqual([]);
  });
});

describe('proposalReact handler', () => {
  // Just enough of a socket and a server to capture the handler, its ack, and
  // whatever it puts on the room.
  function register(data: { user: { id: string } | null; sessionId: string | null }) {
    const handlers = new Map<string, (payload: unknown, ack: unknown) => void>();
    const socket = {
      data,
      on: (event: string, fn: (payload: unknown, ack: unknown) => void) => {
        handlers.set(event, fn);
      },
    };
    const emit = vi.fn();
    const io = { to: vi.fn(() => ({ emit })) };

    registerPinboardSocketHandlers(io as never, socket as never);

    return {
      io,
      emit,
      react: (payload: unknown): Promise<{ ok: boolean; code?: string }> =>
        new Promise((resolve) => {
          handlers.get('proposalReact')?.(payload, resolve);
        }),
    };
  }

  it('refuses a socket that has not joined a session', async () => {
    const { react } = register({ user: null, sessionId: null });

    expect(await react({ id: 'p1', emoji: THUMB })).toMatchObject({
      ok: false,
      code: 'NOT_IN_SESSION',
    });
    expect(deleteMany).not.toHaveBeenCalled();
  });

  // The quick chips are a shortcut, not the vocabulary: anything the picker
  // offers is equally storable.
  it('accepts an emoji the card does not offer as a chip', async () => {
    findMany.mockResolvedValue([{ emoji: PARTY, userId: 'u2' }] as never);
    const { react } = register({ user: { id: 'u2' }, sessionId: 's1' });

    expect(await react({ id: 'p1', emoji: PARTY })).toMatchObject({ ok: true });
    expect(upsert.mock.calls[0]?.[0]).toMatchObject({
      create: { proposalId: 'p1', userId: 'u2', emoji: PARTY },
    });
  });

  // The column is otherwise a free-text field of fixed width in the middle of
  // every card.
  it.each([
    ['a word', 'nope'],
    ['an emoji with text attached', '🎉 party'],
    ['two emoji at once', '🎉🎉'],
    ['nothing at all', ''],
  ])('refuses %s', async (_case, emoji) => {
    const { react } = register({ user: { id: 'u2' }, sessionId: 's1' });

    expect(await react({ id: 'p1', emoji })).toMatchObject({
      ok: false,
      code: 'INVALID_PROPOSAL',
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('acks the writer and broadcasts the new state to the whole room', async () => {
    findMany.mockResolvedValue([{ emoji: THUMB, userId: 'u2' }] as never);
    const { react, io, emit } = register({ user: { id: 'u2' }, sessionId: 's1' });

    expect(await react({ id: 'p1', emoji: THUMB })).toMatchObject({ ok: true });
    expect(io.to).toHaveBeenCalledWith('session:s1');
    expect(emit).toHaveBeenCalledWith('proposalReactionsUpdated', {
      proposalId: 'p1',
      questionId: 'q1',
      reactions: [{ emoji: THUMB, userIds: ['u2'] }],
    });
  });

  // The reacting user comes from the server's view of the socket, so a client
  // cannot leave a reaction in somebody else's name.
  it('reacts as the socket, whatever the payload claims', async () => {
    const { react } = register({ user: { id: 'u2' }, sessionId: 's1' });

    await react({ id: 'p1', emoji: THUMB, userId: 'someone-else' });

    expect(upsert.mock.calls[0]?.[0]).toMatchObject({
      create: { proposalId: 'p1', userId: 'u2', emoji: THUMB },
    });
  });

  it('reports a refusal on the ack and tells nobody else', async () => {
    question.mockResolvedValue(questionRef('voting'));
    const { react, emit } = register({ user: { id: 'u2' }, sessionId: 's1' });

    expect(await react({ id: 'p1', emoji: THUMB })).toMatchObject({
      ok: false,
      code: 'QUESTION_CLOSED',
    });
    expect(emit).not.toHaveBeenCalled();
  });
});
