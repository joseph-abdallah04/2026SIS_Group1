import { Router, type Request, type RequestHandler } from 'express';
import { createSessionSchema, joinSessionSchema, updateSessionSchema } from '@roundtable/shared/schemas';

import { env } from '../../env.js';
import { requireAuth } from '../../middleware/auth.js';
import { ApiError } from '../../middleware/error.js';
import type { RealtimeServer } from '../../realtime/types.js';
import {
  createSession,
  deleteSession,
  emitSessionStarted,
  getSessionWithQuestions,
  joinSessionByCode,
  leaveSession,
  listSessionMembers,
  listSessionsForUser,
  openSessionForJoining,
  resolveSessionByCode,
  startSession,
  updateSessionDraft,
} from './service.js';

const IS_PRODUCTION = env.NODE_ENV === 'production';

interface DevAuthedRequest extends Request {
  devUserId?: string;
}

// No real auth yet — `requireAuth` always 401s (docs/05 deferred item 5). This
// mirrors the realtime gateway's dev-only identity escape hatch
// (apps/server/src/realtime/gateway.ts, `socket.handshake.auth.devUserId`):
// in development a client states who it's acting as via a header, checked
// against nothing but present. In production these routes stay behind the
// (closed) auth stub rather than trusting a client-supplied id.
//
// TODO(auth): replace with `requireAuth` + `req.user.id` from a verified JWT,
// and delete the dev branch. No other line in this file needs to change.
const resolveDevUser: RequestHandler = (req, res, next) => {
  if (IS_PRODUCTION) {
    requireAuth(req, res);
    return;
  }

  const devUserId = req.header('x-dev-user-id');
  if (!devUserId) {
    res.status(401).json({
      error: 'x-dev-user-id header required in development (no auth yet)',
      code: 'DEV_USER_REQUIRED',
    });
    return;
  }

  (req as DevAuthedRequest).devUserId = devUserId;
  next();
};

if (!IS_PRODUCTION) {
  console.warn(
    '[sessions] REST routes use the x-dev-user-id header instead of real auth (development only)',
  );
}

/**
 * A factory, not a module-level `Router`, because F09's `POST /:id/start`
 * needs to broadcast on `io` after it succeeds — the same `io` instance
 * `registerRealtimeGateway` gets, not a second one. `index.ts` creates `io`
 * once at startup and passes it here; nothing else in this file depends on
 * it, so every other handler reads exactly as it did before this became a
 * function.
 */
