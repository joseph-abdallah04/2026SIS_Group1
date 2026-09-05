import http from 'node:http';
import type { AddressInfo } from 'node:net';

import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../middleware/error.js';
import { errorHandler } from '../../middleware/error.js';

const assertSessionMember = vi.fn();
const getBoardForSession = vi.fn();

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const userId = req.headers['x-test-user-id'];
    if (typeof userId !== 'string' || !userId) {
      res.status(401).json({ error: 'Missing authentication token', code: 'MISSING_TOKEN' });
      return;
    }
    req.userId = userId;
    next();
  },
}));

vi.mock('../sessions/index.js', () => ({ assertSessionMember }));
vi.mock('./service.js', () => ({ getBoardForSession }));

const { pinboardRoutes } = await import('./routes.js');

const BOARD = {
  sessionId: 's1',
  sessionTitle: 'Roadmap',
  leaderId: 'leader-1',
  questionId: 'q1',
  questionText: 'What ships first?',
  questionPosition: 0,
  questionStatus: 'discussion',
  items: [],
};

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/sessions', pinboardRoutes);
  app.use(errorHandler);
  return app;
}

async function request({
  userId = 'u1',
  path = '/api/sessions/s1/proposals',
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
  getBoardForSession.mockResolvedValue(BOARD);
});

describe('GET /api/sessions/:sessionId/proposals membership', () => {
  it('401s when the caller has no identity', async () => {
    const res = await request({ userId: '' });
    expect(res.status).toBe(401);
    expect(assertSessionMember).not.toHaveBeenCalled();
    expect(getBoardForSession).not.toHaveBeenCalled();
  });

  it('403s a stranger and never reads the board — a session id is not enough', async () => {
    assertSessionMember.mockRejectedValue(
      new ApiError(403, 'You are not a member of this session', 'NOT_SESSION_MEMBER'),
    );
    const res = await request({ userId: 'stranger' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'NOT_SESSION_MEMBER' });
    expect(assertSessionMember).toHaveBeenCalledWith('s1', 'stranger');
    expect(getBoardForSession).not.toHaveBeenCalled();
  });

  it('returns the board snapshot once both gates pass', async () => {
    const res = await request();
    expect(res.status).toBe(200);
    expect(res.body).toEqual(BOARD);
    expect(assertSessionMember).toHaveBeenCalledWith('s1', 'u1');
    expect(getBoardForSession).toHaveBeenCalledWith('s1');
  });
});
