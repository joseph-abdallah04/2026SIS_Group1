import { Router, type Request, type Response } from 'express';

import { env } from '../../env.js';
import { requireAuth } from '../../middleware/auth.js';
import { issueVoiceToken } from './service.js';

export const voiceRoutes = Router();

// Real identity comes from a verified JWT, and JWT verification is the auth
// owner's ticket (docs/05 deferred item 5) — `requireAuth` is still the stub
// that 401s everything. So this endpoint has a development stand-in, exactly
// like `realtime/gateway.ts` has one for sockets.
//
// It diverges from the gateway in one deliberate way: the gateway falls back to
// the session leader when no id is supplied, so a single-window pinboard demo
// just works. Voice does not do that. A token is a capability to enter a room
// and be heard, and F11's third acceptance criterion is that someone outside
// the session cannot obtain one — an endpoint that hands out the leader's token
// to an anonymous caller reads as failing that criterion even in dev, and a
// one-window voice demo is pointless anyway (there is nobody to hear).
//
// TODO(auth): delete `resolveCaller` and put `requireAuth` back in front of the
// route; the membership check in `issueVoiceToken` stays exactly as it is.
const DEV_IDENTITY = env.NODE_ENV !== 'production';

if (DEV_IDENTITY) {
  console.warn(
    '[voice] identity is the dev stand-in: callers assert `devUserId` (development only)',
  );
}

/**
 * Who is calling, or `null` — in which case a response has already been sent.
 *
 * A claimed id is never trusted on its own: it only names whose membership to
 * look up, and `issueVoiceToken` refuses anyone who is not in the session.
 */
async function resolveCaller(req: Request, res: Response): Promise<string | null> {
  if (!DEV_IDENTITY) {
    requireAuth(req, res);
    return null;
  }

  const header = req.get('x-rt-dev-user-id');
  const body: unknown = req.body;
  const claimed =
    header ??
    (typeof body === 'object' && body !== null && 'devUserId' in body
      ? (body as { devUserId?: unknown }).devUserId
      : undefined);

  if (typeof claimed !== 'string' || claimed.length === 0) {
    res.status(401).json({
      error: 'No identity supplied. Set localStorage.rt_dev_user_id to a member of this session.',
      code: 'DEV_IDENTITY_REQUIRED',
    });
    return null;
  }

  return claimed;
}

// docs/06 §6 gives voice `/api/sessions/:id/*-token` and the sessions owner the
// rest of `/api/sessions/:id`. KAN-56 names the path `/livekit-token`.
voiceRoutes.post<{ sessionId: string }>('/:sessionId/livekit-token', async (req, res, next) => {
  try {
    const userId = await resolveCaller(req, res);
    if (userId === null) return;

    const result = await issueVoiceToken(req.params.sessionId, userId);

    if (result.ok) {
      res.json(result.value);
      return;
    }

    if (result.reason === 'not-configured') {
      // The deployment has no LiveKit credentials. Nobody's fault but ours,
      // and distinguishable from a permission problem so the client can say
      // "voice is unavailable" rather than "you are not allowed in".
      res.status(503).json({
        error: 'Voice is not configured on this server',
        code: 'VOICE_NOT_CONFIGURED',
      });
      return;
    }

    // Same 403 whether the session has no such member or no such session:
    // a different status for each would let anyone probe which session ids
    // are real.
    res.status(403).json({
      error: 'You are not a participant in this session',
      code: 'NOT_A_PARTICIPANT',
    });
  } catch (err) {
    next(err);
  }
});
