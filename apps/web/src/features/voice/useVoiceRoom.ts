import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DisconnectReason,
  MediaDeviceFailure,
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
} from 'livekit-client';

import { ApiClientError } from '../../lib/api';
import { readMicMuted, writeMicMuted } from './micPreference';
import { fetchVoiceToken } from './voiceApi';

/**
 * Connection to the session's audio, as the UI needs to think about it.
 *
 * Deliberately not LiveKit's own `ConnectionState`: "we are fetching a token"
 * and "the SDK is negotiating" are the same thing to a user, and `failed` here
 * means we gave up, which no single SDK state expresses.
 */
export type VoiceStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

/**
 * The microphone, tracked separately from the connection on purpose: voice is
 * optional (docs/06 Voice §Notes), so a blocked mic still leaves you connected
 * and listening. Collapsing the two would turn "I can hear everyone but they
 * can't hear me" into "voice is broken".
 */
export type MicStatus =
  /**
   * The device has not been asked for. Either nothing has happened yet, or you
   * rejoined muted (F12) — in which case we deliberately never touched it.
   */
  | 'idle'
  /** The browser prompt is open, or we are acquiring the device. */
  | 'requesting'
  /**
   * The device is ours and the track is published. Says nothing about mute:
   * a muted participant is still `live`, they are simply publishing silence.
   */
  | 'live'
  /** Permission refused. This is what the "mic blocked" banner is for. */
  | 'blocked'
  /** Permission is fine; there is no working input device. */
  | 'no-device';

/** One person in the room. Shaped for F13's participant list. */
export interface VoiceParticipant {
  identity: string;
  /** Server-minted display name; falls back to identity if a token ever lacks one. */
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
}

/** Disconnects we should not fight: retrying would either loop or be wrong. */
const TERMINAL_DISCONNECTS = new Set<DisconnectReason>([
  DisconnectReason.CLIENT_INITIATED,
  // Another tab of yours took the room slot. Reconnecting here would start a
  // tug-of-war between two tabs, each kicking the other forever.
  DisconnectReason.DUPLICATE_IDENTITY,
  DisconnectReason.PARTICIPANT_REMOVED,
  DisconnectReason.ROOM_DELETED,
]);

const RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000];

/**
 * Join the session's LiveKit room for the lifetime of the view (F11).
 *
 * Ordering matters here: we connect first and ask for the microphone second.
 * Asking first would mean a refused prompt kept you out of the room entirely,
 * when the useful outcome is being in it and able to hear people while the
 * banner offers a retry.
 */
