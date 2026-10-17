import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerError, TokenVerifier, TrackSource } from 'livekit-server-sdk';

// `sessionsAdapter` is mocked, so `db.js` — and with it a real Prisma client —
// is never loaded: these tests are about who gets a token and what is in it,
// not about Prisma. Membership itself is a `findUnique` on a unique index and
// is covered by the integration smoke test (docs/05 §10).
const { findSession, findSessionParticipant, isSessionVoiceEnabled } = vi.hoisted(() => ({
  findSession: vi.fn(),
  findSessionParticipant: vi.fn(),
  isSessionVoiceEnabled: vi.fn(),
}));
vi.mock('./sessionsAdapter.js', () => ({
  findSession,
  findSessionParticipant,
  isSessionVoiceEnabled,
}));

// LiveKit's room API, faked: the rest of the SDK stays real, so tokens are
// still signed and verified for real above.
const { liveKitRooms } = vi.hoisted(() => ({
  liveKitRooms: {
    host: '',
    listParticipants: vi.fn(),
    mutePublishedTrack: vi.fn(),
  },
}));
vi.mock('livekit-server-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('livekit-server-sdk')>()),
  RoomServiceClient: class {
    constructor(host: string) {
      liveKitRooms.host = host;
    }
    listParticipants = liveKitRooms.listParticipants;
    mutePublishedTrack = liveKitRooms.mutePublishedTrack;
  },
}));

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    NODE_ENV: 'test',
    LIVEKIT_URL: 'wss://roundtable.livekit.cloud',
    LIVEKIT_API_KEY: 'APItestkey',
    LIVEKIT_API_SECRET: 'test-secret-at-least-32-characters-long',
  } as Record<string, string | undefined>,
}));
vi.mock('../../env.js', () => ({ env: mockEnv }));

