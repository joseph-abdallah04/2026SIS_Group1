import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addSessionQuestionSchema, createSessionSchema, sessionCodeSchema } from '@roundtable/shared/schemas';

// The transaction shape is the interesting part here, not Prisma itself —
// stubbed so writes can be inspected directly. The actual queries are
// covered by the integration smoke test (docs/05 §10).
const sessionCreate = vi.fn();
const questionCreateMany = vi.fn();
const questionCreate = vi.fn();
const questionDeleteMany = vi.fn();
const questionFindMany = vi.fn();
const sessionMemberCreate = vi.fn();
const sessionFindUnique = vi.fn();
const sessionFindFirst = vi.fn();
const sessionFindMany = vi.fn();
const sessionUpdate = vi.fn();
const sessionUpdateMany = vi.fn();
const sessionUpdateInTx = vi.fn();
const sessionDelete = vi.fn();
const sessionMemberUpsert = vi.fn();
const sessionMemberUpdateMany = vi.fn();
const sessionMemberFindUnique = vi.fn();
const sessionMemberUpdate = vi.fn();
const sessionMemberCount = vi.fn();
const questionFindUnique = vi.fn();
const questionFindFirst = vi.fn();
const questionUpdate = vi.fn();
const questionUpdateMany = vi.fn();
const questionFindManyTopLevel = vi.fn();
const proposalCount = vi.fn();
const votingRoundFindUnique = vi.fn();
const votingRoundDeleteMany = vi.fn();

// The transaction handle exposes the same stubs as the top-level client: the
// guards now run *inside* the transaction that writes (so a draft cannot stop
// being a draft between check and write), and a test asserting on
// `sessionFindUnique` shouldn't have to care which of the two it went through.
// `session.update` is the exception — kept separate so F05's in-transaction
// update can't be confused with F06/F09's standalone one.
const txClient = {
  session: {
    create: sessionCreate,
    update: sessionUpdateInTx,
    findUnique: sessionFindUnique,
    findFirst: sessionFindFirst,
    delete: sessionDelete,
  },
  question: {
    create: questionCreate,
    createMany: questionCreateMany,
    deleteMany: questionDeleteMany,
    findMany: questionFindMany,
    findUnique: questionFindUnique,
    findFirst: questionFindFirst,
    update: questionUpdate,
    updateMany: questionUpdateMany,
  },
  proposal: {
    count: proposalCount,
  },
  votingRound: {
    findUnique: votingRoundFindUnique,
    deleteMany: votingRoundDeleteMany,
  },
  sessionMember: {
    create: sessionMemberCreate,
    findUnique: sessionMemberFindUnique,
    update: sessionMemberUpdate,
    count: sessionMemberCount,
  },
};

vi.mock('../../db.js', () => ({
  prisma: {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(txClient)),
    session: {
      findUnique: sessionFindUnique,
      findFirst: sessionFindFirst,
      findMany: sessionFindMany,
      update: sessionUpdate,
      updateMany: sessionUpdateMany,
      delete: sessionDelete,
    },
    sessionMember: {
      upsert: sessionMemberUpsert,
      updateMany: sessionMemberUpdateMany,
      findUnique: sessionMemberFindUnique,
      update: sessionMemberUpdate,
    },
    question: {
      findMany: questionFindManyTopLevel,
      findUnique: questionFindUnique,
      findFirst: questionFindFirst,
      update: questionUpdate,
    },
    votingRound: { findUnique: votingRoundFindUnique, deleteMany: votingRoundDeleteMany },
  },
}));

vi.mock('../../realtime/types.js', () => ({
  sessionRoom: (id: string) => `session:${id}`,
}));

const {
  assertSessionMember,
  addSessionQuestion,
  createSession,
  deleteSession,
  emitQuestionAdded,
  emitQuestionFocus,
  emitQuestionPhase,
  emitQuestionUpdated,
  emitSessionEnded,
  emitSessionStarted,
  endSession,
  focusQuestion,
  generateSessionCode,
  getActiveQuestion,
  getQuestionInSession,
  setQuestionPhase,
  setQuestionVoting,
  joinSessionByCode,
  leaveSession,
  listSessionsForUser,
  openSessionForJoining,
  resolveSessionByCode,
  setBoardLock,
  emitBoardLock,
  startSession,
  updateSessionDraft,
  getDiscussionTimer,
  findLiveSessionForUser,
} = await import('./service.js');

beforeEach(() => {
  vi.clearAllMocks();
  sessionFindFirst.mockResolvedValue(null);
  sessionCreate.mockResolvedValue({
    id: 's1',
    code: null,
    title: 'Roadmap planning',
    leaderId: 'u1',
    status: 'draft',
    createdAt: new Date('2026-09-03T00:00:00.000Z'),
    endedAt: null,
  });
});

/** One agenda item as the create/edit form submits it (F41: a vote unless told otherwise). */
function q(text: string, votingEnabled = true) {
  return { text, votingEnabled };
}

describe('createSession', () => {
  const input = {
    title: 'Roadmap planning',
    questions: [q('What ships first?'), q('Who owns it?')],
  };

  it('always writes a new session as draft with no code, regardless of what the caller passed', async () => {
    await createSession({ leaderId: 'u1', input });
    expect(sessionCreate.mock.calls[0]?.[0]).toMatchObject({
      data: { title: 'Roadmap planning', leaderId: 'u1', code: null, status: 'draft' },
    });
  });

  it('assigns question position from array order, so reordering client-side is the whole reorder UI', async () => {
    await createSession({ leaderId: 'u1', input });
    expect(questionCreateMany.mock.calls[0]?.[0].data).toEqual([
      { sessionId: 's1', text: 'What ships first?', position: 0, votingEnabled: true },
      { sessionId: 's1', text: 'Who owns it?', position: 1, votingEnabled: true },
    ]);
  });

  it('stores each question\'s vote choice with its row (F41)', async () => {
    await createSession({
      leaderId: 'u1',
      input: { title: 'X', questions: [q('Vote on this'), q('Just ideas', false)] },
    });
    expect(
      questionCreateMany.mock.calls[0]?.[0].data.map(
        (row: { votingEnabled: boolean }) => row.votingEnabled,
      ),
    ).toEqual([true, false]);
  });

  it('preserves order exactly as submitted, even when reversed', async () => {
    await createSession({
      leaderId: 'u1',
      input: { title: 'X', questions: [q('Third'), q('Second'), q('First')] },
    });
    const texts = questionCreateMany.mock.calls[0]?.[0].data.map((q: { text: string }) => q.text);
    expect(texts).toEqual(['Third', 'Second', 'First']);
  });

  it('adds the leader as a session member, so they see their own draft on the dashboard', async () => {
    await createSession({ leaderId: 'u1', input });
    expect(sessionMemberCreate.mock.calls[0]?.[0]).toMatchObject({
      data: { sessionId: 's1', userId: 'u1' },
    });
  });

  it('returns the session created inside the transaction (draft, no code)', async () => {
    const session = await createSession({ leaderId: 'u1', input });
    expect(session).toMatchObject({ id: 's1', status: 'draft', code: null });
  });

  it('stores optional timer durations as seconds, and leaves them null when omitted', async () => {
    await createSession({
      leaderId: 'u1',
      input: { title: 'X', questions: [q('Q')], discussionTimerSeconds: 615, votingTimerSeconds: 75 },
    });
    expect(sessionCreate.mock.calls[0]?.[0].data).toMatchObject({
      discussionTimerSeconds: 615,
      votingTimerSeconds: 75,
    });

    sessionCreate.mockClear();
    await createSession({ leaderId: 'u1', input: { title: 'X', questions: [q('Q')] } });
    expect(sessionCreate.mock.calls[0]?.[0].data).toMatchObject({
      discussionTimerSeconds: null,
      votingTimerSeconds: null,
    });
  });
});

