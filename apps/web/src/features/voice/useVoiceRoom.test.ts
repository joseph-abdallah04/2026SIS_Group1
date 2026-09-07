import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * How the next `getUserMedia` behaves. Module-level rather than per-room so a
 * test can refuse the microphone *before* mounting — the hook acquires it a
 * microtask after connecting, which is too soon to reach in from outside.
 */
let acquireError: Error | null = null;

/** A refused permission prompt, as the browser throws it. */
function refusal(): Error {
  return Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
}

/**
 * A LiveKit room, reduced to the parts F12 turns on: whether a microphone
 * track exists, and whether it is muted. Everything else the hook touches is
 * the real SDK — the enums it compares against are not worth faking wrong.
 */
class FakeLocalParticipant {
  identity = 'user-1';
  name = 'Ada';
  isLocal = true;
  isSpeaking = false;
  /** A track has been acquired and published; survives muting. */
  published = false;
  muted = false;
  readonly calls: boolean[] = [];
  /** Make the next call reject without changing the track's state. */
  failNext: Error | null = null;
  /** Make the next call hang, as an open permission prompt does. */
  private hanging: (() => void) | null = null;
  hangNext = false;

  /** Let a hung call finish. */
  release(): void {
    const resume = this.hanging;
    this.hanging = null;
    resume?.();
  }

  get isMicrophoneEnabled(): boolean {
    return this.published && !this.muted;
  }

  getTrackPublication(): object | undefined {
    return this.published ? {} : undefined;
  }

  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    this.calls.push(enabled);
    if (this.hangNext) {
      this.hangNext = false;
      await new Promise<void>((resolve) => {
        this.hanging = resolve;
      });
    }
    const failure = this.failNext;
    if (failure) {
      this.failNext = null;
      throw failure;
    }
    if (enabled && !this.published) {
      if (acquireError) throw acquireError;
      this.published = true;
    }
    this.muted = !enabled;
  }
}

class FakeRoom {
  static last: FakeRoom | null = null;
  localParticipant = new FakeLocalParticipant();
  remoteParticipants = new Map<string, never>();
  canPlaybackAudio = true;
  private handlers = new Map<string, Set<(...args: unknown[]) => void>>();

  constructor() {
    FakeRoom.last = this;
  }

  on(event: string, handler: (...args: unknown[]) => void): this {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler);
    this.handlers.set(event, set);
    return this;
  }

  removeAllListeners(): void {
    this.handlers.clear();
  }

  emit(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async startAudio(): Promise<void> {}
}

vi.mock('livekit-client', async () => {
  const actual = await vi.importActual<typeof import('livekit-client')>('livekit-client');
  return { ...actual, Room: FakeRoom };
});

vi.mock('./voiceApi', () => ({
  fetchVoiceToken: vi.fn(async () => ({
    token: 'jwt',
    url: 'wss://example.invalid',
    identity: 'user-1',
    roomName: 'session-session-1',
    expiresInSeconds: 900,
  })),
}));

// Imported after the mock factory, not statically: a top-level
// `import ... from 'livekit-client'` runs the hoisted factory above before
// `FakeRoom` is initialised.
const { DisconnectReason, RoomEvent } = await import('livekit-client');
const { useVoiceRoom } = await import('./useVoiceRoom');

/** Mount the hook and wait for the join to settle. */
async function joinRoom() {
  const view = renderHook(() => useVoiceRoom('session-1'));
  await waitFor(() => expect(view.result.current.status).toBe('connected'));
  return view;
}

