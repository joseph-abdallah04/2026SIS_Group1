import { Router } from 'express';
import {
  addSessionQuestionSchema,
  createSessionSchema,
  focusQuestionSchema,
  joinSessionSchema,
  setQuestionPhaseSchema,
  updateSessionSchema,
} from '@roundtable/shared/schemas';

import { requireAuth } from '../../middleware/auth.js';
import { ApiError } from '../../middleware/error.js';
import { sessionRoom, type RealtimeServer } from '../../realtime/types.js';
import {
  assertSessionMember,
  addSessionQuestion,
  createSession,
  deleteSession,
  emitQuestionAdded,
  emitQuestionFocus,
  emitQuestionPhase,
  emitSessionEnded,
  emitSessionStarted,
  endSession,
  focusQuestion,
  getSessionMemberIdentity,
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

/**
 * A factory, not a module-level Router, because F09's POST /:id/start
 * needs to broadcast on `io` after it succeeds.
 */
export function createSessionsRoutes(io: RealtimeServer): Router {
  const sessionsRoutes = Router();

  // F04: create draft session
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

  // Dashboard list
  sessionsRoutes.get('/', requireAuth, async (req, res, next) => {
    try {
      const userId = req.userId!;
      const sessions = await listSessionsForUser(userId);
      res.json(sessions);
    } catch (err) {
      next(err);
    }
  });

  // Get session with agenda
  sessionsRoutes.get<{ id: string }>('/:id', requireAuth, async (req, res, next) => {
    try {
      const userId = req.userId!;
      const session = await getSessionWithQuestions(req.params.id);
      if (!session) {
        throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');
      }
      await assertSessionMember(session.id, userId);
      res.json(session);
    } catch (err) {
      next(err);
    }
  });

  // F05: update draft
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

  // Delete draft or hide ended session
  sessionsRoutes.delete<{ id: string }>('/:id', requireAuth, async (req, res, next) => {
    try {
      const userId = req.userId!;
      await deleteSession({ sessionId: req.params.id, userId });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // F06: open session for joining
  sessionsRoutes.post<{ id: string }>('/:id/open', requireAuth, async (req, res, next) => {
    try {
      const leaderId = req.userId!;
      const session = await openSessionForJoining({ sessionId: req.params.id, leaderId });
      res.json(session);
    } catch (err) {
      next(err);
    }
  });

  // F09: start session
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

  // F25/F26: change question phase
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

  // Focus question
  sessionsRoutes.post<{ id: string }>('/:id/focus', requireAuth, async (req, res, next) => {
    try {
      const parsed = focusQuestionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ApiError(
          400,
          parsed.error.issues[0]?.message ?? 'Invalid focus',
          'VALIDATION_ERROR',
        );
      }

      const leaderId = req.userId!;
      const question = await focusQuestion({
        sessionId: req.params.id,
        questionId: parsed.data.questionId,
        leaderId,
      });
      emitQuestionFocus(io, req.params.id, question.id);
      res.json(question);
    } catch (err) {
      next(err);
    }
  });

  // Append a pending question to a live agenda. Leader-only; the client
  // sends the text and waits for `questionAdded` like it does for phase.
  sessionsRoutes.post<{ id: string }>('/:id/questions', requireAuth, async (req, res, next) => {
    try {
      const parsed = addSessionQuestionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ApiError(
          400,
          parsed.error.issues[0]?.message ?? 'Invalid question',
          'VALIDATION_ERROR',
        );
      }

      const question = await addSessionQuestion({
        sessionId: req.params.id,
        leaderId: req.userId!,
        text: parsed.data.text,
      });
      emitQuestionAdded(io, question);
      res.status(201).json(question);
    } catch (err) {
      next(err);
    }
  });

  // F32: end session
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

  // F07: leave session
  sessionsRoutes.post<{ id: string }>('/:id/leave', requireAuth, async (req, res, next) => {
    try {
      const userId = req.userId!;
      const identity = await getSessionMemberIdentity(req.params.id, userId);
      await leaveSession({ sessionId: req.params.id, userId });

      if (identity) {
        const room = sessionRoom(req.params.id);
        const sockets = await io.in(room).fetchSockets();
        for (const socket of sockets) {
          if (socket.data.user?.id === userId) {
            socket.data.sessionId = null;
            await socket.leave(room);
          }
        }
        io.to(room).emit('memberLeft', { user: identity });
      }

      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // Resolve code preview
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

  // Join session
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

  // Members list
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