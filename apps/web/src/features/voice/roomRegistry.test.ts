import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Every room built through the registry, in order. */
const built: FakeRoom[] = [];

class FakeLocalParticipant {
  isMicrophoneEnabled = false;
  readonly micCalls: boolean[] = [];

  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    this.micCalls.push(enabled);
    this.isMicrophoneEnabled = enabled;
  }
}

class FakeRoom {
  localParticipant = new FakeLocalParticipant();
  state = 'disconnected';
  disconnected = 0;

  constructor() {
    built.push(this);
  }

  async disconnect(): Promise<void> {
    this.disconnected += 1;
    this.state = 'disconnected';
  }
}

vi.mock('livekit-client', async () => {
  const actual = await vi.importActual<typeof import('livekit-client')>('livekit-client');
  return { ...actual, Room: FakeRoom };
});

const {
  DISCONNECT_GRACE_MS,
  acquireVoiceRoom,
  disconnectAllVoiceRooms,
  isVoiceRoomConnected,
  releaseVoiceRoom,
  rememberVoiceIdentity,
} = await import('./roomRegistry');

describe('voice room registry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    built.length = 0;
  });

  afterEach(() => {
    disconnectAllVoiceRooms();
    vi.useRealTimers();
  });

  it('hands the same room back when a view remounts inside the grace window', () => {
    const first = acquireVoiceRoom('s1');
    expect(first.reused).toBe(false);

    releaseVoiceRoom('s1');
    // The gap lobby -> board has to survive: a refetch, not a tick.
    vi.advanceTimersByTime(DISCONNECT_GRACE_MS - 1);
    const second = acquireVoiceRoom('s1');

    expect(second.reused).toBe(true);
    expect(second.room).toBe(first.room);
    expect(built).toHaveLength(1);

    // Re-acquiring cancels the teardown outright, not just postpones it.
    vi.advanceTimersByTime(DISCONNECT_GRACE_MS * 2);
    expect((second.room as unknown as FakeRoom).disconnected).toBe(0);
  });

  it('builds a fresh room once the old one has torn down, never resurrecting it', () => {
    const first = acquireVoiceRoom('s1');
    releaseVoiceRoom('s1');
    vi.advanceTimersByTime(DISCONNECT_GRACE_MS);

    expect((first.room as unknown as FakeRoom).disconnected).toBe(1);

    // Reconnecting a room that is mid-teardown surfaces as a participant who
    // never leaves, so a late acquire must get its own.
    const second = acquireVoiceRoom('s1');
    expect(second.reused).toBe(false);
    expect(second.room).not.toBe(first.room);
    expect(built).toHaveLength(2);
  });

  it('closes the microphone immediately on release, long before it disconnects', async () => {
    const { room } = acquireVoiceRoom('s1');
    const participant = (room as unknown as FakeRoom).localParticipant;
    await participant.setMicrophoneEnabled(true);
    participant.micCalls.length = 0;

    releaseVoiceRoom('s1');

    // Synchronously, because this is what stops the tab's recording indicator
    // and what stops a departed participant still being heard.
    expect(participant.micCalls).toEqual([false]);
    expect(participant.isMicrophoneEnabled).toBe(false);
    expect((room as unknown as FakeRoom).disconnected).toBe(0);
  });

  it('restores a mic that was live, and leaves a deliberate mute alone', async () => {
    const first = acquireVoiceRoom('s1');
    const live = (first.room as unknown as FakeRoom).localParticipant;
    await live.setMicrophoneEnabled(true);

    releaseVoiceRoom('s1');
    acquireVoiceRoom('s1');
    await vi.advanceTimersByTimeAsync(0);
    expect(live.isMicrophoneEnabled).toBe(true);

    // A mute the user chose is a preference, not damage to repair.
    await live.setMicrophoneEnabled(false);
    releaseVoiceRoom('s1');
    acquireVoiceRoom('s1');
    await vi.advanceTimersByTimeAsync(0);
    expect(live.isMicrophoneEnabled).toBe(false);
  });

  it('keeps rooms for different sessions apart', () => {
    const a = acquireVoiceRoom('s1');
    const b = acquireVoiceRoom('s2');

    expect(a.room).not.toBe(b.room);

    releaseVoiceRoom('s1');
    vi.advanceTimersByTime(DISCONNECT_GRACE_MS);

    expect((a.room as unknown as FakeRoom).disconnected).toBe(1);
    expect((b.room as unknown as FakeRoom).disconnected).toBe(0);
    expect(acquireVoiceRoom('s2').reused).toBe(true);
  });

  it('carries the identity across a reuse so no token is needed to learn it', () => {
    acquireVoiceRoom('s1');
    rememberVoiceIdentity('s1', 'user-1');

    releaseVoiceRoom('s1');
    expect(acquireVoiceRoom('s1').identity).toBe('user-1');
  });

  it('keeps the audio container in the document until the room actually goes', () => {
    const { audioContainer } = acquireVoiceRoom('s1');
    expect(audioContainer.isConnected).toBe(true);

    // Remote tracks stay attached to these elements across the gap — this is
    // what keeps sound playing while no component is mounted.
    releaseVoiceRoom('s1');
    expect(audioContainer.isConnected).toBe(true);

    vi.advanceTimersByTime(DISCONNECT_GRACE_MS);
    expect(audioContainer.isConnected).toBe(false);
  });

  it('drops everything at once for a logout', () => {
    const a = acquireVoiceRoom('s1');
    const b = acquireVoiceRoom('s2');

    disconnectAllVoiceRooms();

    expect((a.room as unknown as FakeRoom).disconnected).toBe(1);
    expect((b.room as unknown as FakeRoom).disconnected).toBe(1);
    expect(a.audioContainer.isConnected).toBe(false);
    expect(acquireVoiceRoom('s1').reused).toBe(false);
  });

  it('reports a joined room as reusable and a disconnected one as not', () => {
    const { room } = acquireVoiceRoom('s1');
    expect(isVoiceRoomConnected(room)).toBe(false);

    (room as unknown as FakeRoom).state = 'connected';
    expect(isVoiceRoomConnected(room)).toBe(true);
  });
});
