import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenVerifier } from 'livekit-server-sdk';

// `sessionsAdapter` is mocked, so `db.js` — and with it a real Prisma client —
// is never loaded: these tests are about who gets a token and what is in it,
// not about Prisma. Membership itself is a `findUnique` on a unique index and
// is covered by the integration smoke test (docs/05 §10).
const { findSessionParticipant } = vi.hoisted(() => ({
  findSessionParticipant: vi.fn(),
}));
vi.mock('./sessionsAdapter.js', () => ({ findSessionParticipant }));

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    NODE_ENV: 'test',
    LIVEKIT_URL: 'wss://roundtable.livekit.cloud',
    LIVEKIT_API_KEY: 'APItestkey',
    LIVEKIT_API_SECRET: 'test-secret-at-least-32-characters-long',
  } as Record<string, string | undefined>,
}));
vi.mock('../../env.js', () => ({ env: mockEnv }));

const { issueVoiceToken, isVoiceConfigured, TOKEN_TTL_SECONDS } = await import('./service.js');

const ALICE = { id: 'user_alice', displayName: 'Alice' };

/** Verifies the signature too — a token signed with the wrong secret fails here. */
async function claims(token: string) {
  return new TokenVerifier(mockEnv.LIVEKIT_API_KEY!, mockEnv.LIVEKIT_API_SECRET!).verify(token);
}

/** JWT registered claims (`exp`, `nbf`), which `TokenVerifier` does not return. */
function decodePayload(token: string): { exp: number; nbf: number } {
  const payload = token.split('.')[1] ?? '';
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    exp: number;
    nbf: number;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.LIVEKIT_URL = 'wss://roundtable.livekit.cloud';
  mockEnv.LIVEKIT_API_KEY = 'APItestkey';
  mockEnv.LIVEKIT_API_SECRET = 'test-secret-at-least-32-characters-long';
});

describe('issueVoiceToken', () => {
  it('refuses someone who is not a member of the session (F11 — "someone not in the session cannot obtain a token")', async () => {
    findSessionParticipant.mockResolvedValue(null);

    const result = await issueVoiceToken('sess_1', 'user_stranger');

    expect(result).toEqual({ ok: false, reason: 'not-a-member' });
  });

  it('checks membership against the session being asked for, not any session', async () => {
    findSessionParticipant.mockResolvedValue(ALICE);

    await issueVoiceToken('sess_1', 'user_alice');

    expect(findSessionParticipant).toHaveBeenCalledWith('sess_1', 'user_alice');
  });

  it('issues a token scoped to that session room for a member', async () => {
    findSessionParticipant.mockResolvedValue(ALICE);

    const result = await issueVoiceToken('sess_1', 'user_alice');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toMatchObject({
      url: 'wss://roundtable.livekit.cloud',
      identity: 'user_alice',
      roomName: 'session-sess_1',
      expiresInSeconds: TOKEN_TTL_SECONDS,
    });

    const grants = await claims(result.value.token);
    expect(grants.video?.room).toBe('session-sess_1');
    expect(grants.video?.roomJoin).toBe(true);
    expect(grants.sub).toBe('user_alice');
  });

  it('mints the display name into the token so F13 cannot be told a name by the client', async () => {
    findSessionParticipant.mockResolvedValue(ALICE);

    const result = await issueVoiceToken('sess_1', 'user_alice');
    if (!result.ok) throw new Error('expected a token');

    const grants = await claims(result.value.token);
    expect(grants.name).toBe('Alice');
    expect(grants.video?.canUpdateOwnMetadata).toBeFalsy();
  });

  it('grants microphone only — no camera, no screen share, no data (F11: audio only)', async () => {
    findSessionParticipant.mockResolvedValue(ALICE);

    const result = await issueVoiceToken('sess_1', 'user_alice');
    if (!result.ok) throw new Error('expected a token');

    const grants = await claims(result.value.token);
    expect(grants.video?.canPublish).toBe(true);
    expect(grants.video?.canSubscribe).toBe(true);
    expect(grants.video?.canPublishSources).toEqual(['microphone']);
    expect(grants.video?.canPublishData).toBeFalsy();
  });

  it('expires quickly rather than lasting the day (F11: "short-lived")', async () => {
    findSessionParticipant.mockResolvedValue(ALICE);

    const result = await issueVoiceToken('sess_1', 'user_alice');
    if (!result.ok) throw new Error('expected a token');

    // `exp`/`iat` are JWT registered claims rather than LiveKit grants, so they
    // are read off the payload; the signature is verified separately above.
    const { exp, nbf } = decodePayload(result.value.token);

    expect(exp - nbf).toBe(TOKEN_TTL_SECONDS);
    expect(TOKEN_TTL_SECONDS).toBeLessThanOrEqual(60 * 60);
  });

  it('reports missing LiveKit credentials as a server fault, not a permission problem', async () => {
    findSessionParticipant.mockResolvedValue(ALICE);
    mockEnv.LIVEKIT_API_SECRET = undefined;

    expect(isVoiceConfigured()).toBe(false);
    await expect(issueVoiceToken('sess_1', 'user_alice')).resolves.toEqual({
      ok: false,
      reason: 'not-configured',
    });
  });

  it('does not reach the database when voice is unconfigured', async () => {
    mockEnv.LIVEKIT_URL = undefined;

    await issueVoiceToken('sess_1', 'user_alice');

    expect(findSessionParticipant).not.toHaveBeenCalled();
  });
});