describe('createSessionSchema', () => {
  it('accepts a title and at least one question', () => {
    expect(
      createSessionSchema.safeParse({ title: 'Sprint kickoff', questions: [q('Scope?')] }).success,
    ).toBe(true);
  });

  it('rejects an empty title', () => {
    expect(createSessionSchema.safeParse({ title: '', questions: [q('Scope?')] }).success).toBe(false);
  });

  it('rejects a title that is only whitespace', () => {
    expect(createSessionSchema.safeParse({ title: '   ', questions: [q('Scope?')] }).success).toBe(
      false,
    );
  });

  it('rejects zero questions — a session must have at least one', () => {
    expect(createSessionSchema.safeParse({ title: 'Sprint kickoff', questions: [] }).success).toBe(
      false,
    );
  });

  it('rejects a blank question', () => {
    expect(
      createSessionSchema.safeParse({ title: 'Sprint kickoff', questions: [q('')] }).success,
    ).toBe(false);
  });

  it('rejects a title over 120 characters', () => {
    expect(
      createSessionSchema.safeParse({ title: 'x'.repeat(121), questions: [q('Scope?')] }).success,
    ).toBe(false);
  });

  it('rejects a question over 500 characters', () => {
    expect(
      createSessionSchema.safeParse({ title: 'Sprint kickoff', questions: [q('x'.repeat(501))] })
        .success,
    ).toBe(false);
  });

  it('rejects more than 50 questions', () => {
    expect(
      createSessionSchema.safeParse({
        title: 'Sprint kickoff',
        questions: Array.from({ length: 51 }, (_, i) => q(`Q${i}`)),
      }).success,
    ).toBe(false);
  });

  it('treats a question with no vote choice as a voting question (F41)', () => {
    const parsed = createSessionSchema.safeParse({
      title: 'Sprint kickoff',
      questions: [{ text: 'Scope?' }, { text: 'Ideas?', votingEnabled: false }],
    });
    expect(parsed.data?.questions).toEqual([
      { text: 'Scope?', votingEnabled: true },
      { text: 'Ideas?', votingEnabled: false },
    ]);
  });

  it('rejects a bare string question — each row carries its vote choice', () => {
    expect(
      createSessionSchema.safeParse({ title: 'Sprint kickoff', questions: ['Scope?'] }).success,
    ).toBe(false);
  });

  it('accepts omitted timers so a session can be created without them', () => {
    expect(
      createSessionSchema.safeParse({ title: 'Sprint kickoff', questions: [q('Scope?')] }).success,
    ).toBe(true);
  });

  it('accepts optional timer seconds in 15s steps and rejects zero or off-step values', () => {
    expect(
      createSessionSchema.safeParse({
        title: 'Sprint kickoff',
        questions: [q('Scope?')],
        discussionTimerSeconds: 615,
        votingTimerSeconds: 75,
      }).success,
    ).toBe(true);
    expect(
      createSessionSchema.safeParse({
        title: 'Sprint kickoff',
        questions: [q('Scope?')],
        discussionTimerSeconds: 0,
      }).success,
    ).toBe(false);
    expect(
      createSessionSchema.safeParse({
        title: 'Sprint kickoff',
        questions: [q('Scope?')],
        votingTimerSeconds: 10,
      }).success,
    ).toBe(false);
  });
});

describe('addSessionQuestionSchema', () => {
  it('trims and accepts a non-empty question', () => {
    expect(addSessionQuestionSchema.safeParse({ text: '  What next?  ' }).data).toEqual({
      text: 'What next?',
      votingEnabled: true,
    });
    expect(
      addSessionQuestionSchema.safeParse({ text: 'Ideas?', votingEnabled: false }).data,
    ).toEqual({ text: 'Ideas?', votingEnabled: false });
  });

  it('rejects an empty or whitespace-only question', () => {
    expect(addSessionQuestionSchema.safeParse({ text: '' }).success).toBe(false);
    expect(addSessionQuestionSchema.safeParse({ text: '   ' }).success).toBe(false);
  });
});

describe('generateSessionCode', () => {
  it('always matches the XXXX-XXXX shape validated by sessionCodeSchema', () => {
    for (let i = 0; i < 200; i++) {
      expect(sessionCodeSchema.safeParse(generateSessionCode()).success).toBe(true);
    }
  });

  it('never emits a character outside the unambiguous alphabet (no 0, 1, I, L, O)', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateSessionCode()).not.toMatch(/[01ILO]/);
    }
  });
});

describe('openSessionForJoining', () => {
  const draftSession = {
    id: 's1',
    code: null,
    title: 'Roadmap planning',
    leaderId: 'leader-1',
    status: 'draft',
  };

  it('rejects a caller who is not the leader', async () => {
    sessionFindUnique.mockResolvedValueOnce(draftSession);
    await expect(
      openSessionForJoining({ sessionId: 's1', leaderId: 'not-the-leader' }),
    ).rejects.toMatchObject({ code: 'NOT_SESSION_LEADER' });
    expect(sessionUpdateMany).not.toHaveBeenCalled();
  });

  it('rejects a session that is not draft or lobby', async () => {
    sessionFindUnique.mockResolvedValueOnce({ ...draftSession, status: 'active' });
    await expect(
      openSessionForJoining({ sessionId: 's1', leaderId: 'leader-1' }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    expect(sessionUpdateMany).not.toHaveBeenCalled();
  });

  it('mints exactly one code and flips status to lobby, claiming only while still draft', async () => {
    const opened = { ...draftSession, code: 'K7NP-3WQZ', status: 'lobby' };
    sessionFindUnique.mockResolvedValueOnce(draftSession).mockResolvedValueOnce(opened);
    sessionUpdateMany.mockResolvedValueOnce({ count: 1 });

    const session = await openSessionForJoining({ sessionId: 's1', leaderId: 'leader-1' });

    expect(sessionUpdateMany).toHaveBeenCalledTimes(1);
    expect(sessionUpdateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 's1', status: 'draft' },
      data: { status: 'lobby' },
    });
    expect(sessionUpdate).not.toHaveBeenCalled();
    expect(session.status).toBe('lobby');
    expect(sessionCodeSchema.safeParse(session.code).success).toBe(true);
  });

  it('retries on a P2002 collision and succeeds on the next attempt', async () => {
    const opened = { ...draftSession, code: 'M4T7-2QRX', status: 'lobby' };
    sessionFindUnique.mockResolvedValueOnce(draftSession).mockResolvedValueOnce(opened);
    sessionUpdateMany
      .mockRejectedValueOnce({ code: 'P2002' })
      .mockResolvedValueOnce({ count: 1 });

    const session = await openSessionForJoining({ sessionId: 's1', leaderId: 'leader-1' });

    expect(sessionUpdateMany).toHaveBeenCalledTimes(2);
    expect(session.status).toBe('lobby');
  });

  it('gives up after repeated P2002 collisions with our own error, not a raw Prisma one', async () => {
    sessionFindUnique.mockResolvedValueOnce(draftSession);
    sessionUpdateMany.mockRejectedValue({ code: 'P2002' });

    await expect(
      openSessionForJoining({ sessionId: 's1', leaderId: 'leader-1' }),
    ).rejects.toMatchObject({
      code: 'CODE_ALLOCATION_FAILED',
    });
  });

  it('is a no-op that returns the existing code when already lobby — a double-click is harmless', async () => {
    const lobbySession = { ...draftSession, code: 'K7NP-3WQZ', status: 'lobby' };
    sessionFindUnique.mockResolvedValueOnce(lobbySession);

    const session = await openSessionForJoining({ sessionId: 's1', leaderId: 'leader-1' });

    expect(session).toBe(lobbySession);
    expect(sessionUpdateMany).not.toHaveBeenCalled();
  });

  it('returns the winner\'s code when a concurrent open already left draft — does not mint a second one', async () => {
    const lobbySession = { ...draftSession, code: 'K7NP-3WQZ', status: 'lobby' };
    sessionFindUnique.mockResolvedValueOnce(draftSession).mockResolvedValueOnce(lobbySession);
    sessionUpdateMany.mockResolvedValueOnce({ count: 0 });

    const session = await openSessionForJoining({ sessionId: 's1', leaderId: 'leader-1' });

    expect(session).toBe(lobbySession);
    expect(sessionUpdateMany).toHaveBeenCalledTimes(1);
  });
});

