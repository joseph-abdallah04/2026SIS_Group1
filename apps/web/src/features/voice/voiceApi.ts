import type { VoiceTokenResponse } from '@roundtable/shared';

import { api } from '../../lib/api';

/**
 * Fetch a join token for this session's room (F11).
 *
 * Called on every connect and every reconnect rather than once per visit: the
 * token is short-lived by design, so "get a fresh one" is the normal path, not
 * an error path. The room name comes back with it — the client never names a
 * room itself, so it cannot ask to be let into someone else's.
 *
 * The dev identity mirrors `lib/socket.ts`: with no login yet there is no JWT,
 * so `rt_dev_user_id` is how two browser windows act as two seeded members.
 * Never sent from a production build, and the server ignores it there anyway.
 */
export async function fetchVoiceToken(sessionId: string): Promise<VoiceTokenResponse> {
  const body: Record<string, string> = {};

  if (import.meta.env.DEV) {
    const devUserId = localStorage.getItem('rt_dev_user_id');
    if (devUserId) body.devUserId = devUserId;
  }

  return api.post<VoiceTokenResponse>(`/api/sessions/${sessionId}/livekit-token`, body);
}
