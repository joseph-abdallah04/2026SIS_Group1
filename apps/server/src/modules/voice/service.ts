// Server-side voice (F11, F12).
//
// Two things, and audio itself never touches this process: mint a short-lived
// LiveKit access token scoped to one session's room (docs/02 §1 — "LiveKit
// Cloud … our server merely issues join tokens"), and let the session's leader
// mute people in that room, which only LiveKit's server API can do.
import {
  AccessToken,
  RoomServiceClient,
  ServerError,
  TrackSource,
  type ParticipantInfo,
} from 'livekit-server-sdk';
import { voiceRoom, type VoiceMuteResponse, type VoiceTokenResponse } from '@roundtable/shared';

import { env } from '../../env.js';
import { findSession, findSessionParticipant, isSessionVoiceEnabled } from './sessionsAdapter.js';

/**
 * Token lifetime (F11 — "short-lived access token").
 *
 * Short enough that a leaked token is close to worthless, which is only
 * survivable because the client re-fetches on every connect and reconnect: a
 * call outliving the TTL is normal, and re-minting costs one request. docs/06
 * says 24h; this ticket's "short-lived" wins, and docs/06 is updated to match.
 */
export const TOKEN_TTL_SECONDS = 15 * 60;

export type IssueTokenResult =
  | { ok: true; value: VoiceTokenResponse }
  /** Caller is not a member of this session — or the session does not exist. */
  | { ok: false; reason: 'not-a-member' }
  /** The session was created with no call, so it has no room to join. */
  | { ok: false; reason: 'voice-off' }
  /** LiveKit credentials are absent from the environment; nobody can join. */
  | { ok: false; reason: 'not-configured' };

interface LiveKitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

/**
 * LiveKit config is optional in `env.ts` (a contributor without credentials can
 * still run everything else), so it is checked per request rather than at boot.
 * Missing config is a server fault — a 503 — not a bad request.
 */
function liveKitConfig(): LiveKitConfig | null {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = env;
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) return null;
  return { url: LIVEKIT_URL, apiKey: LIVEKIT_API_KEY, apiSecret: LIVEKIT_API_SECRET };
}

export function isVoiceConfigured(): boolean {
  return liveKitConfig() !== null;
}

/**
 * Mint a join token for `userId` in `sessionId`'s room.
 *
 * Membership is re-checked here rather than trusted from the caller: this is
 * the function that decides who may enter a room, so the check belongs next to
 * the signing, not in whichever route happens to call it.
 */
export async function issueVoiceToken(
  sessionId: string,
  userId: string,
): Promise<IssueTokenResult> {
  const config = liveKitConfig();
  if (!config) return { ok: false, reason: 'not-configured' };

  const participant = await findSessionParticipant(sessionId, userId);
  if (!participant) return { ok: false, reason: 'not-a-member' };

  // After the membership check, not before: someone outside the session gets
  // the same `not-a-member` either way, so they cannot learn whether it has a
  // call. Refusing here, at the signing, is what makes "no call" mean no
  // LiveKit minutes even for a client that asks anyway.
  if (!(await isSessionVoiceEnabled(sessionId))) return { ok: false, reason: 'voice-off' };

  const roomName = voiceRoom(sessionId);

  // `identity` is the user id, so one person is one participant no matter how
  // many tabs they open: LiveKit disconnects an older connection holding the
  // same identity, which is exactly what a page refresh should do (F11 —
  // "refreshing the page keeps you in the call"). `name` is what F13's
  // participant list renders, so it has to be minted in — the client is never
  // asked for its own display name.
  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity: participant.id,
    name: participant.displayName,
    ttl: TOKEN_TTL_SECONDS,
  });

  token.addGrant({
    roomJoin: true,
    room: roomName,
    // Audio only, no video (F11) — enforced by the grant rather than by the
    // client choosing to behave: a tampered client still cannot publish a
    // camera or a screen share into a RoundTable session.
    canPublish: true,
    canPublishSources: [TrackSource.MICROPHONE],
    canSubscribe: true,
    canPublishData: false,
    // Metadata is server-minted above; letting participants rewrite their own
    // would let anyone relabel themselves in F13's participant list.
    canUpdateOwnMetadata: false,
  });

  return {
    ok: true,
    value: {
      token: await token.toJwt(),
      url: config.url,
      identity: participant.id,
      roomName,
      expiresInSeconds: TOKEN_TTL_SECONDS,
    },
  };
}

export type MuteResult =
  | { ok: true; value: VoiceMuteResponse }
  /** Not this session's leader — or there is no such session. */
  | { ok: false; reason: 'not-the-leader' }
  /** The session was created with no call, so there is nobody to mute. */
  | { ok: false; reason: 'voice-off' }
  /** LiveKit credentials are absent from the environment. */
  | { ok: false; reason: 'not-configured' };

/**
 * The leader turning off one person's microphone, or everyone's but their own
 * when `identity` is left out (F12).
 *
 * Mute only. LiveKit lets the server mute a published track but not unmute
 * one unless the project allows remote unmute, which RoundTable does not want:
 * a microphone coming on is the person's own decision. Whoever was muted sees
 * their mic go off, and turns it back on themselves.
 *
 * Leadership is checked here rather than in the route, next to the LiveKit
 * call it guards, as membership is next to the token's signing. A session that
 * does not exist answers the same as one someone else leads.
 */
export async function muteParticipants(
  sessionId: string,
  callerId: string,
  identity?: string,
): Promise<MuteResult> {
  const config = liveKitConfig();
  if (!config) return { ok: false, reason: 'not-configured' };

  const session = await findSession(sessionId);
  if (!session || session.leaderId !== callerId) return { ok: false, reason: 'not-the-leader' };
  if (!(await isSessionVoiceEnabled(sessionId))) return { ok: false, reason: 'voice-off' };

  const roomName = voiceRoom(sessionId);
  // The SDK turns the `wss://` URL the clients use into the `https://` its API needs.
  const rooms = new RoomServiceClient(config.url, config.apiKey, config.apiSecret);

  let participants: ParticipantInfo[];
  try {
    participants = await rooms.listParticipants(roomName);
  } catch (err) {
    // LiveKit only has a room once someone has joined it. No room, no microphones.
    if (err instanceof ServerError && (err.status === 404 || err.code === 'not_found')) {
      return { ok: true, value: { muted: 0 } };
    }
    throw err;
  }

  const targets = participants.filter((participant) =>
    identity === undefined ? participant.identity !== callerId : participant.identity === identity,
  );
  // Only microphones that are on: muting one already off would count someone
  // who was never heard.
  const live = targets.flatMap((participant) =>
    participant.tracks
      .filter((track) => track.source === TrackSource.MICROPHONE && !track.muted)
      .map((track) => ({ identity: participant.identity, sid: track.sid })),
  );

  await Promise.all(
    live.map((track) => rooms.mutePublishedTrack(roomName, track.identity, track.sid, true)),
  );

  return { ok: true, value: { muted: new Set(live.map((track) => track.identity)).size } };
}