describe('resolveSessionByCode / joinSessionByCode', () => {
  const preview = {
    id: 's1',
    title: 'Roadmap planning',
    status: 'lobby',
    leaderId: 'leader-1',
    _count: { questions: 3 },
  };

  it('normalises lowercase, unhyphenated input before looking the code up', async () => {
    sessionFindUnique.mockResolvedValueOnce(preview);
    await resolveSessionByCode('k7np3wqz');
    expect(sessionFindUnique.mock.calls[0]?.[0]).toMatchObject({ where: { code: 'K7NP-3WQZ' } });
  });

  it('returns null for an unknown code rather than throwing', async () => {
    sessionFindUnique.mockResolvedValueOnce(null);
    expect(await resolveSessionByCode('ZZZZ-ZZZZ')).toBeNull();
  });

  it('joinSessionByCode raises INVALID_CODE for an unknown code', async () => {
    sessionFindUnique.mockResolvedValueOnce(null);
    await expect(joinSessionByCode({ rawCode: 'ZZZZ-ZZZZ', userId: 'u2' })).rejects.toMatchObject({
      code: 'INVALID_CODE',
    });
    expect(sessionMemberUpsert).not.toHaveBeenCalled();
  });

  it('joinSessionByCode upserts membership — joining twice does not duplicate the row', async () => {
    sessionFindUnique.mockResolvedValue(preview);

    await joinSessionByCode({ rawCode: 'K7NP-3WQZ', userId: 'u2' });
    await joinSessionByCode({ rawCode: 'K7NP-3WQZ', userId: 'u2' });

    expect(sessionMemberUpsert).toHaveBeenCalledTimes(2);
    for (const call of sessionMemberUpsert.mock.calls) {
      expect(call[0]).toMatchObject({
        where: { sessionId_userId: { sessionId: 's1', userId: 'u2' } },
        create: { sessionId: 's1', userId: 'u2' },
      });
    }
  });

  it('refuses joining a different live session while already in one', async () => {
    sessionFindUnique.mockResolvedValueOnce(preview);
    sessionFindFirst.mockResolvedValueOnce({ id: 'other', title: 'Already in this' });

    await expect(joinSessionByCode({ rawCode: 'K7NP-3WQZ', userId: 'u2' })).rejects.toMatchObject({
      code: 'ALREADY_IN_SESSION',
    });
    expect(sessionMemberUpsert).not.toHaveBeenCalled();
  });
});

describe('updateSessionDraft / deleteSession (F05)', () => {
  const draftSession = {
    id: 's1',
    code: null,
    title: 'Roadmap planning',
    leaderId: 'leader-1',
    status: 'draft',
  };

  it('rejects a caller who is not the leader', async () => {
    sessionFindUnique.mockResolvedValueOnce(draftSession);
    await expect(
      updateSessionDraft({
        sessionId: 's1',
        leaderId: 'not-the-leader',
        input: { title: 'New title', questions: [q('Q1')] },
      }),
    ).rejects.toMatchObject({ code: 'NOT_SESSION_LEADER' });
    expect(sessionUpdateInTx).not.toHaveBeenCalled();
  });

  it('rejects editing a session that has left draft', async () => {
    sessionFindUnique.mockResolvedValueOnce({ ...draftSession, status: 'lobby' });
    await expect(
      updateSessionDraft({
        sessionId: 's1',
        leaderId: 'leader-1',
        input: { title: 'New title', questions: [q('Q1')] },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    expect(sessionUpdateInTx).not.toHaveBeenCalled();
  });

  it('replaces title and the full question list, reassigning position from array order', async () => {
    sessionFindUnique.mockResolvedValueOnce(draftSession);
    sessionUpdateInTx.mockResolvedValueOnce({ ...draftSession, title: 'New title' });
    questionFindMany.mockResolvedValueOnce([
      { id: 'q1', sessionId: 's1', text: 'First', position: 0 },
      { id: 'q2', sessionId: 's1', text: 'Second', position: 1 },
    ]);

    const result = await updateSessionDraft({
      sessionId: 's1',
      leaderId: 'leader-1',
      input: { title: 'New title', questions: [q('First'), q('Second', false)] },
    });

    expect(sessionUpdateInTx).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: {
        title: 'New title',
        discussionTimerSeconds: null,
        votingTimerSeconds: null,
      },
    });
    expect(questionDeleteMany).toHaveBeenCalledWith({ where: { sessionId: 's1' } });
    expect(questionCreateMany.mock.calls[0]?.[0].data).toEqual([
      { sessionId: 's1', text: 'First', position: 0, votingEnabled: true },
      { sessionId: 's1', text: 'Second', position: 1, votingEnabled: false },
    ]);
    expect(result.title).toBe('New title');
    expect(result.questions).toHaveLength(2);
  });

  it('deleteSession rejects a non-leader and never deletes a draft', async () => {
    sessionFindUnique.mockResolvedValueOnce(draftSession);
    await expect(
      deleteSession({ sessionId: 's1', userId: 'not-the-leader' }),
    ).rejects.toMatchObject({ code: 'NOT_SESSION_LEADER' });
    expect(sessionDelete).not.toHaveBeenCalled();
  });

  it.each(['lobby', 'active'] as const)(
    'deleteSession rejects a live %s session — end it first, do not wipe the room',
    async (status) => {
      sessionFindUnique.mockResolvedValueOnce({ ...draftSession, status });
      await expect(deleteSession({ sessionId: 's1', userId: 'leader-1' })).rejects.toMatchObject({
        code: 'INVALID_TRANSITION',
      });
      expect(sessionDelete).not.toHaveBeenCalled();
    },
  );

  it('deleteSession deletes a draft once the leader guard passes', async () => {
    sessionFindUnique.mockResolvedValueOnce(draftSession);
    await deleteSession({ sessionId: 's1', userId: 'leader-1' });
    expect(sessionDelete).toHaveBeenCalledWith({ where: { id: 's1' } });
  });

  it('deleteSession hides an ended session for that member and does not destroy the row', async () => {
    sessionFindUnique.mockResolvedValueOnce({ ...draftSession, status: 'ended' });
    sessionMemberFindUnique.mockResolvedValueOnce({ id: 'm1' });
    sessionMemberCount.mockResolvedValueOnce(1);
    await deleteSession({ sessionId: 's1', userId: 'u2' });
    expect(sessionDelete).not.toHaveBeenCalled();
    expect(sessionMemberUpdate).toHaveBeenCalledWith({
      where: { sessionId_userId: { sessionId: 's1', userId: 'u2' } },
      data: { hiddenAt: expect.any(Date) },
    });
  });

  it('deleteSession lets the leader hide an ended session without wiping it for others', async () => {
    sessionFindUnique.mockResolvedValueOnce({ ...draftSession, status: 'ended' });
    sessionMemberFindUnique.mockResolvedValueOnce({ id: 'm-leader' });
    sessionMemberCount.mockResolvedValueOnce(2);
    await deleteSession({ sessionId: 's1', userId: 'leader-1' });
    expect(sessionDelete).not.toHaveBeenCalled();
    expect(sessionMemberUpdate).toHaveBeenCalledWith({
      where: { sessionId_userId: { sessionId: 's1', userId: 'leader-1' } },
      data: { hiddenAt: expect.any(Date) },
    });
  });

  it('deleteSession destroys an ended session once the last member has hidden it', async () => {
    sessionFindUnique.mockResolvedValueOnce({ ...draftSession, status: 'ended' });
    sessionMemberFindUnique.mockResolvedValueOnce({ id: 'm-last' });
    sessionMemberCount.mockResolvedValueOnce(0);
    await deleteSession({ sessionId: 's1', userId: 'u2' });
    expect(sessionMemberUpdate).toHaveBeenCalled();
    expect(sessionDelete).toHaveBeenCalledWith({ where: { id: 's1' } });
  });

  it('deleteSession rejects hiding an ended session the caller never joined', async () => {
    sessionFindUnique.mockResolvedValueOnce({ ...draftSession, status: 'ended' });
    sessionMemberFindUnique.mockResolvedValueOnce(null);
    await expect(deleteSession({ sessionId: 's1', userId: 'stranger' })).rejects.toMatchObject({
      code: 'NOT_SESSION_MEMBER',
    });
    expect(sessionMemberUpdate).not.toHaveBeenCalled();
    expect(sessionDelete).not.toHaveBeenCalled();
  });
});

describe('addSessionQuestion', () => {
  const liveSession = {
    id: 's1',
    leaderId: 'leader-1',
    status: 'active',
    _count: { questions: 2 },
  };

  const created = {
    id: 'q3',
    sessionId: 's1',
    text: 'What did we miss?',
    position: 2,
    status: 'pending' as const,
    votingEnabled: true,
    createdAt: new Date('2026-09-10T00:00:00.000Z'),
  };

  it('rejects a caller who is not the leader', async () => {
    sessionFindUnique.mockResolvedValueOnce(liveSession);
    await expect(
      addSessionQuestion({
        sessionId: 's1',
        leaderId: 'someone-else',
        text: 'What did we miss?',
        votingEnabled: true,
      }),
    ).rejects.toMatchObject({ code: 'NOT_SESSION_LEADER' });
    expect(questionCreate).not.toHaveBeenCalled();
  });

  it.each(['draft', 'ended'] as const)('refuses to add a question while the session is %s', async (status) => {
    sessionFindUnique.mockResolvedValueOnce({ ...liveSession, status });
    await expect(
      addSessionQuestion({
        sessionId: 's1',
        leaderId: 'leader-1',
        text: 'What did we miss?',
        votingEnabled: true,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    expect(questionCreate).not.toHaveBeenCalled();
  });

  it('appends after the current last position as pending', async () => {
    sessionFindUnique.mockResolvedValueOnce(liveSession);
    questionFindFirst.mockResolvedValueOnce({ position: 1 });
    questionCreate.mockResolvedValueOnce(created);

    await expect(
      addSessionQuestion({
        sessionId: 's1',
        leaderId: 'leader-1',
        text: 'What did we miss?',
        votingEnabled: true,
      }),
    ).resolves.toMatchObject({ id: 'q3', position: 2, status: 'pending' });

    expect(questionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          sessionId: 's1',
          text: 'What did we miss?',
          position: 2,
          status: 'pending',
          votingEnabled: true,
        },
      }),
    );
  });

  it('appends a brainstorm-only question when the leader turns its vote off (F41)', async () => {
    sessionFindUnique.mockResolvedValueOnce(liveSession);
    questionFindFirst.mockResolvedValueOnce({ position: 1 });
    questionCreate.mockResolvedValueOnce({ ...created, votingEnabled: false });

    await addSessionQuestion({
      sessionId: 's1',
      leaderId: 'leader-1',
      text: 'What did we miss?',
      votingEnabled: false,
    });

    expect(questionCreate.mock.calls[0]?.[0].data).toMatchObject({ votingEnabled: false });
  });

  it('also appends while the session is still in the lobby', async () => {
    sessionFindUnique.mockResolvedValueOnce({ ...liveSession, status: 'lobby' });
    questionFindFirst.mockResolvedValueOnce({ position: 1 });
    questionCreate.mockResolvedValueOnce(created);

    await expect(
      addSessionQuestion({
        sessionId: 's1',
        leaderId: 'leader-1',
        text: 'What did we miss?',
        votingEnabled: true,
      }),
    ).resolves.toMatchObject({ id: 'q3' });
    expect(questionCreate).toHaveBeenCalled();
  });

  it('refuses a 51st question', async () => {
    sessionFindUnique.mockResolvedValueOnce({ ...liveSession, _count: { questions: 50 } });
    await expect(
      addSessionQuestion({
        sessionId: 's1',
        leaderId: 'leader-1',
        text: 'One more',
        votingEnabled: true,
      }),
    ).rejects.toMatchObject({ code: 'AGENDA_FULL' });
    expect(questionCreate).not.toHaveBeenCalled();
  });

  it('emitQuestionAdded broadcasts the new row to the session room', () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const io = { to } as unknown as Parameters<typeof emitQuestionAdded>[0];

    emitQuestionAdded(io, created);

    expect(to).toHaveBeenCalledWith('session:s1');
    expect(emit).toHaveBeenCalledWith('questionAdded', {
      sessionId: 's1',
      question: created,
    });
  });
});

