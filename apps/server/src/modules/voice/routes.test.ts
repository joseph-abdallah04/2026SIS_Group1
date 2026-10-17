import http from 'node:http';
import type { AddressInfo } from 'node:net';

import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const issueVoiceToken = vi.fn();
const muteParticipants = vi.fn();

// Identity is injected rather than signed: `requireAuth` itself is covered in
// middleware/auth.test.ts, and this file is about what the route does *after*
// it knows who is asking.
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
  // What the rate limiter keys on. The same header, so each test user has a
  // bucket of their own, as each signed-in user does.
  verifiedUserId: (req: express.Request) => {
    const userId = req.headers['x-test-user-id'];
    return typeof userId === 'string' && userId ? userId : null;
  },
}));

vi.mock('./service.js', () => ({ issueVoiceToken, muteParticipants }));

const { voiceRoutes } = await import('./routes.js');

interface HttpResult {
  status: number;
  body: { error?: string; code?: string; token?: string; url?: string; muted?: number } | null;
}

/**
 * Mount the real router on a real server and talk to it over a real socket.
 * `request` asks for a token; `post` reaches any path with any body.
 */
async function withServer(
  run: (
    request: (userId?: string) => Promise<HttpResult>,
    post: (path: string, body: string, userId?: string) => Promise<HttpResult>,
  ) => Promise<void>,
): Promise<void> {
  // Callers pass '' for "no credentials" rather than `undefined`, which would
  // fall through to the default below and quietly authenticate them.
  const app = express();
  app.use(express.json());
  app.use('/api/sessions', voiceRoutes);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;

  const post = async (path: string, body: string, userId = 'u1'): Promise<HttpResult> => {
    const res = await fetch(`http://127.0.0.1:${port}/api/sessions/s1/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(userId ? { 'x-test-user-id': userId } : {}),
      },
      body,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  const request = (userId = 'u1') => post('livekit-token', '{}', userId);

  try {
    await run(request, post);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

describe('POST /api/sessions/:sessionId/livekit-token', () => {
  beforeEach(() => {
    issueVoiceToken.mockReset();
  });

  it('hands back the token when the caller is a member and voice is configured', async () => {
    issueVoiceToken.mockResolvedValue({
      ok: true,
      value: { token: 'jwt', url: 'wss://example.invalid', identity: 'u1' },
    });

    await withServer(async (request) => {
      const res = await request();

      expect(res.status).toBe(200);
      expect(res.body?.token).toBe('jwt');
      expect(issueVoiceToken).toHaveBeenCalledWith('s1', 'u1');
    });
  });

  it('answers 503 VOICE_NOT_CONFIGURED when the deployment has no LiveKit credentials', async () => {
    issueVoiceToken.mockResolvedValue({ ok: false, reason: 'not-configured' });

    await withServer(async (request) => {
      const res = await request();

      expect(res.status).toBe(503);
      // The web client keys its terminal-vs-retry decision on this exact
      // string (features/voice/useVoiceRoom.ts). Renaming it here without
      // renaming it there silently restores the five-retry storm and the dead
      // Reconnect button that `unavailable` exists to remove — so this is a
      // contract, not an implementation detail.
      expect(res.body?.code).toBe('VOICE_NOT_CONFIGURED');
    });
  });

  it('answers 409 VOICE_OFF for a session created with no call', async () => {
    issueVoiceToken.mockResolvedValue({ ok: false, reason: 'voice-off' });

    await withServer(async (request) => {
      const res = await request();

      expect(res.status).toBe(409);
      // Same contract as VOICE_NOT_CONFIGURED above: useVoiceRoom.ts keys its
      // quiet `unavailable` state on this exact code.
      expect(res.body?.code).toBe('VOICE_OFF');
    });
  });

  it('answers 403 NOT_A_PARTICIPANT for a non-member, saying nothing about the session', async () => {
    issueVoiceToken.mockResolvedValue({ ok: false, reason: 'not-a-participant' });

    await withServer(async (request) => {
      const res = await request();

      expect(res.status).toBe(403);
      expect(res.body?.code).toBe('NOT_A_PARTICIPANT');
      // Same answer whether the session is missing or the caller simply is not
      // in it — a different status for each would let anyone probe which
      // session ids are real.
      expect(res.body?.error).toBe('You are not a participant in this session');
    });
  });

  it('refuses an unauthenticated caller before reaching the service', async () => {
    await withServer(async (request) => {
      const res = await request('');

      expect(res.status).toBe(401);
      expect(issueVoiceToken).not.toHaveBeenCalled();
    });
  });
});

describe('POST /api/sessions/:sessionId/voice/mute', () => {
  beforeEach(() => {
    muteParticipants.mockReset();
  });

  it('mutes everyone but the leader when nobody is named', async () => {
    muteParticipants.mockResolvedValue({ ok: true, value: { muted: 3 } });

    await withServer(async (_request, post) => {
      const res = await post('voice/mute', '{}');

      expect(res.status).toBe(200);
      expect(res.body?.muted).toBe(3);
      expect(muteParticipants).toHaveBeenCalledWith('s1', 'u1', undefined);
    });
  });

  it('mutes the one person named', async () => {
    muteParticipants.mockResolvedValue({ ok: true, value: { muted: 1 } });

    await withServer(async (_request, post) => {
      const res = await post('voice/mute', JSON.stringify({ identity: 'u2' }));

      expect(res.status).toBe(200);
      expect(muteParticipants).toHaveBeenCalledWith('s1', 'u1', 'u2');
    });
  });

  it('turns away a body that names nobody properly', async () => {
    await withServer(async (_request, post) => {
      const res = await post('voice/mute', JSON.stringify({ identity: '' }));

      expect(res.status).toBe(400);
      expect(res.body?.code).toBe('VALIDATION_ERROR');
      expect(muteParticipants).not.toHaveBeenCalled();
    });
  });

  it('answers 403 NOT_SESSION_LEADER to anyone but the leader', async () => {
    muteParticipants.mockResolvedValue({ ok: false, reason: 'not-the-leader' });

    await withServer(async (_request, post) => {
      const res = await post('voice/mute', '{}');

      expect(res.status).toBe(403);
      expect(res.body?.code).toBe('NOT_SESSION_LEADER');
    });
  });

  it('answers 409 VOICE_OFF and 503 VOICE_NOT_CONFIGURED as the token route does', async () => {
    await withServer(async (_request, post) => {
      muteParticipants.mockResolvedValue({ ok: false, reason: 'voice-off' });
      const off = await post('voice/mute', '{}');
      expect(off.status).toBe(409);
      expect(off.body?.code).toBe('VOICE_OFF');

      muteParticipants.mockResolvedValue({ ok: false, reason: 'not-configured' });
      const missing = await post('voice/mute', '{}');
      expect(missing.status).toBe(503);
      expect(missing.body?.code).toBe('VOICE_NOT_CONFIGURED');
    });
  });

  // Like the sessions module's leader writes: limited before the auth check,
  // in a bucket of its own, so a flood never reaches LiveKit.
  it('turns a flood of mutes away before they reach the service', async () => {
    muteParticipants.mockResolvedValue({ ok: true, value: { muted: 0 } });

    await withServer(async (_request, post) => {
      const statuses: number[] = [];
      for (let i = 0; i < 31; i += 1) {
        statuses.push((await post('voice/mute', '{}', 'flooding-leader')).status);
      }

      expect(statuses.slice(0, 30).every((status) => status === 200)).toBe(true);
      expect(statuses.at(-1)).toBe(429);
      expect(muteParticipants).toHaveBeenCalledTimes(30);

      // Someone else's budget is their own.
      expect((await post('voice/mute', '{}', 'another-leader')).status).toBe(200);
    });
  });

  it('refuses an unauthenticated caller before reaching the service', async () => {
    await withServer(async (_request, post) => {
      const res = await post('voice/mute', '{}', '');

      expect(res.status).toBe(401);
      expect(muteParticipants).not.toHaveBeenCalled();
    });
  });
});
