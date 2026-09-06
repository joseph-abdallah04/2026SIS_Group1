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
 * Identity comes from the request's `Authorization: Bearer` header, which
 * `api.post` attaches from the logged-in user's token — there is nothing else
 * for this call to say about who is asking.
 */
export async function fetchVoiceToken(sessionId: string): Promise<VoiceTokenResponse> {
  return api.post<VoiceTokenResponse>(`/api/sessions/${sessionId}/livekit-token`, {});
}