describe('setQuestionVoting (F41)', () => {
  const liveSession = { leaderId: 'leader-1', status: 'active' };

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: 'q2',
      sessionId: 's1',
      text: 'What else?',
      position: 1,
      status: 'pending' as const,
      votingEnabled: true,
      createdAt: new Date('2026-09-10T00:00:00.000Z'),
      ...overrides,
    };
  }

  function turnOff(overrides: Partial<Parameters<typeof setQuestionVoting>[0]> = {}) {
    return setQuestionVoting({
      sessionId: 's1',
      questionId: 'q2',
      leaderId: 'leader-1',
      votingEnabled: false,
      ...overrides,
    });
  }

  /** The row as this request reads it, then as it reads back after its write. */
  function givenRows(before: ReturnType<typeof row>, after: ReturnType<typeof row>) {
    questionFindUnique.mockResolvedValueOnce(before).mockResolvedValueOnce(after);
  }

  it('turns a pending question into a brainstorm', async () => {
    sessionFindUnique.mockResolvedValueOnce(liveSession);
    givenRows(row(), row({ votingEnabled: false }));
    questionUpdateMany.mockResolvedValueOnce({ count: 1 });

    await expect(turnOff()).resolves.toMatchObject({ id: 'q2', votingEnabled: false });
    expect(questionUpdateMany).toHaveBeenCalledWith({
      where: { id: 'q2', status: { in: ['pending', 'discussion'] }, votingEnabled: true },
      data: { votingEnabled: false },
    });
  });

  it('can turn the vote back on while the question is in discussion', async () => {
    sessionFindUnique.mockResolvedValueOnce(liveSession);
    givenRows(row({ status: 'discussion', votingEnabled: false }), row({ status: 'discussion' }));
    questionUpdateMany.mockResolvedValueOnce({ count: 1 });

    await expect(turnOff({ votingEnabled: true })).resolves.toMatchObject({ votingEnabled: true });
    expect(questionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ votingEnabled: false }) }),
    );
  });

  it('also works in the lobby, before the session starts', async () => {
    sessionFindUnique.mockResolvedValueOnce({ ...liveSession, status: 'lobby' });
    givenRows(row(), row({ votingEnabled: false }));
    questionUpdateMany.mockResolvedValueOnce({ count: 1 });

    await expect(turnOff()).resolves.toMatchObject({ votingEnabled: false });
  });

  it('is a no-op when the question already has that setting', async () => {
    sessionFindUnique.mockResolvedValueOnce(liveSession);
    questionFindUnique.mockResolvedValueOnce(row({ status: 'answered', votingEnabled: false }));

    await expect(turnOff()).resolves.toMatchObject({ votingEnabled: false });
    expect(questionUpdateMany).not.toHaveBeenCalled();
  });

  it('rejects a caller who is not the leader', async () => {
    sessionFindUnique.mockResolvedValueOnce(liveSession);
    await expect(turnOff({ leaderId: 'someone-else' })).rejects.toMatchObject({
      code: 'NOT_SESSION_LEADER',
    });
    expect(questionUpdateMany).not.toHaveBeenCalled();
  });

  it.each(['draft', 'ended'] as const)('refuses while the session is %s', async (status) => {
    sessionFindUnique.mockResolvedValueOnce({ ...liveSession, status });
    await expect(turnOff()).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    expect(questionUpdateMany).not.toHaveBeenCalled();
  });

  it('refuses a question from another session', async () => {
    sessionFindUnique.mockResolvedValueOnce(liveSession);
    questionFindUnique.mockResolvedValueOnce(row({ sessionId: 'other' }));
    await expect(turnOff()).rejects.toMatchObject({ code: 'QUESTION_NOT_FOUND' });
    expect(questionUpdateMany).not.toHaveBeenCalled();
  });

  it.each(['voting', 'answered', 'skipped'] as const)(
    'locks the choice once the question is %s',
    async (status) => {
      sessionFindUnique.mockResolvedValueOnce(liveSession);
      questionFindUnique.mockResolvedValueOnce(row({ status }));
      await expect(turnOff()).rejects.toMatchObject({ code: 'QUESTION_VOTING_LOCKED' });
      expect(questionUpdateMany).not.toHaveBeenCalled();
    },
  );

  // The write only lands while nothing has moved the question on since the
  // check: "Open voting" or "Finish discussion" committing in between makes it
  // miss, and that is a refusal rather than a vote switched under a vote.
  it.each(['voting', 'answered'] as const)(
    'backs off when the question became %s between the check and the write',
    async (status) => {
      sessionFindUnique.mockResolvedValueOnce(liveSession);
      givenRows(row({ status: 'discussion' }), row({ status }));
      questionUpdateMany.mockResolvedValueOnce({ count: 0 });

      await expect(turnOff()).rejects.toMatchObject({ code: 'QUESTION_VOTING_LOCKED' });
    },
  );

  it('treats the same switch landing first from elsewhere as a no-op', async () => {
    sessionFindUnique.mockResolvedValueOnce(liveSession);
    givenRows(row({ status: 'discussion' }), row({ status: 'discussion', votingEnabled: false }));
    questionUpdateMany.mockResolvedValueOnce({ count: 0 });

    await expect(turnOff()).resolves.toMatchObject({ votingEnabled: false });
  });

  it('emitQuestionUpdated broadcasts the row to the session room', () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const io = { to } as unknown as Parameters<typeof emitQuestionUpdated>[0];
    const question = row({ votingEnabled: false });

    emitQuestionUpdated(io, question);

    expect(to).toHaveBeenCalledWith('session:s1');
    expect(emit).toHaveBeenCalledWith('questionUpdated', { sessionId: 's1', question });
  });
});

