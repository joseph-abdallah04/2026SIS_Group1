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
  /** Not asked for yet. */
  | 'idle'
  /** The browser prompt is open, or we are acquiring the device. */
  | 'requesting'
  /** Publishing (whether or not currently muted — mute is F12). */
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

  const roomRef = useRef<Room | null>(null);
  const attemptRef = useRef(0);
  const [retryToken, setRetryToken] = useState(0);

  /** Give up on the current attempt chain and start a fresh one. */
  const retry = useCallback(() => {
    attemptRef.current = 0;
    setError(null);
    setRetryToken((n) => n + 1);
  }, []);

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

    /**
     * Publish the microphone. Split out because the "mic blocked" banner's
     * retry button calls exactly this, on a room that is already connected.
     */
    async function enableMicrophone(): Promise<void> {
      if (cancelled) return;
      setMicStatus('requesting');
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
        if (cancelled) return;
        setMicStatus('live');
      } catch (err) {
        if (cancelled) return;
        const failure = MediaDeviceFailure.getFailure(err);
        setMicStatus(failure === MediaDeviceFailure.NotFound ? 'no-device' : 'blocked');
      }
    }

    async function connect(): Promise<void> {
      if (cancelled) return;
      setStatus((prev) => (prev === 'reconnecting' ? prev : 'connecting'));

      try {
        const { url, token } = await fetchVoiceToken(sessionId);
        if (cancelled) return;

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
        await enableMicrophone();
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
      setStatus('idle');
      setParticipants([]);
    };
  }, [sessionId, retryToken]);

  /** The "mic blocked" banner's retry button. Re-prompts without rejoining. */
  const requestMicrophone = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;

    setMicStatus('requesting');
    try {
      await room.localParticipant.setMicrophoneEnabled(true);
      setMicStatus('live');
      setMicEnabledState(room.localParticipant.isMicrophoneEnabled);
    } catch (err) {
      const failure = MediaDeviceFailure.getFailure(err);
      setMicStatus(failure === MediaDeviceFailure.NotFound ? 'no-device' : 'blocked');
    }
  }, []);

  /** Mute/unmute the local track. The toggle UI and its persistence are F12. */
  const setMicEnabled = useCallback(async (enabled: boolean) => {
    const room = roomRef.current;
    if (!room) return;
    await room.localParticipant.setMicrophoneEnabled(enabled);
    setMicEnabledState(room.localParticipant.isMicrophoneEnabled);
  }, []);

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
    micEnabled,
    participants,
    error,
    audioBlocked,
    retry,
    requestMicrophone,
    setMicEnabled,
    unlockAudio,
  };
}
