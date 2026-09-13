import { ConnectionState, Room } from 'livekit-client';

/**
 * How long a released room is kept alive waiting to be re-acquired.
 *
 * `lib/socket.ts` solves the same problem — the waiting room unmounts when the
 * session starts and the board mounts for the same room — by deferring its
 * leave one macrotask. That is enough there and nowhere near enough here:
 * lobby → board is not a synchronous remount. `useSessionDetail.reload()`
 * blanks the session, the router renders "Loading session…", and the board
 * only mounts once a **network refetch** resolves. A zero-delay teardown fires
 * long before that.
 *
 * Three seconds is ~100x a local round-trip, so it covers a refetch far slower
 * than anything a developer will see, and overshooting it is safe: the room is
 * simply rebuilt, which is exactly the behaviour we had before this file
 * existed. The cost of a longer window is a departed participant lingering in
 * everyone else's roster — muted, because `releaseVoiceRoom` mutes
 * synchronously, but still listed — so it is deliberately not generous.
 */
export const DISCONNECT_GRACE_MS = 3_000;

interface Entry {
  room: Room;
  /**
   * Remote `<audio>` elements live here. It has to outlive the hook alongside
   * the room: tracks stay attached to these elements across the gap, and that
   * is what actually keeps sound playing while no component is mounted.
   */
  audioContainer: HTMLDivElement;
  teardown?: ReturnType<typeof setTimeout>;
  /**
   * The server-minted identity from the token, kept so a reused room does not
   * have to re-fetch one just to know which `micPreference` key is its own.
   */
  identity: string | null;
  /** Whether the mic was on when released, so re-acquiring can restore it. */
  micWasEnabled: boolean;
}

const rooms = new Map<string, Entry>();

export interface AcquiredVoiceRoom {
  room: Room;
  audioContainer: HTMLDivElement;
  /** True when this room was still alive from a previous mount. */
  reused: boolean;
  identity: string | null;
}

function createEntry(sessionId: string): Entry {
  const room = new Room({
    // Audio only (F11): no adaptive stream or dynacast, both video concerns.
    audioCaptureDefaults: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  // Remote audio needs an element in the document to actually play. Kept in a
  // hidden container, so no caller has to remember to render one — forgetting
  // it is a silent "nobody can hear anyone" bug.
  const audioContainer = document.createElement('div');
  audioContainer.style.display = 'none';
  audioContainer.setAttribute('data-rt-voice-audio', sessionId);
  document.body.appendChild(audioContainer);

  return { room, audioContainer, identity: null, micWasEnabled: false };
}

/**
 * The room for this session, reused if one is still alive.
 *
 * Reuse is what makes lobby → board seamless. A room whose teardown has
 * already run is never resurrected: `teardown` deletes the entry before
 * disconnecting, so a late acquire lands here and builds a fresh one.
 * Reconnecting a `Room` that is mid-teardown surfaces as a phantom
 * participant who never leaves.
 */
export function acquireVoiceRoom(sessionId: string): AcquiredVoiceRoom {
  const existing = rooms.get(sessionId);
  if (existing) {
    if (existing.teardown !== undefined) {
      clearTimeout(existing.teardown);
      existing.teardown = undefined;
      // Put the microphone back the way the user left it. Only ever restores
      // a mic that was live — a deliberate mute is a preference, not damage.
      if (existing.micWasEnabled) {
        void existing.room.localParticipant.setMicrophoneEnabled(true).catch(() => {});
      }
    }
    return {
      room: existing.room,
      audioContainer: existing.audioContainer,
      reused: true,
      identity: existing.identity,
    };
  }

  const entry = createEntry(sessionId);
  rooms.set(sessionId, entry);
  return {
    room: entry.room,
    audioContainer: entry.audioContainer,
    reused: false,
    identity: null,
  };
}

/** Record the identity a fresh connection was issued, for a later reuse. */
export function rememberVoiceIdentity(sessionId: string, identity: string): void {
  const entry = rooms.get(sessionId);
  if (entry) entry.identity = identity;
}

/**
 * Give the room back. Mutes now, disconnects later.
 *
 * The two halves are deliberately split. Deferring the disconnect is what
 * makes the remount seamless, but it also means a genuine leave would keep
 * transmitting for the whole window — so the microphone closes synchronously,
 * which is also what stops the browser's recording indicator on the way out
 * (F11 — "disconnect cleanly on leave/end").
 */
export function releaseVoiceRoom(sessionId: string): void {
  const entry = rooms.get(sessionId);
  if (!entry) return;
  if (entry.teardown !== undefined) return;

  entry.micWasEnabled = entry.room.localParticipant.isMicrophoneEnabled;
  void entry.room.localParticipant.setMicrophoneEnabled(false).catch(() => {});

  entry.teardown = setTimeout(() => {
    // Dropped before disconnecting, never after: an acquire that arrives while
    // the room is tearing down must build a new one.
    rooms.delete(sessionId);
    void entry.room.disconnect();
    entry.audioContainer.remove();
  }, DISCONNECT_GRACE_MS);
}

/** True once the room is joined and can simply be picked back up. */
export function isVoiceRoomConnected(room: Room): boolean {
  return room.state === ConnectionState.Connected;
}

/**
 * Drop every room immediately.
 *
 * The natural caller is logout, which lives in `lib/socket.ts` —
 * another module's file — so this is exported and deliberately not wired up
 * here. Until it is, a logout leaves a room connected for the grace window
 * only, muted from the moment the tree unmounts.
 */
export function disconnectAllVoiceRooms(): void {
  for (const [sessionId, entry] of rooms) {
    if (entry.teardown !== undefined) clearTimeout(entry.teardown);
    rooms.delete(sessionId);
    void entry.room.disconnect();
    entry.audioContainer.remove();
  }
}