describe('startSession (F09)', () => {
  const lobbySession = {
    id: 's1',
    code: 'K7NP-3WQZ',
    title: 'Roadmap planning',
    leaderId: 'leader-1',
    status: 'lobby',
  };

  // The write moved inside a transaction when F25 made starting also open the
  // first question, so these assert on `sessionUpdateInTx`, not `sessionUpdate`.
  beforeEach(() => {
    questionFindFirst.mockResolvedValue(null);
    sessionUpdateInTx.mockResolvedValue({
      ...lobbySession,
      status: 'active',
      startedAt: new Date('2026-09-04T00:00:00.000Z'),
    });
  });

  it('rejects a caller who is not the leader', async () => {
    sessionFindUnique.mockResolvedValueOnce(lobbySession);
    await expect(
      startSession({ sessionId: 's1', leaderId: 'not-the-leader' }),
    ).rejects.toMatchObject({
      code: 'NOT_SESSION_LEADER',
    });
    expect(sessionUpdateInTx).not.toHaveBeenCalled();
  });

  it('rejects starting a session that is not lobby', async () => {
    sessionFindUnique.mockResolvedValueOnce({ ...lobbySession, status: 'draft' });
    await expect(startSession({ sessionId: 's1', leaderId: 'leader-1' })).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });
    expect(sessionUpdateInTx).not.toHaveBeenCalled();
  });

  it('flips status to active and records startedAt', async () => {
    sessionFindUnique.mockResolvedValueOnce(lobbySession);

    const session = await startSession({ sessionId: 's1', leaderId: 'leader-1' });

    expect(sessionUpdateInTx).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { status: 'active', startedAt: expect.any(Date), currentQuestionId: null },
    });
    expect(session.status).toBe('active');
  });

  // F25: without this the board is live but closed to proposals, which reads
  // as broken rather than as "waiting for the leader".
  it('opens the first pending question into discussion', async () => {
    sessionFindUnique.mockResolvedValueOnce(lobbySession);
    questionFindFirst.mockResolvedValueOnce({ id: 'q1' });

    await startSession({ sessionId: 's1', leaderId: 'leader-1' });

    expect(questionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: 's1', status: 'pending' },
        orderBy: { position: 'asc' },
      }),
    );
    expect(questionUpdate).toHaveBeenCalledWith({
      where: { id: 'q1' },
      data: { status: 'discussion', discussionStartedAt: expect.any(Date) },
    });
    expect(sessionUpdateInTx).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { status: 'active', startedAt: expect.any(Date), currentQuestionId: 'q1' },
    });
  });

  it('still starts a session whose questions are somehow all non-pending', async () => {
    sessionFindUnique.mockResolvedValueOnce(lobbySession);
    questionFindFirst.mockResolvedValueOnce(null);

    const session = await startSession({ sessionId: 's1', leaderId: 'leader-1' });

    expect(session.status).toBe('active');
    expect(questionUpdate).not.toHaveBeenCalled();
  });

  it('is a no-op that returns the existing session when already active', async () => {
    const activeSession = { ...lobbySession, status: 'active', startedAt: new Date() };
    sessionFindUnique.mockResolvedValueOnce(activeSession);

    const session = await startSession({ sessionId: 's1', leaderId: 'leader-1' });

    expect(session).toBe(activeSession);
    expect(sessionUpdateInTx).not.toHaveBeenCalled();
    // Re-starting must not re-open question 1 either: by the time a leader
    // double-clicks, the agenda may have moved on to question 3.
    expect(questionUpdate).not.toHaveBeenCalled();
  });

  it('emitSessionStarted broadcasts sessionStarted to the session room, including the leader', async () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const io = { to } as unknown as Parameters<typeof emitSessionStarted>[0];

    emitSessionStarted(io, {
      id: 's1',
      code: 'K7NP-3WQZ',
      title: 'Roadmap planning',
      leaderId: 'leader-1',
      status: 'active',
      createdAt: new Date(),
      startedAt: new Date('2026-09-04T00:00:00.000Z'),
      endedAt: null,
      discussionTimerSeconds: null,
      votingTimerSeconds: null,
    });

    expect(to).toHaveBeenCalledWith('session:s1');
    expect(emit).toHaveBeenCalledWith('sessionStarted', {
      sessionId: 's1',
      startedAt: '2026-09-04T00:00:00.000Z',
    });
  });

  it('emitSessionStarted throws on a session with no startedAt instead of silently not broadcasting', () => {
    const io = { to: vi.fn(() => ({ emit: vi.fn() })) } as unknown as Parameters<
      typeof emitSessionStarted
    >[0];

    expect(() =>
      emitSessionStarted(io, {
        id: 's1',
        code: 'K7NP-3WQZ',
        title: 'Roadmap planning',
        leaderId: 'leader-1',
        status: 'lobby',
        createdAt: new Date(),
        startedAt: null,
        endedAt: null,
        discussionTimerSeconds: null,
        votingTimerSeconds: null,
      }),
    ).toThrow(/startedAt/);
  });
});

describe('endSession (F32)', () => {
  const activeSession = {
    id: 's1',
    code: 'K7NP-3WQZ',
    title: 'Roadmap planning',
    leaderId: 'leader-1',
    // `as const` so the emit tests below can spread this into a real `Session`
    // without `status` widening to `string`.
    status: 'active' as const,
  };

  it('rejects a participant trying to end someone else\u2019s session', async () => {
    sessionFindUnique.mockResolvedValueOnce(activeSession);
    await expect(endSession({ sessionId: 's1', leaderId: 'u2' })).rejects.toMatchObject({
      code: 'NOT_SESSION_LEADER',
    });
    expect(sessionUpdate).not.toHaveBeenCalled();
  });

  it('records endedAt and releases the code, so the code stops being joinable', async () => {
    sessionFindUnique.mockResolvedValueOnce(activeSession);
    sessionUpdate.mockResolvedValueOnce({
      ...activeSession,
      status: 'ended',
      code: null,
      endedAt: new Date('2026-09-04T05:00:00.000Z'),
    });

    const session = await endSession({ sessionId: 's1', leaderId: 'leader-1' });

    expect(sessionUpdate).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { status: 'ended', endedAt: expect.any(Date), code: null },
    });
    expect(session).toMatchObject({ status: 'ended', code: null });
  });

  // The leader is locked into a lobby exactly as much as a live session, so
  // refusing here would strand whoever opens a session and changes their mind.
  it('can end from lobby too, not just active', async () => {
    sessionFindUnique.mockResolvedValueOnce({ ...activeSession, status: 'lobby' });
    sessionUpdate.mockResolvedValueOnce({ ...activeSession, status: 'ended', code: null });

    await expect(endSession({ sessionId: 's1', leaderId: 'leader-1' })).resolves.toMatchObject({
      status: 'ended',
    });
  });

  it('refuses to end a draft — there is nothing to end, and F05 delete is the way out', async () => {
    sessionFindUnique.mockResolvedValueOnce({ ...activeSession, status: 'draft', code: null });
    await expect(endSession({ sessionId: 's1', leaderId: 'leader-1' })).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });
    expect(sessionUpdate).not.toHaveBeenCalled();
  });

  it('is a no-op when already ended, so a double-click is not an error', async () => {
    const endedSession = { ...activeSession, status: 'ended', code: null, endedAt: new Date() };
    sessionFindUnique.mockResolvedValueOnce(endedSession);

    const session = await endSession({ sessionId: 's1', leaderId: 'leader-1' });

    expect(session).toBe(endedSession);
    expect(sessionUpdate).not.toHaveBeenCalled();
  });

  it('raises SESSION_NOT_FOUND for an unknown session', async () => {
    sessionFindUnique.mockResolvedValueOnce(null);
    await expect(endSession({ sessionId: 'missing', leaderId: 'leader-1' })).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
    });
  });

  it('leaves member rows untouched — who was present at the end is what F31 summarises', async () => {
    sessionFindUnique.mockResolvedValueOnce(activeSession);
    sessionUpdate.mockResolvedValueOnce({ ...activeSession, status: 'ended', endedAt: new Date() });

    await endSession({ sessionId: 's1', leaderId: 'leader-1' });

    expect(sessionMemberUpdateMany).not.toHaveBeenCalled();
  });

  it('emitSessionEnded broadcasts to the session room', () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const io = { to } as unknown as Parameters<typeof emitSessionEnded>[0];

    emitSessionEnded(io, {
      ...activeSession,
      code: null,
      status: 'ended',
      createdAt: new Date(),
      startedAt: new Date('2026-09-04T00:00:00.000Z'),
      endedAt: new Date('2026-09-04T05:00:00.000Z'),
      discussionTimerSeconds: null,
      votingTimerSeconds: null,
    });

    expect(to).toHaveBeenCalledWith('session:s1');
    expect(emit).toHaveBeenCalledWith('sessionEnded', {
      sessionId: 's1',
      endedAt: '2026-09-04T05:00:00.000Z',
    });
  });

  it('emitSessionEnded throws on a session with no endedAt instead of silently not broadcasting', () => {
    const io = { to: vi.fn(() => ({ emit: vi.fn() })) } as unknown as Parameters<
      typeof emitSessionEnded
    >[0];

    expect(() =>
      emitSessionEnded(io, {
        ...activeSession,
        createdAt: new Date(),
        startedAt: new Date(),
        endedAt: null,
        discussionTimerSeconds: null,
        votingTimerSeconds: null,
      }),
    ).toThrow(/endedAt/);
  });
});

