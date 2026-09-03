import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionSchema } from '@roundtable/shared/schemas';

// The transaction shape is the interesting part here, not Prisma itself —
// stubbed so `createSession`'s writes can be inspected directly. The actual
// queries are covered by the integration smoke test (docs/05 §10).
const sessionCreate = vi.fn();
const questionCreateMany = vi.fn();
const sessionMemberCreate = vi.fn();

vi.mock('../../db.js', () => ({
  prisma: {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({
        session: { create: sessionCreate },
        question: { createMany: questionCreateMany },
        sessionMember: { create: sessionMemberCreate },
      }),
    ),
  },
}));

const { createSession } = await import('./service.js');

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
