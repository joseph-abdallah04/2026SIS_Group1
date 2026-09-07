import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { issueVoiceToken } from './service.js';

export const voiceRoutes = Router();

// docs/06 §6 gives voice `/api/sessions/:id/*-token` and the sessions owner the
// rest of `/api/sessions/:id`. KAN-56 names the path `/livekit-token`.
//
// `requireAuth` only answers "who is asking" (sets `req.userId` from a
// verified JWT); it is not the authorization. `issueVoiceToken`'s own
// membership check — via `getSessionMemberIdentity`, current members only — is
// what decides whether this caller may enter this session's room. Same chain
// pinboard uses for `GET /:sessionId/proposals`.
voiceRoutes.post<{ sessionId: string }>(
  '/:sessionId/livekit-token',
  requireAuth,
  async (req, res, next) => {
    try {
      // `requireAuth` never calls `next()` without setting this.
      const userId = req.userId!;
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
  },
);