describe('leaveSession (F07)', () => {
  const liveSession = { leaderId: 'leader-1', status: 'active' };

  it('refuses the leader — they must end the session instead', async () => {
    sessionFindUnique.mockResolvedValueOnce(liveSession);
    await expect(leaveSession({ sessionId: 's1', userId: 'leader-1' })).rejects.toMatchObject({
      code: 'LEADER_CANNOT_LEAVE',
    });
    expect(sessionMemberUpdateMany).not.toHaveBeenCalled();
  });

  it('stamps leftAt rather than deleting the row — this table is history (docs/02 §4)', async () => {
    sessionFindUnique.mockResolvedValueOnce(liveSession);
    await leaveSession({ sessionId: 's1', userId: 'u2' });

    const call = sessionMemberUpdateMany.mock.calls[0]?.[0];
    expect(call.where).toEqual({ sessionId: 's1', userId: 'u2', leftAt: null });
    expect(call.data.leftAt).toBeInstanceOf(Date);
  });

  it('is idempotent: the leftAt: null filter makes a second leave affect no rows', async () => {
    sessionFindUnique.mockResolvedValue(liveSession);
    await leaveSession({ sessionId: 's1', userId: 'u2' });
    await leaveSession({ sessionId: 's1', userId: 'u2' });

    for (const [args] of sessionMemberUpdateMany.mock.calls) {
      expect(args.where).toMatchObject({ leftAt: null });
    }
  });

  it('refuses leaving an ended session — that would edit history for no gain', async () => {
    sessionFindUnique.mockResolvedValueOnce({ leaderId: 'leader-1', status: 'ended' });
    await expect(leaveSession({ sessionId: 's1', userId: 'u2' })).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });
    expect(sessionMemberUpdateMany).not.toHaveBeenCalled();
  });

  it('raises SESSION_NOT_FOUND for an unknown session', async () => {
    sessionFindUnique.mockResolvedValueOnce(null);
    await expect(leaveSession({ sessionId: 'missing', userId: 'u2' })).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
    });
  });
});

describe('leftAt semantics', () => {
  it('the one-live-session guard ignores sessions the user has left', async () => {
    await createSession({ leaderId: 'u1', input: { title: 'X', questions: [q('Q')] } });
    expect(sessionFindFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { members: { some: { userId: 'u1', leftAt: null } } },
    });
  });

  it('rejoining clears leftAt but keeps the original joinedAt', async () => {
    sessionFindUnique.mockResolvedValueOnce({
      id: 's1',
      title: 'Roadmap planning',
      status: 'lobby',
      leaderId: 'leader-1',
      _count: { questions: 1 },
    });

    await joinSessionByCode({ rawCode: 'K7NP-3WQZ', userId: 'u2' });

    const call = sessionMemberUpsert.mock.calls[0]?.[0];
    expect(call.update).toEqual({ leftAt: null });
    expect(call.create).not.toHaveProperty('joinedAt');
  });

  it('listSessionsForUser reports a left session as history, not as current', async () => {
    sessionFindMany.mockResolvedValueOnce([
      {
        id: 'still-in',
        code: 'K7NP-3WQZ',
        title: 'Still in',
        status: 'active',
        createdAt: new Date(),
        leaderId: 'someone',
        members: [{ leftAt: null }],
      },
      {
        id: 'walked-out',
        code: 'M4T7-2QRX',
        title: 'Walked out',
        status: 'active',
        createdAt: new Date(),
        leaderId: 'someone',
        members: [{ leftAt: new Date() }],
      },
    ]);

    const sessions = await listSessionsForUser('u2');

    // The dashboard redirect keys off this: `false` is what stops it hauling
    // someone back into the session they just left.
    expect(sessions.map((s) => s.isCurrentMember)).toEqual([true, false]);
  });

  it('listSessionsForUser omits sessions the caller has hidden from their dashboard', async () => {
    sessionFindMany.mockResolvedValueOnce([]);
    await listSessionsForUser('u2');
    expect(sessionFindMany.mock.calls[0]?.[0].where.AND).toEqual(
      expect.arrayContaining([
        { NOT: { members: { some: { userId: 'u2', hiddenAt: { not: null } } } } },
      ]),
    );
  });
});

describe('assertSessionMember', () => {
  it('rejects a non-member — a session id is not authorisation to read a session', async () => {
    sessionMemberFindUnique.mockResolvedValueOnce(null);
    await expect(assertSessionMember('s1', 'stranger')).rejects.toMatchObject({
      code: 'NOT_SESSION_MEMBER',
    });
  });

  it('passes a member, including one who has since left, so their history stays readable', async () => {
    sessionMemberFindUnique.mockResolvedValueOnce({ id: 'm1' });
    await expect(assertSessionMember('s1', 'u2')).resolves.toBeUndefined();
    expect(sessionMemberFindUnique.mock.calls[0]?.[0].where).toEqual({
      sessionId_userId: { sessionId: 's1', userId: 'u2' },
    });
  });
});

