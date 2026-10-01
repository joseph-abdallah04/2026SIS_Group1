import { Router, type Request } from 'express';

import { ApiError } from '../../middleware/error.js';
import { requireAuth } from '../../middleware/auth.js';
import { assertSessionMember } from '../sessions/index.js';
import { getBoardForSession, listAuthoredProposals } from './service.js';

/** Long enough for a cuid, short enough that a query string cannot smuggle a document. */
const QUESTION_ID_MAX = 128;

/**
 * The optional question a board read is asking for.
 *
 * Absent means the focused question, which is what the live board loads.
 * Present must be one string: Express turns a repeated `questionId` into an
 * array, and that array must not be forwarded as a filter.
 */
function questionIdFromQuery(query: Request['query']): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(query, 'questionId')) return undefined;

  const raw = query.questionId;
  if (typeof raw !== 'string') {
    throw new ApiError(400, 'questionId must be a single value', 'INVALID_QUESTION');
  }

  const questionId = raw.trim();
  if (questionId.length === 0 || questionId.length > QUESTION_ID_MAX) {
    throw new ApiError(400, 'questionId must be a valid question id', 'INVALID_QUESTION');
  }
  return questionId;
}

export const pinboardRoutes = Router();

// docs/06 §6: pinboard owns `/api/sessions/:id/proposals*`; the sessions owner
// owns the rest of `/api/sessions/:id`. Returns one question's board — the
// focused question, or `?questionId=` once the session has ended — so one
// request renders the page.
//
// A board is member-scoped data (docs/02 §8.3), so both halves of the check
// now run for real: `requireAuth` establishes who is asking, and
// `assertSessionMember` — reached through the sessions module's public surface
// — establishes that they belong to this session. This used to be open in
// development, back when neither half existed; a session id is a shareable URL
// fragment rather than a secret, so being able to name one was never meant to
// be enough on its own.
pinboardRoutes.get<{ sessionId: string }>(
  '/:sessionId/proposals',
  requireAuth,
  async (req, res, next) => {
    try {
      await assertSessionMember(req.params.sessionId, req.userId!);
      const questionId = questionIdFromQuery(req.query);
      const board = await getBoardForSession(req.params.sessionId, questionId);
      res.json(board);
    } catch (err) {
      next(err);
    }
  },
);

// Your own proposals across the whole session (F38), so an earlier one can be
// reused on the question now in front of you.
//
// The author is the authenticated user, never a parameter: this returns one
// person's history, and letting a client name whose history it wants would
// make it a different endpoint with a different rule behind it. Membership is
// checked exactly as it is for the board itself.
pinboardRoutes.get<{ sessionId: string }>(
  '/:sessionId/proposals/mine',
  requireAuth,
  async (req, res, next) => {
    try {
      await assertSessionMember(req.params.sessionId, req.userId!);
      res.json(
        await listAuthoredProposals({ sessionId: req.params.sessionId, authorId: req.userId! }),
      );
    } catch (err) {
      next(err);
    }
  },
);