describe('useVoiceRoom mute (F12)', () => {
  beforeEach(() => {
    localStorage.clear();
    FakeRoom.last = null;
    acquireError = null;
  });

  /** Let pending timers and promises run for `ms`. */
  async function elapse(ms: number) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('joins unmuted and publishing, for someone who has never muted here', async () => {
    const view = await joinRoom();

    await waitFor(() => expect(view.result.current.micEnabled).toBe(true));
    expect(view.result.current.micStatus).toBe('live');
    expect(FakeRoom.last?.localParticipant.calls).toEqual([true]);
  });

  it('mutes the published track, so audio stops reaching the room at once', async () => {
    const view = await joinRoom();
    await waitFor(() => expect(view.result.current.micEnabled).toBe(true));

    await act(async () => {
      await view.result.current.toggleMic();
    });

    expect(FakeRoom.last?.localParticipant.calls).toEqual([true, false]);
    expect(view.result.current.micEnabled).toBe(false);
    // Still holding the device: muted is not the same as gone, and unmuting
    // has to be instant.
    expect(view.result.current.micStatus).toBe('live');
  });

  it('comes back muted after a refresh, without reopening the microphone', async () => {
    const first = await joinRoom();
    await waitFor(() => expect(first.result.current.micEnabled).toBe(true));
    await act(async () => {
      await first.result.current.toggleMic();
    });
    first.unmount();

    const second = await joinRoom();

    await waitFor(() => expect(second.result.current.micStatus).toBe('idle'));
    expect(second.result.current.micEnabled).toBe(false);
    // The whole point of `idle` here: no `getUserMedia`, so no recording
    // indicator and no permission prompt for someone who chose silence.
    expect(FakeRoom.last?.localParticipant.calls).toEqual([]);
  });

  it('unmutes after a muted rejoin by acquiring the device it never opened', async () => {
    localStorage.setItem('rt_mic_muted:session-1:user-1', '1');
    const view = await joinRoom();
    await waitFor(() => expect(view.result.current.micStatus).toBe('idle'));

    await act(async () => {
      await view.result.current.toggleMic();
    });

    expect(FakeRoom.last?.localParticipant.calls).toEqual([true]);
    expect(view.result.current.micEnabled).toBe(true);
    expect(view.result.current.micStatus).toBe('live');
    expect(localStorage.getItem('rt_mic_muted:session-1:user-1')).toBeNull();
  });

  it('works for someone who joined with the mic blocked and allowed it afterwards', async () => {
    acquireError = refusal();
    const view = await joinRoom();
    await waitFor(() => expect(view.result.current.micStatus).toBe('blocked'));
    expect(view.result.current.micEnabled).toBe(false);

    // Permission granted in the browser's own settings; the toggle is the way
    // back in, and it must not assume a published track exists.
    acquireError = null;
    await act(async () => {
      await view.result.current.toggleMic();
    });

    expect(view.result.current.micEnabled).toBe(true);
    expect(view.result.current.micStatus).toBe('live');
  });

  it('does not call a failed mute a blocked microphone', async () => {
    const view = await joinRoom();
    await waitFor(() => expect(view.result.current.micEnabled).toBe(true));
    const participant = FakeRoom.last!.localParticipant;

    // `mute()` waits on a lock and a republish; either can throw mid-reconnect.
    participant.failNext = new Error('republish failed');
    await act(async () => {
      await view.result.current.toggleMic();
    });

    // The mic never stopped being live, and nobody should be told otherwise.
    expect(view.result.current.micStatus).toBe('live');
    expect(view.result.current.micEnabled).toBe(true);
    expect(localStorage.getItem('rt_mic_muted:session-1:user-1')).toBeNull();
  });

  it('resyncs the toggle from the room when a mic call fails', async () => {
    const view = await joinRoom();
    await waitFor(() => expect(view.result.current.micEnabled).toBe(true));
    const participant = FakeRoom.last!.localParticipant;

    // The track goes quiet underneath us — a device unplugged, a track ended —
    // without an event we are listening for, so `micEnabled` is now stale.
    participant.muted = true;
    participant.failNext = refusal();

    await act(async () => {
      await view.result.current.toggleMic();
    });

    // The failure is the last word on this, and it must not leave the button
    // claiming "Mic on" for someone nobody can hear: no track event fires on
    // a failure, so nothing else would ever correct it.
    expect(view.result.current.micStatus).toBe('blocked');
    expect(view.result.current.micEnabled).toBe(false);
  });

  it('honours a toggle that was still settling when the connection dropped', async () => {
    const view = await joinRoom();
    await waitFor(() => expect(view.result.current.micEnabled).toBe(true));
    const participant = FakeRoom.last!.localParticipant;

    // A toggle the user started, still open — a permission prompt, say.
    participant.hangNext = true;
    act(() => {
      void view.result.current.toggleMic();
    });
    const callsBeforeDrop = participant.calls.length;

    // The connection drops under it and the retry chain reconnects.
    act(() => {
      FakeRoom.last!.emit(RoomEvent.Disconnected, DisconnectReason.SIGNAL_CLOSE);
    });
    await elapse(700);
    expect(view.result.current.status).toBe('connected');

    // Still nothing new: the join path is waiting the settling toggle out
    // rather than being turned away by its guard.
    expect(participant.calls.length).toBe(callsBeforeDrop);

    await act(async () => {
      participant.release();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    // Having waited, it applies this connection's own mic state — which is
    // the mute the user asked for, carried across the reconnect rather than
    // lost with the connection it was issued against.
    expect(participant.calls.length).toBeGreaterThan(callsBeforeDrop);
    expect(participant.calls.at(-1)).toBe(false);
    expect(view.result.current.micEnabled).toBe(false);
    expect(localStorage.getItem('rt_mic_muted:session-1:user-1')).toBe('1');
  });

  it('does not remember a mute that a refused prompt caused', async () => {
    acquireError = refusal();
    const view = await joinRoom();

    await waitFor(() => expect(view.result.current.micStatus).toBe('blocked'));

    expect(localStorage.getItem('rt_mic_muted:session-1:user-1')).toBeNull();
  });
});
