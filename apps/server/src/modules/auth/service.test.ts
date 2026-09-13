import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// `deleteAccount` is the one irreversible path in this module — mocked
// prisma + sessions-module calls, rather than a real DB (this repo verifies
// DB-level effects like ON DELETE SET NULL manually, per docs/05 §10's
// integration smoke test), still gives real regression coverage for the
// password check, the live-session guard, and the call order.
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(mockPrisma)),
  },
}));
vi.mock('../../db.js', () => ({ prisma: mockPrisma }));

const { findLiveSessionForUser, deleteDraftSessionsForUser } = vi.hoisted(() => ({
  findLiveSessionForUser: vi.fn(),
  deleteDraftSessionsForUser: vi.fn(),
}));
vi.mock('../sessions/index.js', () => ({ findLiveSessionForUser, deleteDraftSessionsForUser }));

const { deleteAccount, toPublicUser } = await import('./service.js');

const PASSWORD = 'correct-horse-battery-staple';

async function userRow(overrides: Partial<{ id: string; passwordHash: string }> = {}) {
  return {
    id: 'user-1',
    email: 'alice@example.com',
    displayName: 'Alice',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    ...overrides,
  };
}

describe('toPublicUser', () => {
  it('strips passwordHash and stringifies createdAt', () => {
    const row = {
      id: 'user-1',
      email: 'alice@example.com',
      displayName: 'Alice',
      passwordHash: '$2b$10$shouldNeverAppearInOutput',
      createdAt: new Date('2026-09-01T12:00:00.000Z'),
    };

    expect(toPublicUser(row)).toEqual({
      id: 'user-1',
      email: 'alice@example.com',
      displayName: 'Alice',
      createdAt: '2026-09-01T12:00:00.000Z',
    });
  });
});

describe('deleteAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) =>
      fn(mockPrisma),
    );
  });

  it('throws 404 when the user does not exist, without checking the password', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(deleteAccount('missing-user', PASSWORD)).rejects.toMatchObject({
      status: 404,
      code: 'USER_NOT_FOUND',
    });
    expect(findLiveSessionForUser).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws 401 on a wrong password and deletes nothing', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(await userRow());

    await expect(deleteAccount('user-1', 'wrong-password')).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_PASSWORD',
    });
    expect(findLiveSessionForUser).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses while the user leads or belongs to a live session, and deletes nothing', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(await userRow());
    findLiveSessionForUser.mockResolvedValue({ id: 'session-1', title: 'Sprint planning' });

    await expect(deleteAccount('user-1', PASSWORD)).rejects.toMatchObject({
      status: 409,
      code: 'LIVE_SESSION_EXISTS',
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('deletes this user’s draft sessions and their own row, in one transaction, on success', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(await userRow());
    findLiveSessionForUser.mockResolvedValue(null);
    deleteDraftSessionsForUser.mockResolvedValue(undefined);
    mockPrisma.user.delete.mockResolvedValue(undefined);

    await deleteAccount('user-1', PASSWORD);

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(deleteDraftSessionsForUser).toHaveBeenCalledWith('user-1', mockPrisma);
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });
});
