import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionSchema, sessionCodeSchema } from '@roundtable/shared/schemas';

// The transaction shape is the interesting part here, not Prisma itself —
// stubbed so writes can be inspected directly. The actual queries are
// covered by the integration smoke test (docs/05 §10).
const sessionCreate = vi.fn();
const questionCreateMany = vi.fn();
const sessionMemberCreate = vi.fn();
const sessionFindUnique = vi.fn();
const sessionUpdate = vi.fn();
const sessionMemberUpsert = vi.fn();

vi.mock('../../db.js', () => ({
  prisma: {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({
        session: { create: sessionCreate },
        question: { createMany: questionCreateMany },
        sessionMember: { create: sessionMemberCreate },
      }),
    ),
    session: { findUnique: sessionFindUnique, update: sessionUpdate },
    sessionMember: { upsert: sessionMemberUpsert },
  },
}));

const { createSession, generateSessionCode, joinSessionByCode, openSessionForJoining, resolveSessionByCode } =
  await import('./service.js');

beforeEach(() => {
  vi.clearAllMocks();
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
});
