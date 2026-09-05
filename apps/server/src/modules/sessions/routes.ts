import { Router } from 'express';
import { createSessionSchema, joinSessionSchema } from '@roundtable/shared/schemas';

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

// Every route here is behind `requireAuth`, which verifies the bearer token and
// sets `req.userId` (apps/server/src/middleware/auth.ts). It is never optional
// and never varies by environment: "who is asking" decides who leads a session,
// whose draft may be edited and whose name joins a room, so a request that
// cannot answer it has nothing to fall back on.
//
// `req.userId!` below is safe for exactly that reason — `requireAuth` either
// set it or never called the handler.

// F04: title + ordered questions, created as `draft` with no join code.
sessionsRoutes.post('/', requireAuth, async (req, res, next) => {
  try {
    const parsed = createSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        parsed.error.issues[0]?.message ?? 'Invalid session',
        'VALIDATION_ERROR',
      );
    }

    const leaderId = req.userId!;
    const session = await createSession({ leaderId, input: parsed.data });
    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
});

// The dashboard's list: sessions this user leads or has joined.
sessionsRoutes.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId!;
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
sessionsRoutes.get<{ id: string }>('/:id', requireAuth, async (req, res, next) => {
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
sessionsRoutes.post<{ id: string }>('/:id/open', requireAuth, async (req, res, next) => {
  try {
    const leaderId = req.userId!;
    const session = await openSessionForJoining({ sessionId: req.params.id, leaderId });
    res.json(session);
  } catch (err) {
    next(err);
  }
});

// The join page's preview, before committing to join — resolves a pasted or
// linked code without side effects.
sessionsRoutes.get<{ code: string }>('/code/:code', requireAuth, async (req, res, next) => {
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
sessionsRoutes.post('/join', requireAuth, async (req, res, next) => {
  try {
    const parsed = joinSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        parsed.error.issues[0]?.message ?? 'Invalid code',
        'VALIDATION_ERROR',
      );
    }

    const userId = req.userId!;
    const result = await joinSessionByCode({ rawCode: parsed.data.code, userId });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// The waiting room's initial render, before live presence events arrive.
sessionsRoutes.get<{ id: string }>('/:id/members', requireAuth, async (req, res, next) => {
  try {
    const members = await listSessionMembers(req.params.id);
    res.json(members);
  } catch (err) {
    next(err);
  }
});
