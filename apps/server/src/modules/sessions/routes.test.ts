import http from 'node:http';
import type { AddressInfo } from 'node:net';

import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../middleware/error.js';
import { errorHandler } from '../../middleware/error.js';

const assertSessionMember = vi.fn();
const createSession = vi.fn();
const deleteSession = vi.fn();
const emitQuestionFocus = vi.fn();
const emitQuestionPhase = vi.fn();
const emitSessionEnded = vi.fn();
const emitSessionStarted = vi.fn();
const endSession = vi.fn();
const focusQuestion = vi.fn();
const getSessionMemberIdentity = vi.fn();
const getSessionWithQuestions = vi.fn();
const joinSessionByCode = vi.fn();
const leaveSession = vi.fn();
const listSessionMembers = vi.fn();
const listSessionsForUser = vi.fn();
const openSessionForJoining = vi.fn();
const resolveSessionByCode = vi.fn();
const setQuestionPhase = vi.fn();
const startSession = vi.fn();
const updateSessionDraft = vi.fn();

// Identity is injected here so the handlers can be exercised without JWT
// signing — `requireAuth` itself is covered in middleware/auth.test.ts.
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

vi.mock('./service.js', () => ({
  assertSessionMember,
  createSession,
  deleteSession,
  emitQuestionFocus,
  emitQuestionPhase,
  emitSessionEnded,
  emitSessionStarted,
  endSession,
  focusQuestion,
  getSessionMemberIdentity,
  getSessionWithQuestions,
  joinSessionByCode,
  leaveSession,
  listSessionMembers,
  listSessionsForUser,
  openSessionForJoining,
  resolveSessionByCode,
  setQuestionPhase,
  startSession,
  updateSessionDraft,
}));

const { createSessionsRoutes } = await import('./routes.js');

interface FakeSocket {
  data: { user: { id: string; displayName: string } | null; sessionId: string | null };
  leave: (room: string) => Promise<void>;
}

/**
 * Enough of Socket.IO for the leave handler: `in(room).fetchSockets()` reads
 * the same map `addSocket` writes, and `to(room).emit` is recorded.
 */
function createFakeIo() {
  const rooms = new Map<string, Set<FakeSocket>>();
  const broadcasts: { room: string; event: string; payload: unknown }[] = [];

  function roomSet(room: string): Set<FakeSocket> {
    if (!rooms.has(room)) rooms.set(room, new Set());
    return rooms.get(room) as Set<FakeSocket>;
  }

  const io = {
    in(room: string) {
      return { fetchSockets: async () => [...roomSet(room)] };
    },
    to(room: string) {
      return {
        emit(event: string, payload: unknown) {
          broadcasts.push({ room, event, payload });
        },
      };
    },
  };

  function addSocket(userId: string, sessionId: string): FakeSocket {
    const socket: FakeSocket = {
      data: { user: { id: userId, displayName: `User ${userId}` }, sessionId },
      async leave(room: string) {
        roomSet(room).delete(socket);
      },
    };
    roomSet(`session:${sessionId}`).add(socket);
    return socket;
  }

  return { io, addSocket, broadcasts };
}

interface HttpResult {
  status: number;
  body: unknown;
}

function createApp(io: ReturnType<typeof createFakeIo>['io']) {
  const app = express();
  app.use(express.json());
  app.use('/api/sessions', createSessionsRoutes(io as never));
  app.use(errorHandler);
  return app;
}

