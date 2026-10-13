import { Router } from 'express';
import { voiceMuteSchema } from '@roundtable/shared/schemas';

import { requireAuth } from '../../middleware/auth.js';
import { issueVoiceToken, muteParticipants } from './service.js';

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

      if (result.reason === 'voice-off') {
        // The leader chose no call. Not a fault and not a permission problem,
        // so the client can treat it like a server without voice: show none.
        res.status(409).json({
          error: 'This session has no call',
          code: 'VOICE_OFF',
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

// F12, the leader's side: mute one person (`{ identity }`, their user id) or
// everyone but the leader (`{}`). Under `voice/` so it is plainly this module's
// path rather than the sessions owner's. Same split as above: `requireAuth`
// says who is asking, `muteParticipants` decides whether they may.
voiceRoutes.post<{ sessionId: string }>(
  '/:sessionId/voice/mute',
  requireAuth,
  async (req, res, next) => {
    try {
      const parsed = voiceMuteSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          error: 'Name one person to mute, or no one to mute everyone',
          code: 'VALIDATION_ERROR',
        });
        return;
      }

      const result = await muteParticipants(
        req.params.sessionId,
        req.userId!,
        parsed.data.identity,
      );

      if (result.ok) {
        res.json(result.value);
        return;
      }

      if (result.reason === 'not-configured') {
        res.status(503).json({
          error: 'Voice is not configured on this server',
          code: 'VOICE_NOT_CONFIGURED',
        });
        return;
      }

      if (result.reason === 'voice-off') {
        res.status(409).json({ error: 'This session has no call', code: 'VOICE_OFF' });
        return;
      }

      // One answer for a member who is not the leader, a stranger, and a
      // session that does not exist, for the same reason as the token's 403.
      res.status(403).json({
        error: 'Only the session leader can mute people',
        code: 'NOT_SESSION_LEADER',
      });
    } catch (err) {
      next(err);
    }
  },
);
