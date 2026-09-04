import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionSchema, sessionCodeSchema } from '@roundtable/shared/schemas';

// The transaction shape is the interesting part here, not Prisma itself —
// stubbed so writes can be inspected directly. The actual queries are
// covered by the integration smoke test (docs/05 §10).
const sessionCreate = vi.fn();
const questionCreateMany = vi.fn();
const questionDeleteMany = vi.fn();
const questionFindMany = vi.fn();
const sessionMemberCreate = vi.fn();
const sessionFindUnique = vi.fn();
const sessionFindFirst = vi.fn();
const sessionUpdate = vi.fn();
const sessionUpdateInTx = vi.fn();
const sessionDelete = vi.fn();
const sessionMemberUpsert = vi.fn();
const sessionMemberDeleteMany = vi.fn();

vi.mock('../../db.js', () => ({
  prisma: {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({
        session: { create: sessionCreate, update: sessionUpdateInTx },
        question: {
          createMany: questionCreateMany,
          deleteMany: questionDeleteMany,
          findMany: questionFindMany,
        },
        sessionMember: { create: sessionMemberCreate },
      }),
    ),
    session: { findUnique: sessionFindUnique, findFirst: sessionFindFirst, update: sessionUpdate, delete: sessionDelete },
    sessionMember: { upsert: sessionMemberUpsert, deleteMany: sessionMemberDeleteMany },
  },
}));

vi.mock('../../realtime/types.js', () => ({
  sessionRoom: (id: string) => `session:${id}`,
}));