describe('setQuestionPhase (F25/F26)', () => {
  const activeSession = { leaderId: 'leader-1', status: 'active' as const };

  function question(overrides: Partial<QuestionRow> = {}): QuestionRow {
    return {
      id: 'q1',
      sessionId: 's1',
      text: 'What ships first?',
      position: 0,
      status: 'pending',
      boardLocked: true,
      votingEnabled: true,
      ...overrides,
    };
  }

  interface QuestionRow {
    id: string;
    sessionId: string;
    text: string;
    position: number;
    status: 'pending' | 'discussion' | 'voting' | 'answered' | 'skipped';
    boardLocked: boolean;
    votingEnabled: boolean;
  }

  function advance(status: QuestionRow['status'], leaderId = 'leader-1') {
    return setQuestionPhase({ sessionId: 's1', questionId: 'q1', leaderId, status });
  }

  beforeEach(() => {
    sessionFindUnique.mockResolvedValue(activeSession);
    questionFindFirst.mockResolvedValue(null);
    proposalCount.mockResolvedValue(2);
    votingRoundFindUnique.mockResolvedValue(null);
    votingRoundDeleteMany.mockResolvedValue({ count: 0 });
    questionUpdateMany.mockResolvedValue({ count: 1 });
  });

  it('rejects a caller who is not the leader — the agenda is the leader’s control', async () => {
    questionFindUnique.mockResolvedValue(question());
    await expect(advance('discussion', 'someone-else')).rejects.toMatchObject({
      code: 'NOT_SESSION_LEADER',
    });
    expect(questionUpdateMany).not.toHaveBeenCalled();
  });

  it.each(['draft', 'lobby', 'ended'] as const)(
    'refuses to move the agenda while the session is %s',
    async (status) => {
      sessionFindUnique.mockResolvedValue({ ...activeSession, status });
      questionFindUnique.mockResolvedValue(question());
      await expect(advance('discussion')).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
      expect(questionUpdateMany).not.toHaveBeenCalled();
    },
  );

  it('refuses a question that belongs to another session', async () => {
    questionFindUnique.mockResolvedValue(question({ sessionId: 'other-session' }));
    await expect(advance('discussion')).rejects.toMatchObject({ code: 'QUESTION_NOT_FOUND' });
    expect(questionUpdateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['pending', 'discussion'],
    ['pending', 'skipped'],
    ['discussion', 'voting'],
    ['discussion', 'skipped'],
    ['voting', 'discussion'],
    ['voting', 'answered'],
    ['voting', 'skipped'],
  ] as const)('allows %s -> %s', async (from, to) => {
    questionFindUnique.mockResolvedValue(question({ status: from }));
    await expect(advance(to)).resolves.toMatchObject({ status: to });
    // Conditional on the row as read, so a concurrent change makes it miss.
    expect(questionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'q1', status: from, votingEnabled: true },
        data: expect.objectContaining({ status: to }),
      }),
    );
  });

  // F41: the vote switch can commit between this request's checks and its
  // write. The write is conditional on the status and vote choice it read, so
  // it misses, and that is a conflict — not a vote opened on a brainstorm.
  describe('when the question changes between the checks and the write', () => {
    it('refuses to open voting on a question whose vote was just turned off', async () => {
      questionFindUnique
        .mockResolvedValueOnce(question({ status: 'discussion' }))
        .mockResolvedValueOnce(question({ status: 'discussion', votingEnabled: false }));
      questionUpdateMany.mockResolvedValueOnce({ count: 0 });

      await expect(advance('voting')).rejects.toMatchObject({ code: 'QUESTION_CHANGED' });
      expect(sessionUpdateInTx).not.toHaveBeenCalled();
    });

    it('refuses to finish a brainstorm whose vote was just turned back on', async () => {
      questionFindUnique
        .mockResolvedValueOnce(question({ status: 'discussion', votingEnabled: false }))
        .mockResolvedValueOnce(question({ status: 'discussion' }));
      questionUpdateMany.mockResolvedValueOnce({ count: 0 });

      await expect(advance('answered')).rejects.toMatchObject({ code: 'QUESTION_CHANGED' });
    });

    it('treats the same move landing first from elsewhere as a no-op', async () => {
      questionFindUnique
        .mockResolvedValueOnce(question({ status: 'discussion', votingEnabled: false }))
        .mockResolvedValueOnce(question({ status: 'answered', votingEnabled: false }));
      questionUpdateMany.mockResolvedValueOnce({ count: 0 });

      await expect(advance('answered')).resolves.toMatchObject({ status: 'answered' });
      expect(sessionUpdateInTx).not.toHaveBeenCalled();
    });
  });

  it.each([
    // Answering is how a vote closes (F30); a leader moving on without one
    // skips, which records that nobody chose rather than inventing a choice.
    ['pending', 'voting'],
    ['pending', 'answered'],
    ['discussion', 'answered'],
    // Terminal states stay terminal — the agenda only moves forward.
    ['answered', 'discussion'],
    ['answered', 'voting'],
    ['skipped', 'discussion'],
  ] as const)('refuses %s -> %s', async (from, to) => {
    questionFindUnique.mockResolvedValue(question({ status: from }));
    await expect(advance(to)).rejects.toMatchObject({ code: 'INVALID_PHASE_TRANSITION' });
    expect(questionUpdateMany).not.toHaveBeenCalled();
  });

  describe('a brainstorm-only question (F41)', () => {
    const brainstorm = (status: QuestionRow['status']) =>
      question({ status, votingEnabled: false });

    it.each([
      ['pending', 'discussion'],
      ['pending', 'skipped'],
      // The board is the answer: finishing the discussion is how it closes.
      ['discussion', 'answered'],
      ['discussion', 'skipped'],
    ] as const)('allows %s -> %s', async (from, to) => {
      questionFindUnique.mockResolvedValue(brainstorm(from));
      await expect(advance(to)).resolves.toMatchObject({ status: to });
    });

    it('refuses to open voting, with a code the leader can act on', async () => {
      questionFindUnique.mockResolvedValue(brainstorm('discussion'));
      await expect(advance('voting')).rejects.toMatchObject({ code: 'VOTING_DISABLED' });
      expect(questionUpdateMany).not.toHaveBeenCalled();
    });

    it('needs no minimum number of ideas to finish', async () => {
      proposalCount.mockResolvedValue(0);
      questionFindUnique.mockResolvedValue(brainstorm('discussion'));
      await expect(advance('answered')).resolves.toMatchObject({ status: 'answered' });
    });

    it.each([
      ['pending', 'answered'],
      ['answered', 'discussion'],
      ['skipped', 'discussion'],
    ] as const)('refuses %s -> %s', async (from, to) => {
      questionFindUnique.mockResolvedValue(brainstorm(from));
      await expect(advance(to)).rejects.toMatchObject({ code: 'INVALID_PHASE_TRANSITION' });
      expect(questionUpdateMany).not.toHaveBeenCalled();
    });

    it('moves the board on to the next pending question when finished', async () => {
      questionFindUnique.mockResolvedValue(brainstorm('discussion'));
      questionFindFirst.mockResolvedValue({ id: 'q2' });
      await advance('answered');
      expect(sessionUpdateInTx).toHaveBeenCalledWith(
        expect.objectContaining({ data: { currentQuestionId: 'q2' } }),
      );
    });
  });

  it('treats setting the status a question already has as a no-op, so a double-click is not an error', async () => {
    const current = question({ status: 'discussion' });
    questionFindUnique.mockResolvedValue(current);
    await expect(advance('discussion')).resolves.toBe(current);
    expect(questionUpdateMany).not.toHaveBeenCalled();
  });

  // The invariant `getActiveQuestion` relies on: with two questions open,
  // "which question is the board showing" would have no answer.
  it('refuses to open a second question while another is still open', async () => {
    questionFindUnique.mockResolvedValue(question({ id: 'q2', position: 1 }));
    questionFindFirst.mockResolvedValue({ position: 0 });

    await expect(
      setQuestionPhase({
        sessionId: 's1',
        questionId: 'q2',
        leaderId: 'leader-1',
        status: 'discussion',
      }),
    ).rejects.toMatchObject({ code: 'QUESTION_ALREADY_OPEN' });
    expect(questionUpdateMany).not.toHaveBeenCalled();
  });

  it('names the offending question by its 1-based agenda position, not its id', async () => {
    questionFindUnique.mockResolvedValue(question({ id: 'q3', position: 2 }));
    questionFindFirst.mockResolvedValue({ position: 1 });

    await expect(
      setQuestionPhase({
        sessionId: 's1',
        questionId: 'q3',
        leaderId: 'leader-1',
        status: 'discussion',
      }),
    ).rejects.toThrow(/Question 2 is still open/);
  });

  it('does not apply the single-open check to the question already open (discussion -> voting)', async () => {
    questionFindUnique.mockResolvedValue(question({ status: 'discussion' }));
    await expect(advance('voting')).resolves.toMatchObject({ status: 'voting' });
    // Excluding itself is the whole point — a `where` without `id: { not: … }`
    // would find this very question and refuse its own transition.
    expect(questionFindFirst.mock.calls[0]?.[0].where).toMatchObject({
      id: { not: 'q1' },
      status: { in: ['discussion', 'voting'] },
    });
  });

  it(`refuses to open voting with fewer than two proposals`, async () => {
    questionFindUnique.mockResolvedValue(question({ status: 'discussion' }));
    proposalCount.mockResolvedValue(1);
    await expect(advance('voting')).rejects.toMatchObject({ code: 'NOT_ENOUGH_TO_VOTE' });
    expect(questionUpdateMany).not.toHaveBeenCalled();
  });

  it('lets the leader return to discussion while still shortlisting', async () => {
    questionFindUnique.mockResolvedValue(question({ status: 'voting' }));
    votingRoundFindUnique.mockResolvedValue({ status: 'shortlisting' });
    await expect(advance('discussion')).resolves.toMatchObject({ status: 'discussion' });
    expect(votingRoundDeleteMany).toHaveBeenCalledWith({
      where: { questionId: 'q1', status: 'shortlisting' },
    });
  });

  it.each(['open', 'closed'] as const)(
    'refuses to rewind once the ballot is %s',
    async (roundStatus) => {
      questionFindUnique.mockResolvedValue(question({ status: 'voting' }));
      votingRoundFindUnique.mockResolvedValue({ status: roundStatus });
      await expect(advance('discussion')).rejects.toMatchObject({ code: 'VOTING_ALREADY_STARTED' });
      expect(questionUpdateMany).not.toHaveBeenCalled();
      expect(votingRoundDeleteMany).not.toHaveBeenCalled();
    },
  );

  it('looks for the next pending question when closing, not for another open one', async () => {
    questionFindUnique.mockResolvedValue(question({ status: 'voting' }));
    await advance('answered');
    expect(questionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: 's1', status: 'pending' },
      }),
    );
  });

  it('emitQuestionPhase broadcasts the new status to the session room', () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const io = { to } as unknown as Parameters<typeof emitQuestionPhase>[0];

    emitQuestionPhase(io, 's1', question({ status: 'voting' }));

    expect(to).toHaveBeenCalledWith('session:s1');
    expect(emit).toHaveBeenCalledWith('sessionPhase', {
      sessionId: 's1',
      questionId: 'q1',
      status: 'voting',
    });
  });
});

