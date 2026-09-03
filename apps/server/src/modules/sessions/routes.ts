import { Router, type Request, type RequestHandler } from 'express';
import { createSessionSchema, joinSessionSchema } from '@roundtable/shared/schemas';

import { env } from '../../env.js';
import { requireAuth } from '../../middleware/auth.js';
import { ApiError } from '../../middleware/error.js';
import {
  createSession,
  getSessionWithQuestions,
  joinSessionByCode,
  listSessionMembers,
  listSessionsForUser,
  openSessionForJoining,
  resolveSessionByCode,
} from './service.js';

export const sessionsRoutes = Router();

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
