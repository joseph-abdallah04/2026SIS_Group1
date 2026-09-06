import { beforeEach, describe, expect, it, vi } from 'vitest';

// Presence and the join check are the interesting parts here, not Prisma, JWT
// signing or the pinboard module — all stubbed so the room/dedup logic and the
// authenticate-then-authorise order can be exercised directly.
const getSession = vi.fn();
const getSessionMemberIdentity = vi.fn();
const getBoardForSession = vi.fn();

// Stands in for real JWT verification: `token-<userId>` verifies as that user,
// anything else is rejected the way a tampered or expired token would be. The
// signing itself is covered by the auth module's own tests.
const verifyToken = vi.fn((token: string) =>
  token.startsWith('token-')
    ? { ok: true as const, userId: token.slice('token-'.length) }
    : { ok: false as const, code: 'INVALID_TOKEN' as const },
);

vi.mock('../modules/auth/index.js', () => ({ verifyToken }));
vi.mock('../modules/pinboard/index.js', () => ({
  getBoardForSession,
  registerPinboardSocketHandlers: vi.fn(),
}));
vi.mock('../modules/sessions/index.js', () => ({ getSession, getSessionMemberIdentity }));

const { registerRealtimeGateway } = await import('./gateway.js');

interface FakeSocket {
  id: string;
  data: { user: { id: string; displayName: string } | null; sessionId: string | null };
  handshake: { auth: { token?: string } };
  emit: ReturnType<typeof vi.fn>;
  to: (room: string) => { emit: (event: string, payload: unknown) => void };
  join: (room: string) => Promise<void>;
  leave: (room: string) => Promise<void>;
  listeners: Map<string, (...args: never[]) => unknown>;
  on: (event: string, cb: (...args: never[]) => unknown) => void;
}

/**
 * The minimum of Socket.IO's room bookkeeping the gateway relies on:
 * `io.in(room).fetchSockets()` reads from the same `rooms` map that
 * `socket.join`/`socket.leave` write to, and broadcast emits are recorded
 * instead of sent anywhere.
 */
function createFakeIo() {
  const rooms = new Map<string, Set<FakeSocket>>();
  const broadcasts: { room: string; event: string; payload: unknown }[] = [];
  let nextId = 0;
  let connectionHandler: ((socket: FakeSocket) => void) | null = null;

  function roomSet(room: string): Set<FakeSocket> {
    if (!rooms.has(room)) rooms.set(room, new Set());
    return rooms.get(room) as Set<FakeSocket>;
  }

  const io = {
    on(event: string, handler: (socket: FakeSocket) => void) {
      if (event === 'connection') connectionHandler = handler;
    },
    in(room: string) {
      return { fetchSockets: async () => [...roomSet(room)] };
    },
  };

  /** `connect('u1')` is a socket holding a valid token for user `u1`. */
  function connect(userId?: string, rawToken?: string): FakeSocket {
    const id = `socket-${nextId++}`;
    const listeners = new Map<string, (...args: never[]) => unknown>();
    const token = rawToken ?? (userId ? `token-${userId}` : undefined);
    const socket: FakeSocket = {
      id,
      data: { user: null, sessionId: null },
      handshake: { auth: token ? { token } : {} },
      emit: vi.fn(),
      to(room: string) {
        return { emit: (event: string, payload: unknown) => broadcasts.push({ room, event, payload }) };
      },
      async join(room: string) {
        roomSet(room).add(socket);
      },
      async leave(room: string) {
        roomSet(room).delete(socket);
      },
      listeners,
      on(event: string, cb: (...args: never[]) => unknown) {
        listeners.set(event, cb);
      },
    };
    connectionHandler?.(socket);
    return socket;
  }

  /** Mirrors real Socket.IO: by the time `disconnect` fires, rooms are already left. */
  function disconnect(socket: FakeSocket) {
    if (socket.data.sessionId) roomSet(`session:${socket.data.sessionId}`).delete(socket);
    socket.listeners.get('disconnect')?.();
  }

  return { io, connect, disconnect, broadcasts };
}