const { issueVoiceToken, isVoiceConfigured, muteParticipants, TOKEN_TTL_SECONDS } =
  await import('./service.js');

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
  // A live-call session unless a test says otherwise.
  isSessionVoiceEnabled.mockResolvedValue(true);
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

  it('refuses a member of a session created with no call, so it never costs LiveKit minutes', async () => {
    findSessionParticipant.mockResolvedValue(ALICE);
    isSessionVoiceEnabled.mockResolvedValue(false);

    const result = await issueVoiceToken('sess_1', 'user_alice');

    expect(result).toEqual({ ok: false, reason: 'voice-off' });
    expect(isSessionVoiceEnabled).toHaveBeenCalledWith('sess_1');
  });

  it('tells a non-member of a no-call session only that they are not a member', async () => {
    // Checked in this order so an outsider cannot learn whether a session
    // has a call.
    findSessionParticipant.mockResolvedValue(null);
    isSessionVoiceEnabled.mockResolvedValue(false);

    const result = await issueVoiceToken('sess_1', 'user_stranger');

    expect(result).toEqual({ ok: false, reason: 'not-a-member' });
    expect(isSessionVoiceEnabled).not.toHaveBeenCalled();
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

describe('muteParticipants', () => {
  const LEADER = 'user_lead';

  /** A participant as LiveKit lists one: its tracks, and whether each is muted. */
  function inRoom(
    identity: string,
    tracks: { sid: string; source: TrackSource; muted: boolean }[],
  ) {
    return { identity, tracks };
  }
  const mic = (sid: string, muted = false) => ({ sid, source: TrackSource.MICROPHONE, muted });

  beforeEach(() => {
    findSession.mockResolvedValue({ id: 'sess_1', leaderId: LEADER });
    liveKitRooms.listParticipants.mockResolvedValue([
      inRoom(LEADER, [mic('TR_lead')]),
      inRoom('user_alice', [mic('TR_alice')]),
      inRoom('user_bob', [mic('TR_bob', true)]),
      inRoom('user_cara', [mic('TR_cara')]),
    ]);
    liveKitRooms.mutePublishedTrack.mockResolvedValue({});
  });

  it("mutes everyone's live microphone but the leader's", async () => {
    const result = await muteParticipants('sess_1', LEADER);

    expect(result).toEqual({ ok: true, value: { muted: 2 } });
    expect(liveKitRooms.listParticipants).toHaveBeenCalledWith('session-sess_1');
    expect(liveKitRooms.mutePublishedTrack.mock.calls).toEqual([
      ['session-sess_1', 'user_alice', 'TR_alice', true],
      ['session-sess_1', 'user_cara', 'TR_cara', true],
    ]);
  });

  it('mutes only the person named', async () => {
    const result = await muteParticipants('sess_1', LEADER, 'user_cara');

    expect(result).toEqual({ ok: true, value: { muted: 1 } });
    expect(liveKitRooms.mutePublishedTrack.mock.calls).toEqual([
      ['session-sess_1', 'user_cara', 'TR_cara', true],
    ]);
  });

  it('counts nobody when the one named is already muted, and does not call LiveKit for them', async () => {
    const result = await muteParticipants('sess_1', LEADER, 'user_bob');

    expect(result).toEqual({ ok: true, value: { muted: 0 } });
    expect(liveKitRooms.mutePublishedTrack).not.toHaveBeenCalled();
  });

  it('mutes nobody when the leader names themselves', async () => {
    const result = await muteParticipants('sess_1', LEADER, LEADER);

    expect(result).toEqual({ ok: true, value: { muted: 0 } });
    expect(liveKitRooms.mutePublishedTrack).not.toHaveBeenCalled();
  });

  it('still mutes everyone else when someone leaves before their mute lands', async () => {
    liveKitRooms.mutePublishedTrack.mockImplementation(async (_room: string, who: string) => {
      if (who === 'user_alice') {
        throw new ServerError('not_found', 'participant not found', 404, 'not_found');
      }
      return {};
    });

    const result = await muteParticipants('sess_1', LEADER);

    expect(result).toEqual({ ok: true, value: { muted: 1 } });
    expect(liveKitRooms.mutePublishedTrack).toHaveBeenCalledTimes(2);
  });

  it('fails on any other LiveKit error, but only after trying everyone', async () => {
    liveKitRooms.mutePublishedTrack.mockImplementation(async (_room: string, who: string) => {
      if (who === 'user_alice') throw new ServerError('unavailable', 'upstream down', 503);
      return {};
    });

    await expect(muteParticipants('sess_1', LEADER)).rejects.toThrow('upstream down');
    expect(liveKitRooms.mutePublishedTrack.mock.calls.map((call) => call[1])).toEqual([
      'user_alice',
      'user_cara',
    ]);
  });

  it('only ever mutes, and leaves anything but microphones alone', async () => {
    liveKitRooms.listParticipants.mockResolvedValue([
      inRoom('user_alice', [{ sid: 'TR_screen', source: TrackSource.SCREEN_SHARE, muted: false }]),
    ]);

    await muteParticipants('sess_1', LEADER);

    expect(liveKitRooms.mutePublishedTrack).not.toHaveBeenCalled();
  });

  it('refuses anyone but the leader, and a session that does not exist, alike', async () => {
    await expect(muteParticipants('sess_1', 'user_alice')).resolves.toEqual({
      ok: false,
      reason: 'not-the-leader',
    });

    findSession.mockResolvedValue(null);
    await expect(muteParticipants('sess_missing', LEADER)).resolves.toEqual({
      ok: false,
      reason: 'not-the-leader',
    });
    expect(liveKitRooms.listParticipants).not.toHaveBeenCalled();
  });

  it('refuses a session created with no call', async () => {
    isSessionVoiceEnabled.mockResolvedValue(false);

    await expect(muteParticipants('sess_1', LEADER)).resolves.toEqual({
      ok: false,
      reason: 'voice-off',
    });
    expect(liveKitRooms.listParticipants).not.toHaveBeenCalled();
  });

  it('reports missing LiveKit credentials before touching the database', async () => {
    mockEnv.LIVEKIT_API_KEY = undefined;

    await expect(muteParticipants('sess_1', LEADER)).resolves.toEqual({
      ok: false,
      reason: 'not-configured',
    });
    expect(findSession).not.toHaveBeenCalled();
  });

  it('mutes nobody when nobody has joined the call yet, so LiveKit has no room', async () => {
    liveKitRooms.listParticipants.mockRejectedValue(
      new ServerError('not_found', 'requested room does not exist', 404, 'not_found'),
    );

    await expect(muteParticipants('sess_1', LEADER)).resolves.toEqual({
      ok: true,
      value: { muted: 0 },
    });
  });

  it('lets any other LiveKit failure through to the error handler', async () => {
    liveKitRooms.listParticipants.mockRejectedValue(
      new ServerError('unavailable', 'upstream down', 503, 'unavailable'),
    );

    await expect(muteParticipants('sess_1', LEADER)).rejects.toThrow('upstream down');
  });

  it('talks to the LiveKit server the clients connect to', async () => {
    await muteParticipants('sess_1', LEADER);

    expect(liveKitRooms.host).toBe('wss://roundtable.livekit.cloud');
  });
});