export function createSessionsRoutes(io: RealtimeServer): Router {
  const sessionsRoutes = Router();

  // F04: title + ordered questions, created as `draft` with no join code.
  sessionsRoutes.post('/', resolveDevUser, async (req, res, next) => {
    try {
      const parsed = createSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ApiError(
          400,
          parsed.error.issues[0]?.message ?? 'Invalid session',
          'VALIDATION_ERROR',
        );
      }

      const leaderId = (req as DevAuthedRequest).devUserId as string;
      const session = await createSession({ leaderId, input: parsed.data });
      res.status(201).json(session);
    } catch (err) {
      next(err);
    }
  });

  // The dashboard's list: sessions this user leads or has joined.
  sessionsRoutes.get('/', resolveDevUser, async (req, res, next) => {
    try {
      const userId = (req as DevAuthedRequest).devUserId as string;
      const sessions = await listSessionsForUser(userId);
      res.json(sessions);
    } catch (err) {
      next(err);
    }
  });

  // Registered ahead of `/code/:code` and `/:id/open` below on purpose — this is
  // safe, not a routing bug: Express's `/:id` only matches a single path
  // segment (no `/`), so a two-segment request like `GET /code/K7NP-3WQZ` can
  // never reach this handler no matter the registration order. Only a
  // one-segment path with `id` literally equal to `'code'` would, and that has
  // nothing to do with the code lookup below.
  sessionsRoutes.get<{ id: string }>('/:id', resolveDevUser, async (req, res, next) => {
    try {
      const session = await getSessionWithQuestions(req.params.id);
      if (!session) {
        throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');
      }
      res.json(session);
    } catch (err) {
      next(err);
    }
  });

  // F05: replace a draft's title + question list wholesale. Leader-only,
  // draft-only — `updateSessionDraft` throws INVALID_TRANSITION once the
  // session has left draft, so there is no separate "is it still editable"
  // check here.
  sessionsRoutes.patch<{ id: string }>('/:id', resolveDevUser, async (req, res, next) => {
    try {
      const parsed = updateSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ApiError(
          400,
          parsed.error.issues[0]?.message ?? 'Invalid session',
          'VALIDATION_ERROR',
        );
      }

      const leaderId = (req as DevAuthedRequest).devUserId as string;
      const session = await updateSessionDraft({
        sessionId: req.params.id,
        leaderId,
        input: parsed.data,
      });
      res.json(session);
    } catch (err) {
      next(err);
    }
  });

  // F05: delete a draft. The frontend's confirm dialog is what makes this
  // safe to expose with no further confirmation step server-side.
  sessionsRoutes.delete<{ id: string }>('/:id', resolveDevUser, async (req, res, next) => {
    try {
      const leaderId = (req as DevAuthedRequest).devUserId as string;
      await deleteSession({ sessionId: req.params.id, leaderId });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // F06: draft -> lobby. Leader-only; mints the code that makes the session
  // joinable. Idempotent — re-opening an already-lobby session just returns it.
  sessionsRoutes.post<{ id: string }>('/:id/open', resolveDevUser, async (req, res, next) => {
    try {
      const leaderId = (req as DevAuthedRequest).devUserId as string;
      const session = await openSessionForJoining({ sessionId: req.params.id, leaderId });
      res.json(session);
    } catch (err) {
      next(err);
    }
  });

  // F09: lobby -> active. Leader-only; broadcasts `sessionStarted` to the
  // room so every waiting client transitions together, without polling.
  sessionsRoutes.post<{ id: string }>('/:id/start', resolveDevUser, async (req, res, next) => {
    try {
      const leaderId = (req as DevAuthedRequest).devUserId as string;
      const session = await startSession({ sessionId: req.params.id, leaderId });
      emitSessionStarted(io, session);
      res.json(session);
    } catch (err) {
      next(err);
    }
  });

  // F07: explicit leave — a member's own row, never the leader's (see
  // `leaveSession`'s LEADER_CANNOT_LEAVE). Idempotent: leaving twice, or
  // leaving a session you were never in, is a 204, not an error.
  sessionsRoutes.post<{ id: string }>('/:id/leave', resolveDevUser, async (req, res, next) => {
    try {
      const userId = (req as DevAuthedRequest).devUserId as string;
      await leaveSession({ sessionId: req.params.id, userId });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // The join page's preview, before committing to join — resolves a pasted or
  // linked code without side effects.
  sessionsRoutes.get<{ code: string }>('/code/:code', resolveDevUser, async (req, res, next) => {
    try {
      const preview = await resolveSessionByCode(req.params.code);
      if (!preview) {
        throw new ApiError(404, 'Session not found — check the code', 'INVALID_CODE');
      }
      res.json(preview);
    } catch (err) {
      next(err);
    }
  });

  // Resolves the code, adds the caller as a member (upsert — joining twice is a
  // no-op), and hands back the id to route into the waiting room.
  sessionsRoutes.post('/join', resolveDevUser, async (req, res, next) => {
    try {
      const parsed = joinSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ApiError(
          400,
          parsed.error.issues[0]?.message ?? 'Invalid code',
          'VALIDATION_ERROR',
        );
      }

      const userId = (req as DevAuthedRequest).devUserId as string;
      const result = await joinSessionByCode({ rawCode: parsed.data.code, userId });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // The waiting room's initial render, before live presence events arrive.
  sessionsRoutes.get<{ id: string }>('/:id/members', resolveDevUser, async (req, res, next) => {
    try {
      const members = await listSessionMembers(req.params.id);
      res.json(members);
    } catch (err) {
      next(err);
    }
  });

  return sessionsRoutes;
}