function memberJoinAck(socket: FakeSocket, sessionId: string) {
  return new Promise<{ ok: boolean; error?: string }>((resolve) => {
    const handler = socket.listeners.get('memberJoin') as (
      payload: { sessionId: string },
      ack: (res: { ok: boolean; error?: string }) => void,
    ) => void;
    handler({ sessionId }, resolve);
  });
}

function memberLeaveAck(socket: FakeSocket, sessionId: string) {
  return new Promise<{ ok: boolean; error?: string }>((resolve) => {
    const handler = socket.listeners.get('memberLeave') as (
      payload: { sessionId: string },
      ack: (res: { ok: boolean; error?: string }) => void,
    ) => void;
    handler({ sessionId }, resolve);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyToken.mockImplementation((token: string) =>
    token.startsWith('token-')
      ? { ok: true as const, userId: token.slice('token-'.length) }
      : { ok: false as const, code: 'INVALID_TOKEN' as const },
  );
  getSession.mockResolvedValue({ id: 's1', title: 'Roadmap', status: 'lobby', leaderId: 'leader-1' });
  getSessionMemberIdentity.mockImplementation(async (_sessionId: string, userId: string) => ({
    id: userId,
    displayName: `User ${userId}`,
  }));
  getBoardForSession.mockResolvedValue({
    sessionId: 's1',
    sessionTitle: 'Roadmap',
    questionId: null,
    questionText: null,
    questionPosition: null,
    questionStatus: null,
    items: [],
  });
});

// Two independent gates, and the tests below pin both: the token decides who
// you are, membership decides whether you may be in this room. Neither is
// allowed to stand in for the other.
describe('join authentication', () => {
  it('refuses a socket with no handshake token', async () => {
    const { io, connect } = createFakeIo();
    registerRealtimeGateway(io as never);

    expect(await memberJoinAck(connect(), 's1')).toMatchObject({ ok: false });
    expect(getSessionMemberIdentity).not.toHaveBeenCalled();
  });

  it('refuses a token that does not verify, without consulting membership', async () => {
    const { io, connect } = createFakeIo();
    registerRealtimeGateway(io as never);

    expect(await memberJoinAck(connect(undefined, 'tampered'), 's1')).toMatchObject({ ok: false });
    expect(getSessionMemberIdentity).not.toHaveBeenCalled();
  });

  // Authentication is not authorisation: a perfectly good token for someone who
  // never joined this session must not get them into its room.
  it('refuses a verified user who is not a member of the session', async () => {
    const { io, connect } = createFakeIo();
    registerRealtimeGateway(io as never);
    getSessionMemberIdentity.mockResolvedValue(null);

    expect(await memberJoinAck(connect('outsider'), 's1')).toMatchObject({ ok: false });
  });

  it('identifies the socket from the token, never from the payload', async () => {
    const { io, connect } = createFakeIo();
    registerRealtimeGateway(io as never);

    const socket = connect('u1');
    expect(await memberJoinAck(socket, 's1')).toMatchObject({ ok: true });
    expect(getSessionMemberIdentity).toHaveBeenCalledWith('s1', 'u1');
    expect(socket.data.user?.id).toBe('u1');
  });
});

describe('presence dedup', () => {
  it('two sockets for one user render as one participant in the snapshot', async () => {
    const { io, connect } = createFakeIo();
    registerRealtimeGateway(io as never);

    const tab1 = connect('u1');
    await memberJoinAck(tab1, 's1');
    const tab2 = connect('u1');
    await memberJoinAck(tab2, 's1');

    const snapshot = tab2.emit.mock.calls.find(([event]) => event === 'sessionState')?.[1] as {
      participants: { id: string }[];
    };
    expect(snapshot.participants).toHaveLength(1);
    expect(snapshot.participants[0]?.id).toBe('u1');
  });

  it('does not re-broadcast memberJoined when the same socket joins again', async () => {
    const { io, connect, broadcasts } = createFakeIo();
    registerRealtimeGateway(io as never);

    const socket = connect('u1');
    await memberJoinAck(socket, 's1');
    broadcasts.length = 0;

    await memberJoinAck(socket, 's1');

    expect(broadcasts.some((b) => b.event === 'memberJoined')).toBe(false);
  });

  it('does not re-broadcast memberJoined for a second socket already present', async () => {
    const { io, connect, broadcasts } = createFakeIo();
    registerRealtimeGateway(io as never);

    const tab1 = connect('u1');
    await memberJoinAck(tab1, 's1');
    broadcasts.length = 0; // only interested in what tab2's join causes

    const tab2 = connect('u1');
    await memberJoinAck(tab2, 's1');

    expect(broadcasts.some((b) => b.event === 'memberJoined')).toBe(false);
  });

  it('closing one of two tabs emits no memberLeft — a second tab closing is not the user leaving', async () => {
    const { io, connect, disconnect, broadcasts } = createFakeIo();
    registerRealtimeGateway(io as never);

    const tab1 = connect('u1');
    await memberJoinAck(tab1, 's1');
    const tab2 = connect('u1');
    await memberJoinAck(tab2, 's1');

    broadcasts.length = 0;
    disconnect(tab1);
    await new Promise((r) => setTimeout(r, 0)); // let the async disconnect handler run

    expect(broadcasts.some((b) => b.event === 'memberLeft')).toBe(false);
  });

  it('closing the last tab for a user does emit memberLeft', async () => {
    const { io, connect, disconnect, broadcasts } = createFakeIo();
    registerRealtimeGateway(io as never);

    const tab1 = connect('u1');
    await memberJoinAck(tab1, 's1');

    broadcasts.length = 0;
    disconnect(tab1);
    await new Promise((r) => setTimeout(r, 0));

    const left = broadcasts.find((b) => b.event === 'memberLeft');
    expect(left).toBeDefined();
    expect((left?.payload as { user: { id: string } }).user.id).toBe('u1');
  });
});

describe('memberLeave', () => {
  it('emits memberLeft when the last socket for a user leaves the room', async () => {
    const { io, connect, broadcasts } = createFakeIo();
    registerRealtimeGateway(io as never);

    const socket = connect('u1');
    await memberJoinAck(socket, 's1');

    broadcasts.length = 0;
    expect(await memberLeaveAck(socket, 's1')).toMatchObject({ ok: true });
    expect(socket.data.sessionId).toBeNull();

    const left = broadcasts.find((b) => b.event === 'memberLeft');
    expect(left).toBeDefined();
    expect((left?.payload as { user: { id: string } }).user.id).toBe('u1');
  });

  it('does not emit memberLeft when a second tab is still in the room', async () => {
    const { io, connect, broadcasts } = createFakeIo();
    registerRealtimeGateway(io as never);

    const tab1 = connect('u1');
    await memberJoinAck(tab1, 's1');
    const tab2 = connect('u1');
    await memberJoinAck(tab2, 's1');

    broadcasts.length = 0;
    expect(await memberLeaveAck(tab1, 's1')).toMatchObject({ ok: true });
    expect(broadcasts.some((b) => b.event === 'memberLeft')).toBe(false);
  });

  it('is a no-op when this socket is not in that session', async () => {
    const { io, connect, broadcasts } = createFakeIo();
    registerRealtimeGateway(io as never);

    const socket = connect('u1');
    await memberJoinAck(socket, 's1');

    broadcasts.length = 0;
    expect(await memberLeaveAck(socket, 'other')).toMatchObject({ ok: true });
    expect(socket.data.sessionId).toBe('s1');
    expect(broadcasts.some((b) => b.event === 'memberLeft')).toBe(false);
  });
});