describe('getActiveQuestion', () => {
  const rows = [
    { id: 'q1', sessionId: 's1', text: 'One', position: 0, status: 'answered' },
    { id: 'q2', sessionId: 's1', text: 'Two', position: 1, status: 'voting' },
    { id: 'q3', sessionId: 's1', text: 'Three', position: 2, status: 'pending' },
  ];

  beforeEach(() => {
    sessionFindUnique.mockResolvedValue({ currentQuestionId: null });
  });

  it('returns the focused question even when it is already answered', async () => {
    sessionFindUnique.mockResolvedValue({ currentQuestionId: 'q1' });
    questionFindUnique.mockResolvedValue(rows[0]);
    await expect(getActiveQuestion('s1')).resolves.toMatchObject({ id: 'q1' });
    expect(questionFindManyTopLevel).not.toHaveBeenCalled();
  });

  it('prefers the open question over an earlier finished one or a later pending one', async () => {
    questionFindManyTopLevel.mockResolvedValueOnce(rows);
    await expect(getActiveQuestion('s1')).resolves.toMatchObject({ id: 'q2' });
  });

  it('shows the next pending question between one closing and the leader opening the next', async () => {
    questionFindManyTopLevel.mockResolvedValueOnce([
      { ...rows[0] },
      { ...rows[1], status: 'answered' },
      { ...rows[2] },
    ]);
    await expect(getActiveQuestion('s1')).resolves.toMatchObject({ id: 'q3' });
  });

  it('returns null once the agenda is finished, rather than the last question again', async () => {
    questionFindManyTopLevel.mockResolvedValueOnce([
      { ...rows[0] },
      { ...rows[1], status: 'skipped' },
      { ...rows[2], status: 'answered' },
    ]);
    // The old heuristic returned `questions[0]` here, so a finished session
    // looked identical to one parked on question 1.
    await expect(getActiveQuestion('s1')).resolves.toBeNull();
  });

  it('returns null for a session with no questions', async () => {
    questionFindManyTopLevel.mockResolvedValueOnce([]);
    await expect(getActiveQuestion('s1')).resolves.toBeNull();
  });
});

describe('getQuestionInSession', () => {
  it('asks for the id and the session together, so another session’s question is a miss', async () => {
    questionFindFirst.mockResolvedValue(null);

    await expect(getQuestionInSession('s1', 'q-other')).resolves.toBeNull();
    expect(questionFindFirst).toHaveBeenCalledWith({
      where: { id: 'q-other', sessionId: 's1' },
      select: {
        id: true,
        sessionId: true,
        text: true,
        position: true,
        status: true,
        boardLocked: true,
        votingEnabled: true,
      },
    });
  });
});

describe('focusQuestion', () => {
  const active = { leaderId: 'leader-1', status: 'active' as const, currentQuestionId: 'q1' };
  const q2 = {
    id: 'q2',
    sessionId: 's1',
    text: 'Two',
    position: 1,
    status: 'answered' as const,
  };

  it('points the board at another question without changing its status', async () => {
    sessionFindUnique.mockResolvedValue(active);
    questionFindUnique.mockResolvedValue(q2);
    sessionUpdate.mockResolvedValue({});

    await expect(
      focusQuestion({ sessionId: 's1', questionId: 'q2', leaderId: 'leader-1' }),
    ).resolves.toMatchObject({ id: 'q2', status: 'answered' });

    expect(sessionUpdate).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { currentQuestionId: 'q2' },
    });
  });

  it('is a no-op when that question is already focused', async () => {
    sessionFindUnique.mockResolvedValue({ ...active, currentQuestionId: 'q2' });
    questionFindUnique.mockResolvedValue(q2);
    await focusQuestion({ sessionId: 's1', questionId: 'q2', leaderId: 'leader-1' });
    expect(sessionUpdate).not.toHaveBeenCalled();
  });

  it('rejects a caller who is not the leader', async () => {
    sessionFindUnique.mockResolvedValue(active);
    await expect(
      focusQuestion({ sessionId: 's1', questionId: 'q2', leaderId: 'other' }),
    ).rejects.toMatchObject({ code: 'NOT_SESSION_LEADER' });
  });

  it('emitQuestionFocus broadcasts sessionFocus to the session room', () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const io = { to } as unknown as Parameters<typeof emitQuestionFocus>[0];

    emitQuestionFocus(io, 's1', 'q2');

    expect(to).toHaveBeenCalledWith('session:s1');
    expect(emit).toHaveBeenCalledWith('sessionFocus', { sessionId: 's1', questionId: 'q2' });
  });
});

describe('getDiscussionTimer', () => {
  const started = new Date('2026-09-10T00:00:00.000Z');

  it('returns null when the session has no discussion clock', async () => {
    sessionFindUnique.mockResolvedValueOnce({ discussionTimerSeconds: null });
    await expect(getDiscussionTimer('s1')).resolves.toBeNull();
  });

  it('counts from the open discussion question', async () => {
    sessionFindUnique.mockResolvedValueOnce({ discussionTimerSeconds: 300 });
    questionFindManyTopLevel.mockResolvedValueOnce([
      { id: 'q1', status: 'discussion', discussionStartedAt: started },
    ]);
    await expect(getDiscussionTimer('s1')).resolves.toEqual({
      startedAt: started.toISOString(),
      durationSeconds: 300,
    });
  });

  it('keeps running during shortlisting and hides once the ballot is open', async () => {
    sessionFindUnique.mockResolvedValue({ discussionTimerSeconds: 300 });
    questionFindManyTopLevel.mockResolvedValue([
      { id: 'q1', status: 'voting', discussionStartedAt: started },
    ]);
    votingRoundFindUnique.mockResolvedValueOnce({ status: 'shortlisting' });
    await expect(getDiscussionTimer('s1')).resolves.toMatchObject({ durationSeconds: 300 });

    votingRoundFindUnique.mockResolvedValueOnce({ status: 'open' });
    await expect(getDiscussionTimer('s1')).resolves.toBeNull();

    votingRoundFindUnique.mockResolvedValueOnce({ status: 'closed' });
    await expect(getDiscussionTimer('s1')).resolves.toBeNull();
  });
});

describe('findLiveSessionForUser', () => {
  const liveQuery = {
    where: {
      status: { in: ['lobby', 'active'] },
      members: { some: { userId: 'u1', leftAt: null } },
    },
    select: { id: true, title: true },
  };

  it('looks for a current membership in a lobby or active session', async () => {
    sessionFindFirst.mockResolvedValueOnce({ id: 's1', title: 'Standup' });

    await expect(findLiveSessionForUser('u1')).resolves.toEqual({ id: 's1', title: 'Standup' });
    expect(sessionFindFirst).toHaveBeenCalledWith(liveQuery);
  });

  it('returns null when the user is not in a lobby or active session', async () => {
    sessionFindFirst.mockResolvedValueOnce(null);
    await expect(findLiveSessionForUser('u1')).resolves.toBeNull();
  });
});

describe('setBoardLock', () => {
  const live = { leaderId: 'leader-1', status: 'active' as const };
  const lock = (locked: boolean, leaderId = 'leader-1') =>
    setBoardLock({ sessionId: 's1', questionId: 'q1', leaderId, locked });

  it.each([true, false])('lets the leader set a question’s lock to %s', async (locked) => {
    sessionFindUnique.mockResolvedValue(live);
    questionFindUnique.mockResolvedValue({ sessionId: 's1' });
    questionUpdate.mockResolvedValue({});

    await expect(lock(locked)).resolves.toBe(locked);
    // On the question, so the next one starts locked again.
    expect(questionUpdate).toHaveBeenCalledWith({
      where: { id: 'q1' },
      data: { boardLocked: locked },
    });
  });

  it('can be set from the waiting room, before anyone moves anything', async () => {
    sessionFindUnique.mockResolvedValue({ ...live, status: 'lobby' });
    questionFindUnique.mockResolvedValue({ sessionId: 's1' });
    questionUpdate.mockResolvedValue({});
    await expect(lock(false)).resolves.toBe(false);
  });

  it('refuses anyone but the leader', async () => {
    sessionFindUnique.mockResolvedValue(live);
    await expect(lock(false, 'member')).rejects.toMatchObject({ code: 'NOT_SESSION_LEADER' });
    expect(questionUpdate).not.toHaveBeenCalled();
  });

  it('refuses a session that has ended', async () => {
    sessionFindUnique.mockResolvedValue({ ...live, status: 'ended' });
    await expect(lock(false)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('refuses a question from another session', async () => {
    sessionFindUnique.mockResolvedValue(live);
    questionFindUnique.mockResolvedValue({ sessionId: 'elsewhere' });
    await expect(lock(false)).rejects.toMatchObject({ code: 'QUESTION_NOT_FOUND' });
    expect(questionUpdate).not.toHaveBeenCalled();
  });

  it('emitBoardLock tells the whole room which question it was', () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const io = { to } as unknown as Parameters<typeof emitBoardLock>[0];

    emitBoardLock(io, 's1', 'q1', false);

    expect(to).toHaveBeenCalledWith('session:s1');
    expect(emit).toHaveBeenCalledWith('boardLock', {
      sessionId: 's1',
      questionId: 'q1',
      locked: false,
    });
  });
});
