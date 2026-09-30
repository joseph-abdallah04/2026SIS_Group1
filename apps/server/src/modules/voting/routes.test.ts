import http from 'node:http';
import type { AddressInfo } from 'node:net';

import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, errorHandler } from '../../middleware/error.js';

const assertSessionMember = vi.fn();
const listEndedVoteOutcomes = vi.fn();
const getVotingStateForSession = vi.fn();
const getShortlistForSession = vi.fn();

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const userId = req.headers['x-test-user-id'];
    if (typeof userId !== 'string' || !userId) {
      res.status(401).json({ error: 'Missing authentication token', code: 'MISSING_TOKEN' });
      return;
    }
    req.userId = userId;
    next();
  },
}));

vi.mock('./sessionsAdapter.js', () => ({ assertSessionMember }));
vi.mock('./service.js', () => ({
  listEndedVoteOutcomes,
  getVotingStateForSession,
  getShortlistForSession,
}));

const { votingRoutes } = await import('./routes.js');

const OUTCOMES = [
  {
    questionId: 'q1',
    proposalIds: ['p1', 'p2'],
    winnerProposalId: 'p1',
    tiedProposalIds: [],
  },
];

function createApp() {
  const app = express();
  app.use('/api/sessions', votingRoutes);
  app.use(errorHandler);
  return app;
}

async function request({
  userId = 'u1',
  path = '/api/sessions/s1/outcomes',
}: {
  userId?: string;
  path?: string;
} = {}): Promise<{ status: number; body: unknown }> {
  const server = http.createServer(createApp());
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers: userId ? { 'x-test-user-id': userId } : {},
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  assertSessionMember.mockResolvedValue(undefined);
  listEndedVoteOutcomes.mockResolvedValue(OUTCOMES);
});

describe('GET /api/sessions/:sessionId/outcomes', () => {
  it('403s a stranger before reading any results', async () => {
    assertSessionMember.mockRejectedValue(
      new ApiError(403, 'You are not a member of this session', 'NOT_SESSION_MEMBER'),
    );
    const res = await request({ userId: 'stranger' });
    expect(res.status).toBe(403);
    expect(listEndedVoteOutcomes).not.toHaveBeenCalled();
  });

  it('returns shortlist and winner ids for a member', async () => {
    const res = await request();
    expect(res.status).toBe(200);
    expect(res.body).toEqual(OUTCOMES);
    expect(assertSessionMember).toHaveBeenCalledWith('s1', 'u1');
    expect(listEndedVoteOutcomes).toHaveBeenCalledWith('s1');
  });
});
