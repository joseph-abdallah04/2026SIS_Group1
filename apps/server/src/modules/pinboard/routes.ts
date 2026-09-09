import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { assertSessionMember } from '../sessions/index.js';
import { getBoardForSession, listAuthoredProposals } from './service.js';

export const pinboardRoutes = Router();

// docs/06 §6: pinboard owns `/api/sessions/:id/proposals*`; the sessions owner
// owns the rest of `/api/sessions/:id`. Returns the whole board snapshot —
// active question plus its proposals — so one request renders the page.
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
      const board = await getBoardForSession(req.params.sessionId);
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