const {
  createSession,
  deleteSession,
  emitSessionStarted,
  generateSessionCode,
  joinSessionByCode,
  leaveSession,
  openSessionForJoining,
  resolveSessionByCode,
  startSession,
  updateSessionDraft,
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

describe('createSession', () => {
  const input = { title: 'Roadmap planning', questions: ['What ships first?', 'Who owns it?'] };

  it('always writes a new session as draft with no code, regardless of what the caller passed', async () => {
    await createSession({ leaderId: 'u1', input });
    expect(sessionCreate.mock.calls[0]?.[0]).toMatchObject({
      data: { title: 'Roadmap planning', leaderId: 'u1', code: null, status: 'draft' },
    });
  });

  it('assigns question position from array order, so reordering client-side is the whole reorder UI', async () => {
    await createSession({ leaderId: 'u1', input });
    expect(questionCreateMany.mock.calls[0]?.[0].data).toEqual([
      { sessionId: 's1', text: 'What ships first?', position: 0 },
      { sessionId: 's1', text: 'Who owns it?', position: 1 },
    ]);
  });

  it('preserves order exactly as submitted, even when reversed', async () => {
    await createSession({
      leaderId: 'u1',
      input: { title: 'X', questions: ['Third', 'Second', 'First'] },
    });
    const texts = questionCreateMany.mock.calls[0]?.[0].data.map(
      (q: { text: string }) => q.text,
    );
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
});

describe('createSessionSchema', () => {
  it('accepts a title and at least one question', () => {
    expect(
      createSessionSchema.safeParse({ title: 'Sprint kickoff', questions: ['Scope?'] }).success,
    ).toBe(true);
  });

  it('rejects an empty title', () => {
    expect(createSessionSchema.safeParse({ title: '', questions: ['Scope?'] }).success).toBe(
      false,
    );
  });

  it('rejects a title that is only whitespace', () => {
    expect(createSessionSchema.safeParse({ title: '   ', questions: ['Scope?'] }).success).toBe(
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
      createSessionSchema.safeParse({ title: 'Sprint kickoff', questions: [''] }).success,
    ).toBe(false);
  });

  it('rejects a title over 120 characters', () => {
    expect(
      createSessionSchema.safeParse({ title: 'x'.repeat(121), questions: ['Scope?'] }).success,
    ).toBe(false);
  });

  it('rejects a question over 500 characters', () => {
    expect(
      createSessionSchema.safeParse({ title: 'Sprint kickoff', questions: ['x'.repeat(501)] })
        .success,
    ).toBe(false);
  });

  it('rejects more than 50 questions', () => {
    expect(
      createSessionSchema.safeParse({
        title: 'Sprint kickoff',
        questions: Array.from({ length: 51 }, (_, i) => `Q${i}`),
      }).success,
    ).toBe(false);
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
    expect(sessionUpdate).not.toHaveBeenCalled();
  });

  it('rejects a session that is not draft or lobby', async () => {
    sessionFindUnique.mockResolvedValueOnce({ ...draftSession, status: 'active' });
    await expect(
      openSessionForJoining({ sessionId: 's1', leaderId: 'leader-1' }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    expect(sessionUpdate).not.toHaveBeenCalled();
  });

  it('mints exactly one code and flips status to lobby', async () => {
    sessionFindUnique.mockResolvedValueOnce(draftSession);
    sessionUpdate.mockResolvedValueOnce({ ...draftSession, code: 'K7NP-3WQZ', status: 'lobby' });

    const session = await openSessionForJoining({ sessionId: 's1', leaderId: 'leader-1' });

    expect(sessionUpdate).toHaveBeenCalledTimes(1);
    expect(session.status).toBe('lobby');
    expect(sessionCodeSchema.safeParse(session.code).success).toBe(true);
  });

  it('retries on a P2002 collision and succeeds on the next attempt', async () => {
    sessionFindUnique.mockResolvedValueOnce(draftSession);
    sessionUpdate
      .mockRejectedValueOnce({ code: 'P2002' })
      .mockResolvedValueOnce({ ...draftSession, code: 'M4T7-2QRX', status: 'lobby' });

    const session = await openSessionForJoining({ sessionId: 's1', leaderId: 'leader-1' });

    expect(sessionUpdate).toHaveBeenCalledTimes(2);
    expect(session.status).toBe('lobby');
  });

  it('gives up after repeated P2002 collisions rather than retrying forever', async () => {
    sessionFindUnique.mockResolvedValueOnce(draftSession);
    sessionUpdate.mockRejectedValue({ code: 'P2002' });

    await expect(openSessionForJoining({ sessionId: 's1', leaderId: 'leader-1' })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('is a no-op that returns the existing code when already lobby — a double-click is harmless', async () => {
    const lobbySession = { ...draftSession, code: 'K7NP-3WQZ', status: 'lobby' };
    sessionFindUnique.mockResolvedValueOnce(lobbySession);

    const session = await openSessionForJoining({ sessionId: 's1', leaderId: 'leader-1' });

    expect(session).toBe(lobbySession);
    expect(sessionUpdate).not.toHaveBeenCalled();
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
        input: { title: 'New title', questions: ['Q1'] },
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
        input: { title: 'New title', questions: ['Q1'] },
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
      input: { title: 'New title', questions: ['First', 'Second'] },
    });

    expect(questionDeleteMany).toHaveBeenCalledWith({ where: { sessionId: 's1' } });
    expect(questionCreateMany.mock.calls[0]?.[0].data).toEqual([
      { sessionId: 's1', text: 'First', position: 0 },
      { sessionId: 's1', text: 'Second', position: 1 },
    ]);
    expect(result.title).toBe('New title');
    expect(result.questions).toHaveLength(2);
  });

  it('deleteSession rejects a non-leader and never deletes', async () => {
    sessionFindUnique.mockResolvedValueOnce(draftSession);
    await expect(
      deleteSession({ sessionId: 's1', leaderId: 'not-the-leader' }),
    ).rejects.toMatchObject({ code: 'NOT_SESSION_LEADER' });
    expect(sessionDelete).not.toHaveBeenCalled();
  });

  it('deleteSession rejects a session that has left draft', async () => {
    sessionFindUnique.mockResolvedValueOnce({ ...draftSession, status: 'active' });
    await expect(
      deleteSession({ sessionId: 's1', leaderId: 'leader-1' }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    expect(sessionDelete).not.toHaveBeenCalled();
  });

  it('deleteSession deletes the row once the leader/draft guard passes', async () => {
    sessionFindUnique.mockResolvedValueOnce(draftSession);
    await deleteSession({ sessionId: 's1', leaderId: 'leader-1' });
    expect(sessionDelete).toHaveBeenCalledWith({ where: { id: 's1' } });
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

  it('rejects a caller who is not the leader', async () => {
    sessionFindUnique.mockResolvedValueOnce(lobbySession);
    await expect(startSession({ sessionId: 's1', leaderId: 'not-the-leader' })).rejects.toMatchObject({
      code: 'NOT_SESSION_LEADER',
    });
    expect(sessionUpdate).not.toHaveBeenCalled();
  });

  it('rejects starting a session that is not lobby', async () => {
    sessionFindUnique.mockResolvedValueOnce({ ...lobbySession, status: 'draft' });
    await expect(startSession({ sessionId: 's1', leaderId: 'leader-1' })).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });
    expect(sessionUpdate).not.toHaveBeenCalled();
  });

  it('flips status to active and records startedAt', async () => {
    sessionFindUnique.mockResolvedValueOnce(lobbySession);
    sessionUpdate.mockResolvedValueOnce({
      ...lobbySession,
      status: 'active',
      startedAt: new Date('2026-09-04T00:00:00.000Z'),
    });

    const session = await startSession({ sessionId: 's1', leaderId: 'leader-1' });

    expect(sessionUpdate).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { status: 'active', startedAt: expect.any(Date) },
    });
    expect(session.status).toBe('active');
  });

  it('is a no-op that returns the existing session when already active', async () => {
    const activeSession = { ...lobbySession, status: 'active', startedAt: new Date() };
    sessionFindUnique.mockResolvedValueOnce(activeSession);

    const session = await startSession({ sessionId: 's1', leaderId: 'leader-1' });

    expect(session).toBe(activeSession);
    expect(sessionUpdate).not.toHaveBeenCalled();
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
    });

    expect(to).toHaveBeenCalledWith('session:s1');
    expect(emit).toHaveBeenCalledWith('sessionStarted', {
      sessionId: 's1',
      startedAt: '2026-09-04T00:00:00.000Z',
    });
  });
});

describe('leaveSession (F07)', () => {
  it('refuses the leader — they must end the session instead', async () => {
    sessionFindUnique.mockResolvedValueOnce({ leaderId: 'leader-1' });
    await expect(leaveSession({ sessionId: 's1', userId: 'leader-1' })).rejects.toMatchObject({
      code: 'LEADER_CANNOT_LEAVE',
    });
    expect(sessionMemberDeleteMany).not.toHaveBeenCalled();
  });

  it('removes the membership row for a non-leader', async () => {
    sessionFindUnique.mockResolvedValueOnce({ leaderId: 'leader-1' });
    await leaveSession({ sessionId: 's1', userId: 'u2' });
    expect(sessionMemberDeleteMany).toHaveBeenCalledWith({
      where: { sessionId: 's1', userId: 'u2' },
    });
  });

  it('raises SESSION_NOT_FOUND for an unknown session', async () => {
    sessionFindUnique.mockResolvedValueOnce(null);
    await expect(leaveSession({ sessionId: 'missing', userId: 'u2' })).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
    });
  });
});