async function withServer(
  io: ReturnType<typeof createFakeIo>['io'],
  run: (request: (opts: {
    method?: string;
    path: string;
    userId?: string;
    body?: unknown;
  }) => Promise<HttpResult>) => Promise<void>,
): Promise<void> {
  const server = http.createServer(createApp(io));
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;

  const request = async ({
    method = 'GET',
    path,
    userId = 'u1',
    body,
  }: {
    method?: string;
    path: string;
    userId?: string;
    body?: unknown;
  }): Promise<HttpResult> => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(userId ? { 'x-test-user-id': userId } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };

  try {
    await run(request);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

const SESSION = {
  id: 's1',
  title: 'Roadmap',
  status: 'lobby' as const,
  leaderId: 'leader-1',
  code: 'K7NP-3WQZ',
  questions: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  assertSessionMember.mockResolvedValue(undefined);
  getSessionWithQuestions.mockResolvedValue(SESSION);
  listSessionMembers.mockResolvedValue([]);
  leaveSession.mockResolvedValue(undefined);
  deleteSession.mockResolvedValue(undefined);
});

describe('GET /api/sessions/:id membership', () => {
  it('401s when requireAuth cannot name the caller', async () => {
    const { io } = createFakeIo();
    await withServer(io, async (request) => {
      const res = await request({ path: '/api/sessions/s1', userId: '' });
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: 'MISSING_TOKEN' });
    });
  });

  it('404s before consulting membership when the session does not exist', async () => {
    getSessionWithQuestions.mockResolvedValue(null);
    const { io } = createFakeIo();
    await withServer(io, async (request) => {
      const res = await request({ path: '/api/sessions/missing' });
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ code: 'SESSION_NOT_FOUND' });
      expect(assertSessionMember).not.toHaveBeenCalled();
    });
  });

  it('403s a verified user who is not a member — a session id is not a secret', async () => {
    assertSessionMember.mockRejectedValue(
      new ApiError(403, 'You are not a member of this session', 'NOT_SESSION_MEMBER'),
    );
    const { io } = createFakeIo();
    await withServer(io, async (request) => {
      const res = await request({ path: '/api/sessions/s1', userId: 'stranger' });
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: 'NOT_SESSION_MEMBER' });
      expect(assertSessionMember).toHaveBeenCalledWith('s1', 'stranger');
    });
  });

  it('returns the session once membership passes', async () => {
    const { io } = createFakeIo();
    await withServer(io, async (request) => {
      const res = await request({ path: '/api/sessions/s1' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: 's1', title: 'Roadmap' });
      expect(assertSessionMember).toHaveBeenCalledWith('s1', 'u1');
    });
  });
});

describe('GET /api/sessions/:id/members membership', () => {
  it('403s a stranger before listing anyone else’s display name', async () => {
    assertSessionMember.mockRejectedValue(
      new ApiError(403, 'You are not a member of this session', 'NOT_SESSION_MEMBER'),
    );
    const { io } = createFakeIo();
    await withServer(io, async (request) => {
      const res = await request({ path: '/api/sessions/s1/members', userId: 'stranger' });
      expect(res.status).toBe(403);
      expect(listSessionMembers).not.toHaveBeenCalled();
    });
  });

  it('returns the membership list for a member', async () => {
    const members = [{ userId: 'u1', displayName: 'Alice', joinedAt: '2026-09-05T00:00:00.000Z' }];
    listSessionMembers.mockResolvedValue(members);
    const { io } = createFakeIo();
    await withServer(io, async (request) => {
      const res = await request({ path: '/api/sessions/s1/members' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual(members);
      expect(assertSessionMember).toHaveBeenCalledWith('s1', 'u1');
    });
  });
});

describe('GET /api/sessions/code/:code', () => {
  it('resolves a code without a membership check — the preview is how you join', async () => {
    resolveSessionByCode.mockResolvedValue({ id: 's1', title: 'Roadmap', status: 'lobby' });
    const { io } = createFakeIo();
    await withServer(io, async (request) => {
      const res = await request({ path: '/api/sessions/code/K7NP-3WQZ' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: 's1' });
      expect(assertSessionMember).not.toHaveBeenCalled();
    });
  });

  it('404s an unknown code', async () => {
    resolveSessionByCode.mockResolvedValue(null);
    const { io } = createFakeIo();
    await withServer(io, async (request) => {
      const res = await request({ path: '/api/sessions/code/ZZZZ-ZZZZ' });
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ code: 'INVALID_CODE' });
    });
  });
});

