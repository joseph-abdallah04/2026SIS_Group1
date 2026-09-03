import { beforeEach, describe, expect, it, vi } from 'vitest';

// Presence is the interesting part here, not Prisma or the pinboard module —
// both are stubbed so the room/dedup logic can be exercised directly.
const getSession = vi.fn();
const getSessionMemberIdentity = vi.fn();
const getBoardForSession = vi.fn();

vi.mock('../env.js', () => ({ env: { NODE_ENV: 'test' } }));
vi.mock('../modules/pinboard/index.js', () => ({
  getBoardForSession,
  registerPinboardSocketHandlers: vi.fn(),
}));
vi.mock('../modules/sessions/index.js', () => ({ getSession, getSessionMemberIdentity }));

const { registerRealtimeGateway } = await import('./gateway.js');

interface FakeSocket {
  id: string;
  data: { user: { id: string; displayName: string } | null; sessionId: string | null };
  handshake: { auth: { devUserId?: string } };
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

  function connect(devUserId?: string): FakeSocket {
    const id = `socket-${nextId++}`;
    const listeners = new Map<string, (...args: never[]) => unknown>();
    const socket: FakeSocket = {
      id,
      data: { user: null, sessionId: null },
      handshake: { auth: devUserId ? { devUserId } : {} },
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

beforeEach(() => {
  vi.clearAllMocks();
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