export function useVoiceRoom(sessionId: string) {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [micStatus, setMicStatus] = useState<MicStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<readonly VoiceParticipant[]>([]);
  const [micEnabled, setMicEnabledState] = useState(false);
  /** Browser autoplay policy is holding remote audio; needs a user gesture. */
  const [audioBlocked, setAudioBlocked] = useState(false);
  /**
   * `micStatus === 'blocked'` alone doesn't say whether a retry can work.
   * Once a user has explicitly clicked "Block" for this site, every browser
   * refuses to show the permission prompt again — `getUserMedia` just fails
   * again immediately, with no UI — and no page can override that. This is
   * `true` only once the Permissions API confirms that persistent state, so
   * the banner can stop suggesting a retry that cannot succeed.
   */
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);

  /**
   * A toggle is in flight. Acquiring a device takes long enough to double-click
   * through, and two overlapping `setMicrophoneEnabled` calls settle in
   * whichever order the browser finishes them — which is how you end up muted
   * after asking twice to unmute.
   */
  const [micBusy, setMicBusy] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const attemptRef = useRef(0);
  const [retryToken, setRetryToken] = useState(0);
  /** The live subscription behind `micPermissionDenied`, so it can be torn down. */
  const permissionStatusRef = useRef<PermissionStatus | null>(null);
  /** Guards `micBusy` without waiting for a render to land. */
  const micBusyRef = useRef(false);
  /**
   * The mic operation currently settling, if any. The join path waits on it
   * rather than being turned away by the guard above — see `connect`.
   */
  const micOpRef = useRef<Promise<void> | null>(null);
  /**
   * Who the server says we are, from the token. The mute preference is stored
   * per user, and this is the only place the client learns its own id.
   */
  const identityRef = useRef<string | null>(null);

  /**
   * Watches the OS/browser-level mic permission so a fix made outside this
   * page — the address bar's site settings, not our retry button — is picked
   * up without needing a reload: browsers apply a permission change to
   * `getUserMedia` immediately, they just never re-show the prompt on their
   * own. Silently does nothing where the Permissions API can't name
   * `'microphone'` (older Safari); those browsers keep the plain retry.
   */
  const watchMicPermission = useCallback((onRecovered: () => void) => {
    if (permissionStatusRef.current) permissionStatusRef.current.onchange = null;
    permissionStatusRef.current = null;

    if (!navigator.permissions?.query) return;

    void navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then((status) => {
        permissionStatusRef.current = status;
        setMicPermissionDenied(status.state === 'denied');
        status.onchange = () => {
          setMicPermissionDenied(status.state === 'denied');
          if (status.state !== 'denied') onRecovered();
        };
      })
      .catch(() => {
        // Querying itself can throw (unsupported name, disabled feature
        // policy) — fall back to the plain retry rather than surface this.
      });
  }, []);

  /** Give up on the current attempt chain and start a fresh one. */
  const retry = useCallback(() => {
    attemptRef.current = 0;
    setError(null);
    setRetryToken((n) => n + 1);
  }, []);

  /**
   * Mute or unmute the local track, and remember the choice (F12).
   *
   * One function for three callers that used to be three near-copies: the
   * toggle, the "mic blocked" banner's retry, and the join path. They differ
   * only in what they mean, not in what has to happen — and the interesting
   * case is the one they share, where there is no published track yet and
   * "unmute" has to acquire the device first. That is why the toggle works for
   * someone who joined with the mic blocked and allowed it afterwards: nothing
   * here assumes the track already exists.
   *
   * Named so it can call itself: the permission watcher's recovery is created
   * inside this function and needs to run it again.
   */
  const applyMicEnabled = useCallback(
    function applyMic(enabled: boolean): Promise<void> {
      const room = roomRef.current;
      if (!room || micBusyRef.current) return Promise.resolve();

      // Unmuting with nothing published means `getUserMedia` — a permission
      // prompt, or several hundred milliseconds of device startup. Muting, and
      // unmuting a track we already hold, are neither, so they must not flash
      // the "requesting" state through the UI.
      const needsDevice =
        enabled && !room.localParticipant.getTrackPublication(Track.Source.Microphone);

      micBusyRef.current = true;
      setMicBusy(true);
      if (needsDevice) setMicStatus('requesting');

      // Kept in a ref as well as returned: the join path has no handle on a
      // toggle a user started, and needs one to wait for.
      const op = (async () => {
        try {
          await room.localParticipant.setMicrophoneEnabled(enabled);
          // The view was left, or the room was rebuilt, while this was in flight.
          if (roomRef.current !== room) return;

          // Read back rather than assume: muting while nothing was ever
          // published is a no-op inside the SDK, and claiming `live` off the back
          // of it would show a toggle that thinks it holds a device it does not.
          const publishing =
            room.localParticipant.getTrackPublication(Track.Source.Microphone) !== undefined;
          setMicStatus(publishing ? 'live' : 'idle');
          setMicEnabledState(room.localParticipant.isMicrophoneEnabled);
          // Only an unmute proves the permission is ours; a mute proves nothing.
          if (enabled) setMicPermissionDenied(false);
          if (identityRef.current) writeMicMuted(sessionId, identityRef.current, !enabled);
        } catch (err) {
          if (roomRef.current !== room) return;

          // Whatever went wrong, the room is the authority on what is actually
          // going out. Leaving `micEnabled` at its old value is how the toggle
          // ends up reading "Mic on" for someone nobody can hear — nothing else
          // corrects it, because a failure fires no track event.
          setMicEnabledState(room.localParticipant.isMicrophoneEnabled);

          // Only acquiring a device can fail for want of permission. Muting
          // rejects for unrelated reasons — `mute()` waits on a lock and on a
          // republish, either of which can throw mid-reconnect — and calling
          // that "blocked" would raise a false "nobody can hear you" over a live
          // mic, then arm the permission watcher to silently unmute later.
          if (!enabled) return;

          const failure = MediaDeviceFailure.getFailure(err);
          if (failure === MediaDeviceFailure.NotFound) {
            setMicStatus('no-device');
            return;
          }
          setMicStatus('blocked');
          watchMicPermission(() => void applyMic(true));
        } finally {
          micBusyRef.current = false;
          setMicBusy(false);
        }
      })();

      micOpRef.current = op;
      return op;
    },
    [sessionId, watchMicPermission],
  );

  useEffect(() => {
    if (!sessionId) return;

    // A Room per effect run. Reusing one across StrictMode's double-mount (or a
    // route change) means reconnecting an object that is mid-teardown, which
    // surfaces as a phantom participant that never leaves.
    const room = new Room({
      // Audio only (F11): no adaptive stream or dynacast, both video concerns.
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    roomRef.current = room;

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    // Remote audio needs an element in the document to actually play. Kept in a
    // hidden container the hook owns, so no caller has to remember to render
    // one — forgetting it is a silent "nobody can hear anyone" bug.
    const audioContainer = document.createElement('div');
    audioContainer.style.display = 'none';
    audioContainer.setAttribute('data-rt-voice-audio', sessionId);
    document.body.appendChild(audioContainer);

    const syncParticipants = () => {
      if (cancelled) return;
      const everyone = [room.localParticipant, ...room.remoteParticipants.values()];
      setParticipants(
        everyone.map((p) => ({
          identity: p.identity,
          name: p.name && p.name.length > 0 ? p.name : p.identity,
          isLocal: p.isLocal,
          isSpeaking: p.isSpeaking,
          isMuted: !p.isMicrophoneEnabled,
        })),
      );
      setMicEnabledState(room.localParticipant.isMicrophoneEnabled);
    };

    const onTrackSubscribed = (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) return;
      audioContainer.appendChild(track.attach());
    };

    const onTrackUnsubscribed = (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) return;
      for (const el of track.detach()) el.remove();
    };

    const scheduleReconnect = () => {
      const attempt = attemptRef.current;
      if (attempt >= RECONNECT_DELAYS_MS.length) {
        setStatus('failed');
        setError('Lost the voice connection. Reconnect to rejoin.');
        return;
      }
      attemptRef.current = attempt + 1;
      setStatus('reconnecting');
      reconnectTimer = setTimeout(() => void connect(), RECONNECT_DELAYS_MS[attempt]);
    };

    const onDisconnected = (reason?: DisconnectReason) => {
      if (cancelled) return;
      setParticipants([]);

      if (reason !== undefined && TERMINAL_DISCONNECTS.has(reason)) {
        setStatus('idle');
        if (reason === DisconnectReason.DUPLICATE_IDENTITY) {
          setError('You joined this session in another tab, so audio moved there.');
        }
        return;
      }

      // The SDK's own reconnect has already been tried and lost by the time it
      // emits this. Our retry is not a duplicate of it: it re-fetches a token
      // first, which is the case the SDK cannot handle — a token that expired
      // while the network was down (F11 — reconnects, refreshes).
      scheduleReconnect();
    };

    async function connect(): Promise<void> {
      if (cancelled) return;
      setStatus((prev) => (prev === 'reconnecting' ? prev : 'connecting'));

      try {
        const { url, token, identity } = await fetchVoiceToken(sessionId);
        if (cancelled) return;
        identityRef.current = identity;

        await room.connect(url, token);
        if (cancelled) {
          // The view was left while the handshake was in flight; nothing will
          // ever tear this down otherwise.
          await room.disconnect();
          return;
        }

        attemptRef.current = 0;
        setStatus('connected');
        setError(null);
        syncParticipants();

        // Rejoin the way you left (F12). Muted means the microphone is not
        // touched at all — not acquired and muted, simply never opened. A
        // refresh should not relight the browser's recording indicator for
        // someone who chose silence, and it must not raise a permission prompt
        // at somebody who has never granted one. Unmuting later acquires the
        // device then, which is the same path a blocked-then-allowed mic takes.
        // A toggle can still be settling from before a drop — a permission
        // prompt left open, say. It was aimed at a connection that no longer
        // exists, and its guard would silently swallow the calls below,
        // leaving us connected with no microphone and nothing to retry it.
        if (micOpRef.current) await micOpRef.current.catch(() => {});
        if (cancelled) return;

        if (readMicMuted(sessionId, identity)) {
          // Normally there is nothing to mute and that is the point — the
          // device is never opened. But if that settling toggle did publish
          // one, it must not go out hot just because we skipped the acquire.
          if (room.localParticipant.getTrackPublication(Track.Source.Microphone)) {
            await applyMicEnabled(false);
          } else {
            setMicEnabledState(false);
            setMicStatus('idle');
          }
        } else {
          await applyMicEnabled(true);
        }
      } catch (err) {
        if (cancelled) return;

        // A refusal is an answer, not a blip: retrying a 403 just repeats it.
        if (err instanceof ApiClientError && err.status >= 400 && err.status < 500) {
          setStatus('failed');
          setError(
            err.status === 403
              ? 'You are not a participant in this session, so you cannot join its voice room.'
              : err.message,
          );
          return;
        }

        setError(err instanceof Error ? err.message : 'Could not connect to voice');
        scheduleReconnect();
      }
    }

    room
      .on(RoomEvent.TrackSubscribed, onTrackSubscribed)
      .on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
      .on(RoomEvent.ParticipantConnected, syncParticipants)
      .on(RoomEvent.ParticipantDisconnected, syncParticipants)
      .on(RoomEvent.ActiveSpeakersChanged, syncParticipants)
      .on(RoomEvent.TrackMuted, syncParticipants)
      .on(RoomEvent.TrackUnmuted, syncParticipants)
      .on(RoomEvent.LocalTrackPublished, syncParticipants)
      .on(RoomEvent.LocalTrackUnpublished, syncParticipants)
      .on(RoomEvent.Reconnecting, () => setStatus('reconnecting'))
      .on(RoomEvent.Reconnected, () => {
        attemptRef.current = 0;
        setStatus('connected');
        setError(null);
        syncParticipants();
      })
      .on(RoomEvent.Disconnected, onDisconnected)
      .on(RoomEvent.AudioPlaybackStatusChanged, () => setAudioBlocked(!room.canPlaybackAudio));

    void connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      room.removeAllListeners();
      // Leaving the view leaves the call (F11 — "disconnect cleanly on
      // leave/end"), which also stops the mic indicator in the browser tab.
      void room.disconnect();
      audioContainer.remove();
      roomRef.current = null;
      if (permissionStatusRef.current) permissionStatusRef.current.onchange = null;
      permissionStatusRef.current = null;
      setStatus('idle');
      setParticipants([]);
      setMicPermissionDenied(false);
      // The next room starts from nothing: leaving with a live mic and coming
      // back to a session whose join is still in flight would otherwise show a
      // toggle claiming to be on.
      setMicStatus('idle');
      setMicEnabledState(false);
    };
    // `applyMicEnabled` changes only with `sessionId`, which is already here:
    // this does not cost the room an extra rebuild.
  }, [sessionId, retryToken, applyMicEnabled]);

  /** The "mic blocked" banner's retry button. Re-prompts without rejoining. */
  const requestMicrophone = useCallback(() => applyMicEnabled(true), [applyMicEnabled]);

  /**
   * Flip the mic (F12) — what the toggle and the M shortcut both call.
   *
   * The current state is read off the room rather than from `micEnabled`: a
   * keypress that arrives between a remote mute and its re-render would
   * otherwise toggle away from a state that is already stale.
   */
  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    await applyMicEnabled(!room.localParticipant.isMicrophoneEnabled);
  }, [applyMicEnabled]);

  /**
   * Browsers refuse to play audio until the page has been interacted with, and
   * a refresh straight into a session can land with no gesture yet. Call this
   * from a click so the room's audio elements can start.
   */
  const unlockAudio = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    await room.startAudio();
    setAudioBlocked(!room.canPlaybackAudio);
  }, []);

  return {
    status,
    micStatus,
    /** False while muted — including when muted means "never published". */
    micEnabled,
    micBusy,
    micPermissionDenied,
    participants,
    error,
    audioBlocked,
    retry,
    requestMicrophone,
    toggleMic,
    unlockAudio,
  };
}
