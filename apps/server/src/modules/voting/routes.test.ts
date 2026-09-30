import http from 'node:http';
import type { AddressInfo } from 'node:net';

import express from 'express';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { env } from '../../env.js';
import { signToken } from '../auth/jwt.js';
import { ApiError, errorHandler } from '../../middleware/error.js';

const assertSessionMember = vi.fn();
const listEndedVoteOutcomes = vi.fn();
const getVotingStateForSession = vi.fn();
const getShortlistForSession = vi.fn();

vi.mock('../../middleware/auth.js', async () => {
  const actual = await vi.importActual<typeof import('../../middleware/auth.js')>(
    '../../middleware/auth.js',
  );
  return {
    ...actual,
    requireAuth: (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const userId = req.headers['x-test-user-id'];
      if (typeof userId !== 'string' || !userId) {
        res.status(401).json({ error: 'Missing authentication token', code: 'MISSING_TOKEN' });
        return;
      }
      req.userId = userId;
      next();
    },
  };
});

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
    const headers: Record<string, string> = {};
    if (userId) {
      headers['x-test-user-id'] = userId;
      headers.authorization = `Bearer ${signToken({ userId })}`;
    }
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
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

  it('shares one member budget across logins, and leaves other members alone', async () => {
    const firstLogin = jwt.sign({ userId: 'flood' }, env.JWT_SECRET, {
      expiresIn: '7d',
      jwtid: 'login-1',
    });
    const secondLogin = jwt.sign({ userId: 'flood' }, env.JWT_SECRET, {
      expiresIn: '7d',
      jwtid: 'login-2',
    });
    expect(firstLogin).not.toBe(secondLogin);
    const server = http.createServer(createApp());
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as AddressInfo;
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 60; i += 1) {
        const res = await fetch(`http://127.0.0.1:${port}/api/sessions/s1/outcomes`, {
          headers: { 'x-test-user-id': 'flood', authorization: `Bearer ${firstLogin}` },
        });
        statuses.push(res.status);
        await res.arrayBuffer();
      }
      expect(statuses[0]).toBe(200);
      expect(statuses[59]).toBe(200);

      const again = await fetch(`http://127.0.0.1:${port}/api/sessions/s1/outcomes`, {
        headers: { 'x-test-user-id': 'flood', authorization: `Bearer ${secondLogin}` },
      });
      expect(again.status).toBe(429);

      const otherToken = signToken({ userId: 'other' });
      const other = await fetch(`http://127.0.0.1:${port}/api/sessions/s1/outcomes`, {
        headers: { 'x-test-user-id': 'other', authorization: `Bearer ${otherToken}` },
      });
      expect(other.status).toBe(200);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it('puts forged tokens in one address bucket', async () => {
    const server = http.createServer(createApp());
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as AddressInfo;
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 61; i += 1) {
        const res = await fetch(`http://127.0.0.1:${port}/api/sessions/s1/outcomes`, {
          headers: { authorization: `Bearer forged-${i}` },
        });
        statuses.push(res.status);
        await res.arrayBuffer();
      }
      expect(statuses.filter((status) => status === 401)).toHaveLength(60);
      expect(statuses[60]).toBe(429);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
