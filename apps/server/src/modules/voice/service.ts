// Token issuance for in-session voice (F11).
//
// The only thing our server does for voice: mint a short-lived LiveKit access
// token scoped to one session's room (docs/02 §1 — "LiveKit Cloud … our server
// merely issues join tokens"). Audio itself never touches this process.
import { AccessToken, TrackSource } from 'livekit-server-sdk';
import { voiceRoom, type VoiceTokenResponse } from '@roundtable/shared';

import { env } from '../../env.js';
import { findSessionParticipant } from './sessionsAdapter.js';

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