describe('POST /api/sessions/:id/leave kicking sockets', () => {
  const identity = { id: 'u1', displayName: 'Alice' };

  it('pulls this user’s sockets out of the room, clears sessionId, and emits memberLeft once', async () => {
    getSessionMemberIdentity.mockResolvedValue(identity);
    const fake = createFakeIo();
    const mineA = fake.addSocket('u1', 's1');
    const mineB = fake.addSocket('u1', 's1');
    const other = fake.addSocket('u2', 's1');

    await withServer(fake.io, async (request) => {
      const res = await request({ method: 'POST', path: '/api/sessions/s1/leave', userId: 'u1' });
      expect(res.status).toBe(204);
      expect(leaveSession).toHaveBeenCalledWith({ sessionId: 's1', userId: 'u1' });

      expect(mineA.data.sessionId).toBeNull();
      expect(mineB.data.sessionId).toBeNull();
      expect(other.data.sessionId).toBe('s1');

      const stillInRoom = await fake.io.in('session:s1').fetchSockets();
      expect(stillInRoom).toEqual([other]);

      expect(fake.broadcasts).toEqual([
        { room: 'session:s1', event: 'memberLeft', payload: { user: identity } },
      ]);
    });
  });

  it('does not announce a leave when they were already gone — no identity, no emit', async () => {
    getSessionMemberIdentity.mockResolvedValue(null);
    const fake = createFakeIo();
    fake.addSocket('u1', 's1');

    await withServer(fake.io, async (request) => {
      const res = await request({ method: 'POST', path: '/api/sessions/s1/leave' });
      expect(res.status).toBe(204);
      expect(leaveSession).toHaveBeenCalled();
      expect(fake.broadcasts).toEqual([]);
      const stillInRoom = await fake.io.in('session:s1').fetchSockets();
      expect(stillInRoom).toHaveLength(1);
    });
  });

  it('does not kick sockets when leaveSession itself refuses (e.g. the leader)', async () => {
    getSessionMemberIdentity.mockResolvedValue(identity);
    leaveSession.mockRejectedValue(
      new ApiError(409, 'The leader cannot leave — end the session instead', 'LEADER_CANNOT_LEAVE'),
    );
    const fake = createFakeIo();
    const socket = fake.addSocket('leader-1', 's1');

    await withServer(fake.io, async (request) => {
      const res = await request({
        method: 'POST',
        path: '/api/sessions/s1/leave',
        userId: 'leader-1',
      });
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'LEADER_CANNOT_LEAVE' });
      expect(socket.data.sessionId).toBe('s1');
      expect(fake.broadcasts).toEqual([]);
    });
  });

  it('reads identity before leaveSession so a just-stamped leftAt cannot hide the name', async () => {
    const order: string[] = [];
    getSessionMemberIdentity.mockImplementation(async () => {
      order.push('identity');
      return identity;
    });
    leaveSession.mockImplementation(async () => {
      order.push('leave');
    });
    const { io } = createFakeIo();
    await withServer(io, async (request) => {
      await request({ method: 'POST', path: '/api/sessions/s1/leave' });
      expect(order).toEqual(['identity', 'leave']);
    });
  });
});

describe('lifecycle broadcasts after a successful REST command', () => {
  it('POST /:id/start broadcasts sessionStarted on the same io the gateway uses', async () => {
    const started = {
      ...SESSION,
      status: 'active',
      startedAt: new Date('2026-09-05T12:00:00.000Z'),
    };
    startSession.mockResolvedValue(started);
    const { io } = createFakeIo();
    await withServer(io, async (request) => {
      const res = await request({ method: 'POST', path: '/api/sessions/s1/start' });
      expect(res.status).toBe(200);
      expect(startSession).toHaveBeenCalledWith({ sessionId: 's1', leaderId: 'u1' });
      expect(emitSessionStarted).toHaveBeenCalledWith(io, started);
    });
  });

  it('does not broadcast sessionStarted when startSession refuses', async () => {
    startSession.mockRejectedValue(
      new ApiError(403, 'Only the session leader can start it', 'NOT_SESSION_LEADER'),
    );
    const { io } = createFakeIo();
    await withServer(io, async (request) => {
      const res = await request({ method: 'POST', path: '/api/sessions/s1/start' });
      expect(res.status).toBe(403);
      expect(emitSessionStarted).not.toHaveBeenCalled();
    });
  });

  it('POST /:id/end broadcasts sessionEnded', async () => {
    const ended = {
      ...SESSION,
      status: 'ended',
      endedAt: new Date('2026-09-05T13:00:00.000Z'),
    };
    endSession.mockResolvedValue(ended);
    const { io } = createFakeIo();
    await withServer(io, async (request) => {
      const res = await request({ method: 'POST', path: '/api/sessions/s1/end' });
      expect(res.status).toBe(200);
      expect(emitSessionEnded).toHaveBeenCalledWith(io, ended);
    });
  });

  it('POST /:id/phase broadcasts sessionPhase', async () => {
    const question = { id: 'q1', sessionId: 's1', status: 'voting', text: 'What?', position: 0 };
    setQuestionPhase.mockResolvedValue(question);
    const { io } = createFakeIo();
    await withServer(io, async (request) => {
      const res = await request({
        method: 'POST',
        path: '/api/sessions/s1/phase',
        body: { questionId: 'q1', status: 'voting' },
      });
      expect(res.status).toBe(200);
      expect(emitQuestionPhase).toHaveBeenCalledWith(io, 's1', question);
    });
  });

  it('POST /:id/focus broadcasts sessionFocus', async () => {
    const question = { id: 'q2', sessionId: 's1', status: 'answered', text: 'Next', position: 1 };
    focusQuestion.mockResolvedValue(question);
    const { io } = createFakeIo();
    await withServer(io, async (request) => {
      const res = await request({
        method: 'POST',
        path: '/api/sessions/s1/focus',
        body: { questionId: 'q2' },
      });
      expect(res.status).toBe(200);
      expect(emitQuestionFocus).toHaveBeenCalledWith(io, 's1', 'q2');
    });
  });

  it('rejects an invalid phase body before touching the service', async () => {
    const { io } = createFakeIo();
    await withServer(io, async (request) => {
      const res = await request({
        method: 'POST',
        path: '/api/sessions/s1/phase',
        body: { questionId: 'q1', status: 'pending' },
      });
      expect(res.status).toBe(400);
      expect(setQuestionPhase).not.toHaveBeenCalled();
    });
  });
});

