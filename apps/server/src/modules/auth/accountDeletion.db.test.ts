import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The other tests in this module stub Prisma, so they can only prove which
// arguments were passed — not that the queries do what they are meant to
// (relation filters, `ON DELETE SET NULL`, the cascade that takes a draft's
// questions with it). This file runs `deleteAccount` and `deleteSession`
// against a real Postgres.
//
// Skipped unless RUN_DB_TESTS=1, because CI has no database:
//
//   npm run db:up && RUN_DB_TESTS=1 npm run test --workspace @roundtable/server -- accountDeletion
//
// It writes to whatever DATABASE_URL points at, so use the local dev
// database. Everything it creates is tagged with TAG and removed afterwards.
const enabled = process.env.RUN_DB_TESTS === '1';
const TAG = `acct-del-${Date.now()}`;
const PASSWORD = 'Password123!';

describe.skipIf(!enabled)('account deletion against a real database', () => {
  let prisma: typeof import('../../db.js').prisma;
  let deleteAccount: typeof import('./service.js').deleteAccount;
  let hashPassword: typeof import('./service.js').hashPassword;
  let deleteSession: typeof import('../sessions/index.js').deleteSession;

  const userIds: string[] = [];
  const sessionIds: string[] = [];

  beforeAll(async () => {
    await import('../../env.js');
    ({ prisma } = await import('../../db.js'));
    ({ deleteAccount, hashPassword } = await import('./service.js'));
    ({ deleteSession } = await import('../sessions/index.js'));
  });

  afterAll(async () => {
    if (!enabled) return;
    await prisma.session.deleteMany({ where: { OR: [{ id: { in: sessionIds } }, { title: { startsWith: TAG } }] } });
    await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
    await prisma.$disconnect();
  });

  async function makeUser(name: string) {
    const user = await prisma.user.create({
      data: {
        email: `${TAG}-${name}-${userIds.length}@example.com`,
        passwordHash: await hashPassword(PASSWORD),
        displayName: name,
      },
    });
    userIds.push(user.id);
    return user;
  }

  async function makeSession(
    title: string,
    status: 'draft' | 'lobby' | 'active' | 'ended',
    leaderId: string,
    members: {
      userId: string | null;
      hiddenAt?: Date | null;
      leftAt?: Date | null;
    }[],
  ) {
    const session = await prisma.session.create({
      data: {
        title: `${TAG} ${title}`,
        status,
        leaderId,
        code: null,
        questions: { create: [{ text: 'Q1', position: 0 }] },
        members: {
          create: members.map((m) => ({
            userId: m.userId,
            hiddenAt: m.hiddenAt ?? null,
            leftAt: m.leftAt ?? null,
          })),
        },
      },
    });
    sessionIds.push(session.id);
    return session;
  }

  const sessionExists = async (id: string) =>
    (await prisma.session.count({ where: { id } })) === 1;
  const membersOf = (sessionId: string) =>
    prisma.sessionMember.findMany({ where: { sessionId }, orderBy: { joinedAt: 'asc' } });

  it('destroys drafts the user leads, questions included, and leaves other people’s alone', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const draft = await makeSession('alice draft', 'draft', alice.id, [{ userId: alice.id }]);
    const bobsDraft = await makeSession('bob draft', 'draft', bob.id, [{ userId: bob.id }]);

    await deleteAccount(alice.id, PASSWORD);

    expect(await sessionExists(draft.id)).toBe(false);
    expect(await prisma.question.count({ where: { sessionId: draft.id } })).toBe(0);
    expect(await sessionExists(bobsDraft.id)).toBe(true);
  });

  it('hides an ended session for them but keeps it while someone else still shows it', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const ended = await makeSession('shared ended', 'ended', alice.id, [
      { userId: alice.id },
      { userId: bob.id },
    ]);

    await deleteAccount(alice.id, PASSWORD);

    expect(await sessionExists(ended.id)).toBe(true);
    const rows = await membersOf(ended.id);
    // Rows survive (history, vote denominator) — Alice's is anonymised and hidden.
    expect(rows).toHaveLength(2);
    const alices = rows.find((row) => row.userId === null);
    expect(alices?.hiddenAt).toBeInstanceOf(Date);
    expect(rows.find((row) => row.userId === bob.id)?.hiddenAt).toBeNull();
    expect((await prisma.session.findUniqueOrThrow({ where: { id: ended.id } })).leaderId).toBeNull();

    // Once Bob dismisses it too, it goes — the deleted row must not hold it.
    await deleteSession({ sessionId: ended.id, userId: bob.id });
    expect(await sessionExists(ended.id)).toBe(false);
  });

  it('collects an ended session when the deleted user was its last remaining viewer', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const ended = await makeSession('last viewer', 'ended', bob.id, [
      { userId: bob.id, hiddenAt: new Date() },
      { userId: alice.id },
    ]);

    await deleteAccount(alice.id, PASSWORD);

    expect(await sessionExists(ended.id)).toBe(false);
  });

  it('counts a membership they already left (leftAt set, hiddenAt null) as hidden', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const ended = await makeSession('left earlier', 'ended', bob.id, [
      { userId: bob.id, hiddenAt: new Date() },
      { userId: alice.id, leftAt: new Date() },
    ]);

    await deleteAccount(alice.id, PASSWORD);

    expect(await sessionExists(ended.id)).toBe(false);
  });

  it('keeps the membership rows of a session that survives', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const ended = await makeSession('keeps history', 'ended', bob.id, [
      { userId: bob.id },
      { userId: alice.id, leftAt: new Date() },
    ]);

    await deleteAccount(alice.id, PASSWORD);

    const rows = await membersOf(ended.id);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.userId === null || row.userId === bob.id)).toBe(true);
  });

  it('does not let a leftover membership with no user block the last real viewer', async () => {
    // A row left behind by an account deleted before hide-on-delete existed:
    // no user, never hidden.
    const bob = await makeUser('bob');
    const ended = await makeSession('legacy orphan', 'ended', bob.id, [
      { userId: bob.id },
      { userId: null },
    ]);

    await deleteSession({ sessionId: ended.id, userId: bob.id });

    expect(await sessionExists(ended.id)).toBe(false);
  });

  it('leaves a lobby or active session alone — their members are refused first', async () => {
    const alice = await makeUser('alice');
    const live = await makeSession('still live', 'active', alice.id, [{ userId: alice.id }]);

    await expect(deleteAccount(alice.id, PASSWORD)).rejects.toMatchObject({
      status: 409,
      code: 'LIVE_SESSION_EXISTS',
    });

    expect(await prisma.user.count({ where: { id: alice.id } })).toBe(1);
    expect(await sessionExists(live.id)).toBe(true);
    expect((await membersOf(live.id))[0]?.hiddenAt).toBeNull();
  });

  it('does not touch sessions they were never in', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const unrelated = await makeSession('unrelated', 'ended', bob.id, [{ userId: bob.id }]);

    await deleteAccount(alice.id, PASSWORD);

    expect(await sessionExists(unrelated.id)).toBe(true);
    expect((await membersOf(unrelated.id))[0]?.hiddenAt).toBeNull();
  });
});
