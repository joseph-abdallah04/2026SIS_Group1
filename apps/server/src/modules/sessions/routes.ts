import { Router } from 'express';
import {
  createSessionSchema,
  joinSessionSchema,
  setQuestionPhaseSchema,
  updateSessionSchema,
} from '@roundtable/shared/schemas';

import { requireAuth } from '../../middleware/auth.js';
import { ApiError } from '../../middleware/error.js';
import type { RealtimeServer } from '../../realtime/types.js';
import {
  assertSessionMember,
  createSession,
  deleteSession,
  emitQuestionPhase,
  emitSessionEnded,
  emitSessionStarted,
  endSession,
  getSessionWithQuestions,
  joinSessionByCode,
  leaveSession,
  listSessionMembers,
  listSessionsForUser,
  openSessionForJoining,
  resolveSessionByCode,
  setQuestionPhase,
  startSession,
  updateSessionDraft,
} from './service.js';

// Every route here is behind `requireAuth`, which verifies the bearer token and
// sets `req.userId` (apps/server/src/middleware/auth.ts). It is never optional
// and never varies by environment: "who is asking" decides who leads a session,
// whose draft may be edited, who may move the agenda and whose name joins a
// room, so a request that cannot answer it has nothing to fall back on.
//
// `req.userId!` below is safe for exactly that reason — `requireAuth` either
// set it or never called the handler.

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
      const userId = req.userId!;
      const session = await getSessionWithQuestions(req.params.id);
      if (!session) {
        throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');
      }
      // Members only: the questions are the agenda, and a session id is a
      // shareable URL fragment rather than a secret. Checked after the 404 so
      // a real member of a deleted session still gets "not found".
      await assertSessionMember(session.id, userId);
      res.json(session);
    } catch (err) {
      next(err);
    }
  });

  // F05: replace a draft's title + question list wholesale. Leader-only,
  // draft-only — `updateSessionDraft` throws INVALID_TRANSITION once the
  // session has left draft, so there is no separate "is it still editable"
  // check here.
  sessionsRoutes.patch<{ id: string }>('/:id', requireAuth, async (req, res, next) => {
    try {
      const parsed = updateSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ApiError(
          400,
          parsed.error.issues[0]?.message ?? 'Invalid session',
          'VALIDATION_ERROR',
        );
      }

      const leaderId = req.userId!;
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
  sessionsRoutes.delete<{ id: string }>('/:id', requireAuth, async (req, res, next) => {
    try {
      const leaderId = req.userId!;
      await deleteSession({ sessionId: req.params.id, leaderId });
      res.status(204).end();
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

  // F09: lobby -> active. Leader-only; broadcasts `sessionStarted` to the
  // room so every waiting client transitions together, without polling.
  sessionsRoutes.post<{ id: string }>('/:id/start', requireAuth, async (req, res, next) => {
    try {
      const leaderId = req.userId!;
      const session = await startSession({ sessionId: req.params.id, leaderId });
      emitSessionStarted(io, session);
      res.json(session);
    } catch (err) {
      next(err);
    }
  });

  // F25/F26: the leader drives the agenda — one question at a time through
  // discussion -> voting -> answered, or straight to skipped. REST for the
  // same reason start and end are (docs/02 §5): one place decides whether the
  // transition is legal and returns an error the button can show, and the
  // resulting fact is broadcast so every agenda panel and board follows.
  sessionsRoutes.post<{ id: string }>('/:id/phase', requireAuth, async (req, res, next) => {
    try {
      const parsed = setQuestionPhaseSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ApiError(
          400,
          parsed.error.issues[0]?.message ?? 'Invalid phase change',
          'VALIDATION_ERROR',
        );
      }

      const leaderId = req.userId!;
      const question = await setQuestionPhase({
        sessionId: req.params.id,
        questionId: parsed.data.questionId,
        leaderId,
        status: parsed.data.status,
      });
      emitQuestionPhase(io, req.params.id, question);
      res.json(question);
    } catch (err) {
      next(err);
    }
  });

  // F32: lobby/active -> ended. Leader-only, irreversible (the confirmation
  // is the client's job), and broadcasts `sessionEnded` so nobody is left on a
  // board that has stopped accepting writes.
  sessionsRoutes.post<{ id: string }>('/:id/end', requireAuth, async (req, res, next) => {
    try {
      const leaderId = req.userId!;
      const session = await endSession({ sessionId: req.params.id, leaderId });
      emitSessionEnded(io, session);
      res.json(session);
    } catch (err) {
      next(err);
    }
  });

  // F07: explicit leave — a member's own row, never the leader's (see
  // `leaveSession`'s LEADER_CANNOT_LEAVE). Idempotent: leaving twice, or
  // leaving a session you were never in, is a 204, not an error.
  sessionsRoutes.post<{ id: string }>('/:id/leave', requireAuth, async (req, res, next) => {
    try {
      const userId = req.userId!;
      await leaveSession({ sessionId: req.params.id, userId });
      res.status(204).end();
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
  // Members only — this is a list of other people's display names.
  sessionsRoutes.get<{ id: string }>('/:id/members', requireAuth, async (req, res, next) => {
    try {
      const userId = req.userId!;
      await assertSessionMember(req.params.id, userId);
      const members = await listSessionMembers(req.params.id);
      res.json(members);
    } catch (err) {
      next(err);
    }
  });

  return sessionsRoutes;
}