describe('draft edit, delete, open, create, join', () => {
  it('PATCH /:id replaces a draft through updateSessionDraft', async () => {
    const updated = { ...SESSION, title: 'New title', status: 'draft' };
    updateSessionDraft.mockResolvedValue(updated);
    const { io } = createFakeIo();
    await withServer(io, async (request) => {
      const res = await request({
        method: 'PATCH',
        path: '/api/sessions/s1',
        body: { title: 'New title', questions: ['What ships?'] },
      });
      expect(res.status).toBe(200);
      expect(updateSessionDraft).toHaveBeenCalledWith({
        sessionId: 's1',
        leaderId: 'u1',
        input: { title: 'New title', questions: ['What ships?'] },
      });
    });
  });

  it('DELETE /:id calls deleteSession — hide or destroy is the service’s decision', async () => {
    const { io } = createFakeIo();
    await withServer(io, async (request) => {
      const res = await request({ method: 'DELETE', path: '/api/sessions/s1' });
      expect(res.status).toBe(204);
      expect(deleteSession).toHaveBeenCalledWith({ sessionId: 's1', userId: 'u1' });
    });
  });

  it('DELETE /:id surfaces a live-session refusal', async () => {
    deleteSession.mockRejectedValue(
      new ApiError(409, 'Cannot delete a live session — end it first', 'INVALID_TRANSITION'),
    );
    const { io } = createFakeIo();
    await withServer(io, async (request) => {
      const res = await request({ method: 'DELETE', path: '/api/sessions/s1' });
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'INVALID_TRANSITION' });
    });
  });

  it('POST /:id/open mints the join code', async () => {
    openSessionForJoining.mockResolvedValue(SESSION);
    const { io } = createFakeIo();
    await withServer(io, async (request) => {
      const res = await request({ method: 'POST', path: '/api/sessions/s1/open' });
      expect(res.status).toBe(200);
      expect(openSessionForJoining).toHaveBeenCalledWith({ sessionId: 's1', leaderId: 'u1' });
    });
  });

  it('POST / creates a draft for the authenticated user', async () => {
    const created = { ...SESSION, status: 'draft', code: null };
    createSession.mockResolvedValue(created);
    const { io } = createFakeIo();
    await withServer(io, async (request) => {
      const res = await request({
        method: 'POST',
        path: '/api/sessions',
        body: { title: 'Roadmap', questions: ['What ships?'] },
      });
      expect(res.status).toBe(201);
      expect(createSession).toHaveBeenCalledWith({
        leaderId: 'u1',
        input: { title: 'Roadmap', questions: ['What ships?'] },
      });
    });
  });

  it('POST /join rejects an empty code before calling the service', async () => {
    const { io } = createFakeIo();
    await withServer(io, async (request) => {
      const res = await request({ method: 'POST', path: '/api/sessions/join', body: { code: '' } });
      expect(res.status).toBe(400);
      expect(joinSessionByCode).not.toHaveBeenCalled();
    });
  });

  it('POST /join upserts membership for the caller', async () => {
    joinSessionByCode.mockResolvedValue({ sessionId: 's1' });
    const { io } = createFakeIo();
    await withServer(io, async (request) => {
      const res = await request({
        method: 'POST',
        path: '/api/sessions/join',
        body: { code: 'K7NP-3WQZ' },
      });
      expect(res.status).toBe(200);
      expect(joinSessionByCode).toHaveBeenCalledWith({ rawCode: 'K7NP-3WQZ', userId: 'u1' });
    });
  });

  it('GET / lists sessions for the caller', async () => {
    listSessionsForUser.mockResolvedValue([{ id: 's1', title: 'Roadmap' }]);
    const { io } = createFakeIo();
    await withServer(io, async (request) => {
      const res = await request({ path: '/api/sessions' });
      expect(res.status).toBe(200);
      expect(listSessionsForUser).toHaveBeenCalledWith('u1');
    });
  });
});
